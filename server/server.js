const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Never cache any API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const MONGO_URI = 'mongodb+srv://ankit917379_db_user:LasarFood2026@lasar-cluster.hlz0irb.mongodb.net/lasarDB?retryWrites=true&w=majority&appName=lasar-cluster';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 MongoDB Atlas Connected Successfully!'))
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

// Safe query builder that never causes Mongoose CastError
function buildOrderQuery(id) {
  const clean = String(id || '').trim();
  if (/^[0-9a-fA-F]{24}$/.test(clean)) {
    return { $or: [{ orderId: clean }, { _id: clean }] };
  }
  return { orderId: clean };
}

// 1. Bulk Clear All Rejected Orders
app.all('/api/clear-all-rejected-orders', async (req, res) => {
  try {
    const result = await Order.deleteMany({
      $or: [
        { status: 'Rejected' },
        { status: 'Cancelled' },
        { cancellationReason: { $exists: true, $ne: '' } }
      ]
    });
    console.log(`🧹 Purged all rejected orders. Deleted: ${result.deletedCount}`);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('❌ Error purging rejected orders:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Create New Customer Order
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, phone, deliveryArea, address, landmark, items, totalAmount } = req.body;
    const cleanPhone = String(phone || '').trim().replace(/\D/g, '');

    const order = new Order({
      orderId: 'LSR-' + Math.floor(100000 + Math.random() * 900000),
      customerName: (customerName || 'Customer').trim(),
      phone: cleanPhone,
      deliveryArea: (deliveryArea || 'Area not specified').trim(),
      address: (address || '').trim(),
      landmark: (landmark || '').trim(),
      items: Array.isArray(items) ? items : [],
      totalAmount: Number(totalAmount) || 0,
      paymentConfirmed: false,
      deliverySlot: '',
      status: 'Pending Verification',
      otp: Math.floor(1000 + Math.random() * 9000)
    });

    const savedOrder = await order.save();
    console.log(`✅ Order Saved: #${savedOrder.orderId} for ${savedOrder.phone}`);
    return res.status(201).json({ success: true, order: savedOrder });
  } catch (err) {
    console.error('❌ Order Save Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Admin Approves Payment & Confirms Order
app.patch('/api/orders/:id/approve', async (req, res) => {
  try {
    const { deliverySlot } = req.body;
    const query = buildOrderQuery(req.params.id);
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
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    console.log(`✅ Approved Order #${updatedOrder.orderId}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('❌ Approve Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Admin Rejects Payment / Unpaid Order
app.patch('/api/orders/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const query = buildOrderQuery(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      query,
      { 
        $set: { 
          paymentConfirmed: false, 
          status: 'Rejected',
          cancellationReason: reason || 'Payment was not credited to bank account'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    console.log(`❌ Rejected Order #${updatedOrder.orderId}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('❌ Reject Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Update Kitchen Status (Preparing, Out for Delivery, Delivered)
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const query = buildOrderQuery(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      query,
      { $set: { status } },
      { new: true }
    );
    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Delete a single order permanently
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const query = buildOrderQuery(req.params.id);
    const result = await Order.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Customer Order History by Phone
app.get('/api/orders/user/:phone', async (req, res) => {
  try {
    const cleanPhone = String(req.params.phone).trim().replace(/\D/g, '');
    const userOrders = await Order.find({ phone: cleanPhone }).sort({ createdAt: -1 });
    return res.json(userOrders);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get All Orders for Admin Dashboard
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
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
    return res.status(201).json({ success: true, item: dish });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/menu', async (req, res) => {
  try {
    const approvedDishes = await MenuItem.find({ auditStatus: 'approved' }).sort({ createdAt: -1 });
    return res.json(approvedDishes);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/audit-queue', async (req, res) => {
  try {
    const pendingDishes = await MenuItem.find({ auditStatus: 'pending_audit' }).sort({ createdAt: -1 });
    const approvedDishes = await MenuItem.find({ auditStatus: 'approved' }).sort({ createdAt: -1 });
    const rejectedDishes = await MenuItem.find({ auditStatus: 'rejected' }).sort({ createdAt: -1 });
    return res.json({ pendingDishes, approvedDishes, rejectedDishes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/audit-decision', async (req, res) => {
  try {
    const { dishId, decision, feedback } = req.body;
    const dish = await MenuItem.findById(dishId);
    if (!dish) return res.status(404).json({ success: false, error: 'Dish not found' });

    dish.auditStatus = decision;
    dish.adminFeedback = feedback || (decision === 'approved' ? 'Approved by Admin' : 'Quality rejected');
    await dish.save();

    return res.json({ success: true, dish });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/dish/:id', async (req, res) => {
  try {
    const { price, auditStatus } = req.body;
    const updateFields = {};
    if (price !== undefined) updateFields.price = Number(price);
    if (auditStatus !== undefined) updateFields.auditStatus = auditStatus;

    const updatedDish = await MenuItem.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
    if (!updatedDish) return res.status(404).json({ success: false, error: 'Dish not found' });
    return res.json({ success: true, dish: updatedDish });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/dish/:id', async (req, res) => {
  try {
    const deletedDish = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deletedDish) return res.status(404).json({ success: false, error: 'Dish not found' });
    return res.json({ success: true, message: 'Dish deleted permanently' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 LASAR API running on port ${PORT}`));