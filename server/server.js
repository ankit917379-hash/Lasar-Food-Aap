const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const MONGO_URI = 'mongodb+srv://ankit917379_db_user:LasarFood2026@lasar-cluster.hlz0irb.mongodb.net/lasarDB?retryWrites=true&w=majority&appName=lasar-cluster';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 MongoDB Atlas Connected!'))
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
  auditStatus: { type: String, default: 'pending_audit' },
  adminFeedback: { type: String, default: 'Awaiting inspection' },
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  deliveryArea: { type: String, default: 'Area not specified' },
  address: { type: String, required: true },
  landmark: { type: String, default: '' },
  items: Array,
  totalAmount: Number,
  paymentConfirmed: { type: Boolean, default: false },
  deliverySlot: { type: String, default: '' },
  status: { type: String, default: 'Pending Verification' },
  cancellationReason: { type: String, default: '' },
  otp: Number,
  createdAt: { type: Date, default: Date.now }
});

const MenuItem = mongoose.model('MenuItem', MenuItemSchema);
const Order = mongoose.model('Order', OrderSchema);

app.get('/', (req, res) => {
  res.send('LASAR Cloud Kitchen API Server Running');
});

// Helper for finding order
const findOrder = (idParam) => {
  if (mongoose.Types.ObjectId.isValid(idParam)) {
    return { $or: [{ orderId: idParam }, { _id: idParam }] };
  }
  return { orderId: idParam };
};

// 1. Create Order
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, phone, deliveryArea, address, landmark, items, totalAmount } = req.body;
    const cleanPhone = String(phone).trim().replace(/\D/g, '');

    const order = new Order({
      orderId: 'LSR-' + Math.floor(100000 + Math.random() * 900000),
      customerName: customerName.trim(),
      phone: cleanPhone,
      deliveryArea: deliveryArea || 'Area not specified',
      address: address.trim(),
      landmark: landmark || '',
      items,
      totalAmount,
      paymentConfirmed: false,
      deliverySlot: '',
      status: 'Pending Verification',
      otp: Math.floor(1000 + Math.random() * 9000)
    });

    const saved = await order.save();
    console.log(`✅ Order SAVED in MongoDB: #${saved.orderId} for phone: ${saved.phone}`);
    res.status(201).json({ success: true, order: saved });
  } catch (err) {
    console.error('❌ Error saving order:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Admin Confirms Payment & Sets Time Slot
app.patch('/api/orders/:id/approve', async (req, res) => {
  try {
    const { deliverySlot } = req.body;
    const query = findOrder(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      query,
      { 
        $set: { 
          paymentConfirmed: true, 
          status: 'Confirmed & Preparing',
          deliverySlot: deliverySlot || '30-40 mins'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });
    console.log(`✅ Admin Approved Order #${updatedOrder.orderId}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin Rejects Unpaid Order (Status updated to Rejected, NEVER DELETED)
app.patch('/api/orders/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const query = findOrder(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      query,
      { 
        $set: { 
          paymentConfirmed: false, 
          status: 'Rejected',
          cancellationReason: reason || 'Payment was not credited to Admin bank account'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });
    console.log(`❌ Admin Rejected Order #${updatedOrder.orderId}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Kitchen Status (Food is being prepared, Out for Delivery, Delivered)
// NOTE: Delivered orders remain permanently in MongoDB so customers keep their history
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const query = findOrder(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      query,
      { $set: { status } },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found' });
    console.log(`📦 Status changed for #${updatedOrder.orderId} to ${status}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Delete specific order completely
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const query = findOrder(req.params.id);
    await Order.deleteMany(query);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Clear All Rejected Orders from Database
app.post('/api/orders/clear-all-rejected', async (req, res) => {
  try {
    const result = await Order.deleteMany({
      $or: [{ status: 'Rejected' }, { status: 'Cancelled' }]
    });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Customer Orders History by Phone (Matches exact 10-digit number)
app.get('/api/orders/user/:phone', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    const cleanPhone = String(req.params.phone).trim().replace(/\D/g, '');
    const userOrders = await Order.find({ phone: cleanPhone }).sort({ createdAt: -1 });
    res.json(userOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get All Active Orders for Admin
app.get('/api/orders', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
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
app.listen(PORT, () => console.log(`🚀 LASAR API running on port ${PORT}`));