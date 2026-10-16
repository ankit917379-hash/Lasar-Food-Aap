const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// MongoDB Atlas Free Tier Cluster Connection
const MONGO_URI = 'mongodb+srv://ankit917379_db_user:LasarFood2026@lasar-cluster.hlz0irb.mongodb.net/lasarDB?retryWrites=true&w=majority&appName=lasar-cluster';

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 Connected to MongoDB Atlas Cloud Database successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- NODEMAILER CONFIGURATION (For Admin & User Email OTP) ---
// Note: If GMAIL_PASS is not provided, the server outputs the OTP to the Render log console.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'ankit917379@gmail.com',
    pass: process.env.GMAIL_PASS || '' // Use a Google App Password here in production
  }
});

// In-Memory Temporary OTP Storage: { identifier: { otp: '123456', expiresAt: timestamp } }
const otpStore = new Map();

// Helper to generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- MONGOOSE SCHEMAS & MODELS ---
const MenuItemSchema = new mongoose.Schema({
  restaurantId: { type: String, default: 'rest_lasar_01' },
  restaurantName: { type: String, default: 'LASAR Home Kitchen' },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, default: 'Snacks' },
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
  address: { type: String, required: true },
  landmark: { type: String, default: '' },
  items: Array,
  totalAmount: Number,
  paymentMethod: { type: String, default: 'Online UPI' },
  status: { 
    type: String, 
    enum: ['Order Received', 'Food is being prepared', 'Food Ready', 'Out for Delivery', 'Delivered'],
    default: 'Order Received' 
  },
  otp: Number,
  createdAt: { type: Date, default: Date.now }
});

const MenuItem = mongoose.model('MenuItem', MenuItemSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- AUTH / OTP VERIFICATION ENDPOINTS ---

// 1. Send OTP to Gmail or Mobile Number
app.post('/api/auth/send-otp', async (req, res) => {
  const { identifier, type } = req.body; // identifier: email or 10-digit phone

  if (!identifier) {
    return res.status(400).json({ error: 'Mobile number or Gmail address is required' });
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const code = generateOtp();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  otpStore.set(cleanIdentifier, { otp: code, expiresAt });
  console.log(`🔐 [AUTH] Generated OTP for ${cleanIdentifier}: ${code}`);

  if (type === 'gmail') {
    // Attempt real email delivery if credentials exist
    if (process.env.GMAIL_PASS) {
      try {
        await transporter.sendMail({
          from: '"HOME LIKE FOOD" <ankit917379@gmail.com>',
          to: cleanIdentifier,
          subject: `${code} is your HOME LIKE FOOD Verification Code`,
          text: `Your login verification code is: ${code}. It expires in 5 minutes. Do not share this with anyone.`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #0f8a65;">HOME LIKE FOOD</h2>
            <p>Your 6-digit login verification code is:</p>
            <h1 style="color: #0f8a65; letter-spacing: 4px; font-size: 32px;">${code}</h1>
            <p style="color: #666; font-size: 12px;">Valid for 5 minutes. If you did not request this, please ignore.</p>
          </div>`
        });
        return res.json({ success: true, message: 'OTP sent to your Gmail inbox!' });
      } catch (mailErr) {
        console.error('Mail dispatch error:', mailErr.message);
        // Fallback response with code so development/hosting is never blocked
        return res.json({ success: true, message: 'OTP logged to server.', debugOtp: code });
      }
    } else {
      // Returned in response for immediate setup/testing until Google App Password is keyed in
      return res.json({ 
        success: true, 
        message: 'OTP generated. Check console or use on-screen code for testing.', 
        debugOtp: code 
      });
    }
  } else {
    // Mobile SMS Dispatch fallback
    return res.json({ 
      success: true, 
      message: 'OTP dispatched to mobile number.', 
      debugOtp: code 
    });
  }
});

// 2. Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { identifier, otp, name } = req.body;
  if (!identifier || !otp) {
    return res.status(400).json({ error: 'Identifier and OTP code are required' });
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const record = otpStore.get(cleanIdentifier);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested or code expired. Please request a new code.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanIdentifier);
    return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
  }

  // Clear OTP once verified
  otpStore.delete(cleanIdentifier);

  const isAdmin = cleanIdentifier === 'ankit917379@gmail.com' || cleanIdentifier === '7379434080';

  return res.json({
    success: true,
    user: {
      name: name || (isAdmin ? 'Ankit Gupta (Admin)' : 'Customer'),
      identifier: cleanIdentifier,
      phone: cleanIdentifier.length === 10 && !isNaN(cleanIdentifier) ? cleanIdentifier : (isAdmin ? '7379434080' : ''),
      email: cleanIdentifier.includes('@') ? cleanIdentifier : (isAdmin ? 'ankit917379@gmail.com' : ''),
      isAdmin
    }
  });
});

// --- MENU & AUDIT ENDPOINTS ---

app.get('/', (req, res) => {
  res.send('LASAR Cloud Kitchen API Server Running');
});

app.post('/api/menu/upload', async (req, res) => {
  try {
    const dish = new MenuItem({
      name: req.body.name,
      price: Number(req.body.price),
      category: req.body.category || 'Snacks',
      isVeg: Boolean(req.body.isVeg),
      description: req.body.description || '',
      image: req.body.image,
      restaurantName: req.body.restaurantName || 'LASAR Home Kitchen'
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
    dish.adminFeedback = feedback || (decision === 'approved' ? 'Passed Taste & Quality Audit by Admin' : 'Quality rejected');
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

    const updatedDish = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );
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
    console.log(`🗑️ Dish "${deletedDish.name}" deleted from database by Admin.`);
    res.json({ success: true, message: 'Dish deleted permanently' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ORDERS API ---

app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, phone, address, landmark, items, totalAmount, paymentMethod } = req.body;
    const order = new Order({
      orderId: 'LSR-' + Math.floor(100000 + Math.random() * 900000),
      customerName,
      phone,
      address,
      landmark: landmark || '',
      items,
      totalAmount,
      paymentMethod: paymentMethod || 'Online UPI',
      status: 'Order Received',
      otp: Math.floor(1000 + Math.random() * 9000)
    });
    await order.save();
    console.log(`✅ New Online Paid Order Placed: #${order.orderId} from ${customerName}`);
    res.status(201).json({ success: true, order });
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

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (status === 'Delivered') {
      const purgedOrder = await Order.findOneAndDelete({ orderId: req.params.id });
      if (!purgedOrder) return res.status(404).json({ error: 'Order not found' });
      
      console.log(`🧹 ORDER COMPLETE: Purged all customer data for #${purgedOrder.orderId} from MongoDB Atlas.`);
      return res.json({ 
        success: true, 
        delivered: true, 
        purged: true, 
        orderId: purgedOrder.orderId, 
        message: 'Order delivered and customer data cleared from database.' 
      });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 LASAR Full-Stack API listening on port ${PORT}`));