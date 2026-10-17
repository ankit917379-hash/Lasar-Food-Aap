const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const MONGO_URI = 'mongodb+srv://ankit917379_db_user:LasarFood2026@lasar-cluster.hlz0irb.mongodb.net/lasarDB?retryWrites=true&w=majority&appName=lasar-cluster';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 Connected to MongoDB Atlas Cloud Database successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const MenuItemSchema = new mongoose.Schema({
  restaurantId: { type: String, default: 'rest_lasar_01' },
  restaurantName: { type: String, default: 'LASAR Cloud Kitchen' },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, default: 'Thali & Meals' },
  isVeg: { type: Boolean, default: true },
  description: { type: String, default: '' },
  image: { type: String, default: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80' },
  auditStatus: { type: String, enum: ['pending_audit', 'approved', 'rejected'], default: 'pending_audit' },
  adminFeedback: { type: String, default: 'Awaiting taste & hygiene quality inspection' },
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  deliveryArea: { type: String, default: 'Area not specified' },
  address: { type: String, required: true },
  landmark: { type: String, default: '' },
  items: Array,
  totalAmount: Number,
  paymentConfirmed: { type: Boolean, default: false },
  deliverySlot: { type: String, default: '' },
  status: { 
    type: String, 
    enum: ['Payment Verification Pending', 'Order Placed', 'Food is being prepared', 'Food Ready', 'Out for Delivery', 'Delivered', 'Cancelled'],
    default: 'Payment Verification Pending' 
  },
  otp: Number,
  createdAt: { type: Date, default: Date.now }
});

const MenuItem = mongoose.model('MenuItem', MenuItemSchema);
const Order = mongoose.model('Order', OrderSchema);

app.get('/', (req, res) => {
  res.send('LASAR Cloud Kitchen API Server Running');
});

// Create Order (Enters as Pending Verification)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, phone, deliveryArea, address, landmark, items, totalAmount } = req.body;

    const order = new Order({
      orderId: 'LSR-' + Math.floor(100000 + Math.random() * 900000),
      customerName,
      phone,
      deliveryArea: deliveryArea || 'Area not specified',
      address,
      landmark: landmark || '',
      items,
      totalAmount,
      paymentConfirmed: false,
      deliverySlot: '',
      status: 'Payment Verification Pending',
      otp: Math.floor(1000 + Math.random() * 9000)
    });
    await order.save();
    console.log(`⏳ Awaiting Bank Verification: #${order.orderId} for ₹${totalAmount}`);
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin confirms bank credit & sets delivery time
app.patch('/api/orders/:id/verify-payment', async (req, res) => {
  try {
    const { deliverySlot } = req.body;
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: req.params.id },
      { 
        $set: { 
          paymentConfirmed: true, 
          status: 'Order Placed',
          deliverySlot: deliverySlot || '30-40 mins'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });
    console.log(`✅ Admin verified bank credit for #${updatedOrder.orderId}! Slot: ${deliverySlot}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct status update or permanent delete
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    // Purge cancelled, fake, or delivered orders directly from MongoDB
    if (status === 'Delivered' || status === 'Delete' || status === 'Cancelled') {
      const purgedOrder = await Order.findOneAndDelete({ orderId: req.params.id });
      if (!purgedOrder) return res.status(404).json({ error: 'Order not found' });
      console.log(`🧹 Purged order #${purgedOrder.orderId} from database.`);
      return res.json({ success: true, delivered: true, purged: true, orderId: purgedOrder.orderId });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: req.params.id },
      { $set: { status } },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Menu endpoints
app.post('/api/menu/upload', async (req, res) => {
  try {
    const dish = new MenuItem({
      name: req.body.name,
      price: Number(req.body.price),
      category: req.body.category || 'Thali & Meals',
      isVeg: Boolean(req.body.isVeg),
      description: req.body.description || '',
      image: req.body.image,
      restaurantName: req.body.restaurantName || 'LASAR Cloud Kitchen'
    });
    await dish.save();
    res.status(201).json({ success: true, item: dish });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    const approvedDishes = await MenuItem.find({ auditStatus: 'approved' }).sort({ createdAt: -1 });
    res.json(approvedDishes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit-queue', async (req, res) => {
  try {
    const pendingDishes = await MenuItem.find({ auditStatus: 'pending_audit' }).sort({ createdAt: -1 });
    const approvedDishes = await MenuItem.find({ auditStatus: 'approved' }).sort({ createdAt: -1 });
    const rejectedDishes = await MenuItem.find({ auditStatus: 'rejected' }).sort({ createdAt: -1 });
    res.json({ pendingDishes, approvedDishes, rejectedDishes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/audit-decision', async (req, res) => {
  try {
    const { dishId, decision, feedback } = req.body;
    const dish = await MenuItem.findById(dishId);
    if (!dish) return res.status(404).json({ error: 'Dish not found' });

    dish.auditStatus = decision;
    dish.adminFeedback = feedback || (decision === 'approved' ? 'Approved by Admin' : 'Quality rejected');
    await dish.save();

    res.json({ success: true, dish });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/dish/:id', async (req, res) => {
  try {
    const { price, auditStatus } = req.body;
    const updateFields = {};
    if (price !== undefined) updateFields.price = Number(price);
    if (auditStatus !== undefined) updateFields.auditStatus = auditStatus;

    const updatedDish = await MenuItem.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
    if (!updatedDish) return res.status(404).json({ error: 'Dish not found' });
    res.json({ success: true, dish: updatedDish });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/dish/:id', async (req, res) => {
  try {
    const deletedDish = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deletedDish) return res.status(404).json({ error: 'Dish not found' });
    res.json({ success: true, message: 'Dish deleted permanently' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 LASAR Full-Stack API listening on port ${PORT}`));