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

// Helper: Safely query without CastError
const getOrderFilter = (id) => {
  const cleanId = String(id || '').trim();
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    return { $or: [{ orderId: cleanId }, { _id: new mongoose.Types.ObjectId(cleanId) }] };
  }
  return { orderId: cleanId };
};

// 1. BULK PURGE REJECTED ORDERS
const clearAllRejected = async (req, res) => {
  try {
    const result = await Order.deleteMany({
      $or: [
        { status: 'Rejected' },
        { status: 'Cancelled' },
        { status: { $regex: /reject|cancel/i } }
      ]
    });
    console.log(`🧹 Purged all rejected orders. Count: ${result.deletedCount}`);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('❌ Error clearing rejected orders:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
app.all('/api/clear-all-rejected-orders', clearAllRejected);

// 2. CREATE ORDER
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, phone, deliveryArea, address, landmark, items, totalAmount } = req.body;
    const cleanPhone = String(phone || '').trim().replace(/\D/g, '').slice(-10);

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
    console.error('❌ Error creating order:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. ADMIN APPROVE (Supports POST & PATCH to prevent Network Drop)
const approveHandler = async (req, res) => {
  try {
    const { deliverySlot } = req.body;
    const filter = getOrderFilter(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      filter,
      { 
        $set: { 
          paymentConfirmed: true, 
          status: 'Confirmed & Preparing',
          deliverySlot: deliverySlot || '30-40 mins'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ success: false, error: 'Order not found' });
    console.log(`✅ Approved Order #${updatedOrder.orderId}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('❌ Error approving order:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/orders/:id/approve', approveHandler);
app.patch('/api/orders/:id/approve', approveHandler);

// 4. ADMIN REJECT (Supports POST & PATCH)
const rejectHandler = async (req, res) => {
  try {
    const { reason } = req.body;
    const filter = getOrderFilter(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      filter,
      { 
        $set: { 
          paymentConfirmed: false, 
          status: 'Rejected',
          cancellationReason: reason || 'Payment was not credited to bank account'
        } 
      },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ success: false, error: 'Order not found' });
    console.log(`❌ Rejected Order #${updatedOrder.orderId}`);
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('❌ Error rejecting order:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/orders/:id/reject', rejectHandler);
app.patch('/api/orders/:id/reject', rejectHandler);

// 5. UPDATE STATUS (Cooking, Out for Delivery, Delivered)
const statusHandler = async (req, res) => {
  try {
    const { status } = req.body;
    const filter = getOrderFilter(req.params.id);
    const updatedOrder = await Order.findOneAndUpdate(
      filter,
      { $set: { status } },
      { new: true }
    );
    if (!updatedOrder) return res.status(404).json({ success: false, error: 'Order not found' });
    return res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('❌ Error updating order status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/orders/:id/status', statusHandler);
app.patch('/api/orders/:id/status', statusHandler);

// 6. DELETE SINGLE ORDER
const deleteSingleHandler = async (req, res) => {
  try {
    const filter = getOrderFilter(req.params.id);
    const result = await Order.deleteMany(filter);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
app.post('/api/orders/:id/delete', deleteSingleHandler);
app.delete('/api/orders/:id', deleteSingleHandler);

// 7. GET USER ORDERS HISTORY (Phone Number Match)
app.get('/api/orders/user/:phone', async (req, res) => {
  try {
    const cleanPhone = String(req.params.phone || '').trim().replace(/\D/g, '').slice(-10);
    const userOrders = await Order.find({
      phone: { $regex: cleanPhone + '$' }
    }).sort({ createdAt: -1 });
    return res.json(userOrders);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. GET ALL ORDERS FOR ADMIN DASHBOARD
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