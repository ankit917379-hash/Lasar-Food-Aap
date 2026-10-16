import React, { useState, useEffect } from 'react';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://lasar-food-aap.onrender.com';

const ADMIN_EMAIL = 'ankit917379@gmail.com';
const ADMIN_PHONE = '7379434080';
const ADMIN_UPI = 'ankit917379@okhdfcbank';

const ADMIN_QR_CODE_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(`upi://pay?pa=${ADMIN_UPI}&pn=Ankit%20Ankit&cu=INR`);

export default function App() {
  // Authentication State
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('lasar_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Login & OTP State
  const [loginMethod, setLoginMethod] = useState('mobile'); // 'mobile' | 'gmail'
  const [loginPhone, setLoginPhone] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false); // false: enter details, true: enter 6-digit code
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  // App Navigation & Data State
  const [activeTab, setActiveTab] = useState('customer');
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [auditQueue, setAuditQueue] = useState({ pendingDishes: [], approvedDishes: [], rejectedDishes: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVegOnly, setFilterVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Checkout & Order Form State
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    address: '',
    landmark: '',
    transactionRef: ''
  });
  const [activeCustomerOrder, setActiveCustomerOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  // Partner Dish Upload Form
  const [newDish, setNewDish] = useState({
    name: '',
    price: '',
    category: 'Snacks',
    isVeg: true,
    description: '',
    image: '',
    restaurantName: 'LASAR Home Kitchen'
  });

  const categories = ['All', 'Thali & Meals', 'Curry & Sabzi', 'Breads & Rice', 'Snacks', 'Desserts'];
  
  // Verification check for Admin privileges
  const isAdmin = user && (user.email === ADMIN_EMAIL || user.phone === ADMIN_PHONE || user.isAdmin);

  useEffect(() => {
    if (user) {
      setCustomerForm(prev => ({
        ...prev,
        name: user.name || prev.name,
        phone: user.phone || prev.phone
      }));
    }
  }, [user]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/menu`);
      if (res.ok) setApiConnected(true);
    } catch {
      setApiConnected(false);
    }
  };

  const fetchMenu = () => {
    fetch(`${API_BASE}/api/menu`)
      .then(res => res.json())
      .then(data => setMenu(Array.isArray(data) ? data : []))
      .catch(err => console.error('Menu load error:', err));
  };

  const fetchAuditData = () => {
    if (!isAdmin) return;
    fetch(`${API_BASE}/api/admin/audit-queue`)
      .then(res => res.json())
      .then(data => {
        if (data && data.pendingDishes) setAuditQueue(data);
      })
      .catch(err => console.error('Audit queue error:', err));
  };

  const fetchOrders = () => {
    fetch(`${API_BASE}/api/orders`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setOrders(data);
          if (activeCustomerOrder) {
            const exists = data.find(o => o.orderId === activeCustomerOrder.orderId);
            if (!exists) {
              setActiveCustomerOrder(null);
            } else {
              setActiveCustomerOrder(exists);
            }
          }
        }
      })
      .catch(err => console.error('Orders error:', err));
  };

  useEffect(() => {
    checkHealth();
    if (user) {
      fetchMenu();
      fetchOrders();
      if (isAdmin) fetchAuditData();

      const interval = setInterval(() => {
        fetchOrders();
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin, activeCustomerOrder?.orderId]);

  // Request 6-digit OTP from Server
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!loginName.trim()) return alert('Please enter your full name');

    let identifier = '';
    if (loginMethod === 'mobile') {
      const cleanedPhone = loginPhone.trim();
      if (!/^\d{10}$/.test(cleanedPhone)) {
        return alert('Please enter a valid 10-digit mobile number');
      }
      identifier = cleanedPhone;
    } else {
      const cleanedEmail = loginEmail.trim().toLowerCase();
      if (!cleanedEmail || !cleanedEmail.includes('@gmail.com')) {
        return alert('Please enter a valid @gmail.com address');
      }
      identifier = cleanedEmail;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, type: loginMethod })
      });
      const data = await res.json();
      if (res.ok) {
        setOtpStep(true);
        if (data.debugOtp) {
          setOtpNotice(`Code sent! (Demo preview: ${data.debugOtp})`);
        } else {
          setOtpNotice(`Verification code sent to ${identifier}. Check your inbox / messages.`);
        }
      } else {
        alert(data.error || 'Failed to dispatch code');
      }
    } catch (err) {
      alert('Error requesting code: ' + err.message);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify the submitted OTP with Server
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!enteredOtp || enteredOtp.length !== 6) {
      return alert('Please enter the complete 6-digit verification code');
    }

    const identifier = loginMethod === 'mobile' ? loginPhone.trim() : loginEmail.trim().toLowerCase();

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          otp: enteredOtp,
          name: loginName.trim()
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setUser(data.user);
        localStorage.setItem('lasar_user', JSON.stringify(data.user));
        setOtpStep(false);
        setEnteredOtp('');
        setOtpNotice('');
      } else {
        alert(data.error || 'Invalid verification code');
      }
    } catch (err) {
      alert('Verification failed: ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lasar_user');
    setUser(null);
    setCart([]);
    setActiveCustomerOrder(null);
    setActiveTab('customer');
    setOtpStep(false);
    setEnteredOtp('');
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const result = await res.json();
      
      if (result.purged) {
        alert(`Order #${orderId} Delivered! Customer details wiped permanently to free storage.`);
        setOrders(prev => prev.filter(o => o.orderId !== orderId));
        if (activeCustomerOrder?.orderId === orderId) {
          setActiveCustomerOrder(null);
        }
      } else {
        fetchOrders();
      }
    } catch (err) {
      alert('Error updating status: ' + err.message);
    }
  };

  const handleAuditDecision = async (dishId, decision) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/audit-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId,
          decision,
          feedback: decision === 'approved' ? 'Passed Taste & Quality Audit by Admin' : 'Quality rejected'
        })
      });
      if (res.ok) {
        alert(decision === 'approved' ? 'Dish Approved & Added to Customer Menu!' : 'Dish Rejected');
        fetchAuditData();
        fetchMenu();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleUpdatePrice = async (dishId, currentPrice) => {
    const newPrice = window.prompt('Enter new price (₹):', currentPrice);
    if (!newPrice || isNaN(newPrice) || Number(newPrice) <= 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/dish/${dishId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: Number(newPrice) })
      });
      if (res.ok) {
        alert(`Price updated to ₹${newPrice}!`);
        fetchAuditData();
        fetchMenu();
      }
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleDeleteDish = async (dishId, dishName) => {
    if (!window.confirm(`Admin: Permanently delete "${dishName}" from database?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/dish/${dishId}`, { method: 'DELETE' });
      if (res.ok) {
        alert(`"${dishName}" deleted successfully!`);
        fetchAuditData();
        fetchMenu();
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setNewDish(prev => ({ ...prev, image: compressedBase64 }));
      };
    };
    reader.readAsDataURL(file);
  };

  const handlePartnerUpload = async (e) => {
    e.preventDefault();
    if (!newDish.name || !newDish.price) return alert('Please enter dish name and price');

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/menu/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newDish,
          price: Number(newDish.price),
          image: newDish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'
        })
      });

      if (res.ok) {
        alert('🎉 Dish uploaded! Sent to Master Admin Taste Queue.');
        setNewDish({ name: '', price: '', category: 'Snacks', isVeg: true, description: '', image: '', restaurantName: 'LASAR Home Kitchen' });
        fetchAuditData();
        setActiveTab('admin');
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addToCart = (dish) => {
    const key = dish._id || dish.id;
    const existing = cart.find(item => (item._id || item.id) === key);
    if (existing) {
      setCart(cart.map(i => (i._id || i.id) === key ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { ...dish, qty: 1 }]);
    }
  };

  const removeFromCart = (dishId) => {
    const existing = cart.find(item => (item._id || item.id) === dishId);
    if (!existing) return;
    if (existing.qty === 1) {
      setCart(cart.filter(item => (item._id || item.id) !== dishId));
    } else {
      setCart(cart.map(i => (i._id || i.id) === dishId ? { ...i, qty: i.qty - 1 } : i));
    }
  };

  const cartTotal = cart.reduce((acc, curr) => acc + curr.price * curr.qty, 0);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const cleanedPhone = customerForm.phone.trim();
    if (!/^\d{10}$/.test(cleanedPhone)) {
      return alert('Phone number must be exactly 10 digits.');
    }
    if (!customerForm.address.trim()) {
      return alert('Please enter delivery address.');
    }
    if (!customerForm.landmark.trim()) {
      return alert('Please enter nearest landmark / famous place.');
    }
    if (!customerForm.transactionRef.trim()) {
      return alert('Please complete the online UPI payment and enter the UPI UTR / Reference ID.');
    }

    try {
      const fullAddress = `${customerForm.address.trim()} (Landmark: ${customerForm.landmark.trim()})`;
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerForm.name.trim(),
          phone: cleanedPhone,
          address: fullAddress,
          landmark: customerForm.landmark.trim(),
          transactionRef: customerForm.transactionRef.trim(),
          paymentMethod: `Online UPI (${customerForm.transactionRef.trim()})`,
          items: cart,
          totalAmount: cartTotal
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 Payment Recorded & Order Placed Successfully!');
        setActiveCustomerOrder(data.order);
        setCart([]);
        setOrderModalOpen(false);
        fetchOrders();
      }
    } catch (err) {
      alert('Order placement failed: ' + err.message);
    }
  };

  const filteredDishes = menu.filter(dish => {
    const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (dish.description && dish.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesVeg = filterVegOnly ? dish.isVeg : true;
    const matchesCat = selectedCategory === 'All' ? true : dish.category === selectedCategory;
    return matchesSearch && matchesVeg && matchesCat;
  });

  const upiPayString = `upi://pay?pa=${ADMIN_UPI}&pn=Ankit%20Ankit&am=${cartTotal}&cu=INR&tn=Home%20Like%20Food%20Order`;

  // ==========================================
  // VIEW 1: GATEKEEPER 2-STEP OTP AUTHENTICATION
  // ==========================================
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f4f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 410, padding: 30, boxShadow: '0 8px 26px rgba(0,0,0,0.08)' }}>
          
          {/* Logo Badge */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', backgroundColor: '#0f8a65', color: '#ffffff', fontSize: 30, fontWeight: 900, boxShadow: '0 4px 12px rgba(15,138,101,0.3)', marginBottom: 8 }}>
              L
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#282c3f', letterSpacing: '2px', textTransform: 'uppercase' }}>
              HOME LIKE FOOD
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#7e808c' }}>
              {otpStep ? 'Enter 6-digit verification code' : 'Verify mobile number or Gmail to continue'}
            </p>
          </div>

          {!otpStep ? (
            /* STEP 1: ENTER CREDENTIALS & REQUEST CODE */
            <>
              <div style={{ display: 'flex', backgroundColor: '#f0f0f5', borderRadius: 10, padding: 4, marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={() => setLoginMethod('mobile')}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, backgroundColor: loginMethod === 'mobile' ? '#ffffff' : 'transparent', color: loginMethod === 'mobile' ? '#0f8a65' : '#686b78', boxShadow: loginMethod === 'mobile' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none' }}>
                  📱 Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('gmail')}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, backgroundColor: loginMethod === 'gmail' ? '#ffffff' : 'transparent', color: loginMethod === 'gmail' ? '#0f8a65' : '#686b78', boxShadow: loginMethod === 'gmail' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none' }}>
                  ✉️ Gmail
                </button>
              </div>

              <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3d4152', marginBottom: 4 }}>Full Name</label>
                  <input
                    required
                    type="text"
                    placeholder="Enter your name"
                    value={loginName}
                    onChange={e => setLoginName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {loginMethod === 'mobile' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3d4152', marginBottom: 4 }}>10-Digit Mobile Number</label>
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      placeholder="e.g. 7379434080"
                      value={loginPhone}
                      onChange={e => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3d4152', marginBottom: 4 }}>Gmail Address</label>
                    <input
                      required
                      type="email"
                      placeholder="e.g. ankit917379@gmail.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingOtp}
                  style={{ backgroundColor: '#0f8a65', color: '#ffffff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 6, boxShadow: '0 4px 12px rgba(15,138,101,0.25)' }}>
                  {isSendingOtp ? 'Sending Code...' : 'Send 6-Digit Verification Code →'}
                </button>
              </form>
            </>
          ) : (
            /* STEP 2: ENTER AND VALIDATE 6-DIGIT CODE */
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ backgroundColor: '#e5f7f1', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#0f8a65', fontWeight: 600, textAlign: 'center' }}>
                {otpNotice || `Code sent to ${loginMethod === 'mobile' ? loginPhone : loginEmail}`}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3d4152', marginBottom: 6 }}>
                  Enter 6-Digit Code
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="• • • • • •"
                  value={enteredOtp}
                  onChange={e => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', padding: '12px', borderRadius: 8, border: '2px solid #0f8a65', fontSize: 24, textAlign: 'center', letterSpacing: 8, fontWeight: 800, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{ backgroundColor: '#0f8a65', color: '#ffffff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,138,101,0.25)' }}>
                Verify & Enter Home Like Food
              </button>

              <button
                type="button"
                onClick={() => { setOtpStep(false); setEnteredOtp(''); }}
                style={{ background: 'none', border: 'none', color: '#7e808c', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                ← Change Number / Gmail
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 2: LOGGED IN INTERFACE (Admin Full / User Menu Only)
  // =========================================================
  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif', backgroundColor: '#f4f5f7', minHeight: '100vh', margin: 0, paddingBottom: 110 }}>
      
      {/* Header */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 850, margin: '0 auto', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Logo Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', backgroundColor: '#0f8a65', color: '#ffffff', fontSize: 22, fontWeight: 900, boxShadow: '0 2px 6px rgba(15,138,101,0.3)' }}>
              L
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#282c3f', letterSpacing: '1px', lineHeight: 1.1 }}>HOME LIKE FOOD</div>
              <div style={{ fontSize: 11, color: '#7e808c', marginTop: 1 }}>{user.name} {isAdmin ? '🛡️ (Admin)' : '👤'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isAdmin && (
              <>
                <button onClick={() => { setActiveTab('customer'); fetchMenu(); }} style={{ padding: '6px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, backgroundColor: activeTab === 'customer' ? '#0f8a65' : '#f0f0f5', color: activeTab === 'customer' ? '#fff' : '#3d4152' }}>
                  🍽️ Menu
                </button>
                <button onClick={() => { setActiveTab('partner'); fetchOrders(); }} style={{ padding: '6px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, backgroundColor: activeTab === 'partner' ? '#0f8a65' : '#f0f0f5', color: activeTab === 'partner' ? '#fff' : '#3d4152' }}>
                  👨‍🍳 Kitchen ({orders.length})
                </button>
                <button onClick={() => { setActiveTab('admin'); fetchAuditData(); fetchOrders(); }} style={{ padding: '6px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, backgroundColor: activeTab === 'admin' ? '#282c3f' : '#f0f0f5', color: activeTab === 'admin' ? '#fff' : '#3d4152' }}>
                  🛡️ Admin
                </button>
              </>
            )}

            <button onClick={handleLogout} style={{ padding: '6px 10px', borderRadius: 20, border: '1px solid #ffcdd2', backgroundColor: '#ffebee', color: '#c62828', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: apiConnected ? '#e5f7f1' : '#ffebee', padding: '3px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: apiConnected ? '#0f8a65' : '#c62828' }}>
          {apiConnected ? '● Online Delivery Active' : '○ Connecting to Backend...'}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 750, margin: '16px auto', padding: '0 14px' }}>

        {/* 1. CUSTOMER FOOD MENU (Visible to all logged-in users) */}
        {activeTab === 'customer' && (
          <div>
            {/* Live Order Status Bar */}
            {activeCustomerOrder && (
              <div style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: '6px solid #0f8a65', boxShadow: '0 3px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0f8a65', textTransform: 'uppercase' }}>Active Order</span>
                    <h3 style={{ margin: '2px 0', fontSize: 16, color: '#282c3f' }}>Order #{activeCustomerOrder.orderId}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#777' }}>Delivery OTP:</span>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f8a65' }}>{activeCustomerOrder.otp}</div>
                  </div>
                </div>

                <div style={{ margin: '12px 0 8px 0', backgroundColor: '#f0f0f5', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    backgroundColor: '#0f8a65', 
                    width: activeCustomerOrder.status === 'Order Received' ? '25%' :
                           activeCustomerOrder.status === 'Food is being prepared' ? '50%' :
                           activeCustomerOrder.status === 'Food Ready' ? '75%' : '90%',
                    transition: 'width 0.4s ease'
                  }}></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 800, color: '#282c3f' }}>Status: {activeCustomerOrder.status}</span>
                  <span style={{ color: '#777', fontSize: 12 }}>Delivering to: {activeCustomerOrder.address}</span>
                </div>
              </div>
            )}

            {/* Search & Filter Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Search food items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d4d5d9', fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={() => setFilterVegOnly(!filterVegOnly)}
                style={{ padding: '8px 14px', borderRadius: 10, border: `2px solid ${filterVegOnly ? '#0f8a65' : '#e0e0e0'}`, backgroundColor: filterVegOnly ? '#e5f7f1' : '#fff', color: filterVegOnly ? '#0f8a65' : '#3d4152', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                🟢 Veg Only
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 16 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #e0e0e0', backgroundColor: selectedCategory === cat ? '#0f8a65' : '#ffffff', color: selectedCategory === cat ? '#ffffff' : '#3d4152', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  {cat}
                </button>
              ))}
            </div>

            {filteredDishes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', backgroundColor: '#fff', borderRadius: 14 }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🍲</div>
                <h3 style={{ margin: '0 0 6px 0', color: '#282c3f', fontSize: 18 }}>No Live Dishes Right Now</h3>
                <p style={{ margin: 0, color: '#7e808c', fontSize: 13 }}>Items will appear here once approved by Admin.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 16, color: '#282c3f', margin: '0 0 16px 0', fontWeight: 800 }}>Certified Dishes ({filteredDishes.length})</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {filteredDishes.map((dish, idx) => {
                    const dishId = dish._id || dish.id;
                    const cartItem = cart.find(c => (c._id || c.id) === dishId);
                    return (
                      <div key={dishId} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 18, borderBottom: idx !== filteredDishes.length - 1 ? '1px solid #f0f0f5' : 'none', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${dish.isVeg ? '#0f8a65' : '#e43b4f'}`, padding: 2, boxSizing: 'border-box' }}>
                            <span style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', backgroundColor: dish.isVeg ? '#0f8a65' : '#e43b4f' }}></span>
                          </span>
                          <h3 style={{ margin: '3px 0', fontSize: 15, color: '#3e4152', fontWeight: 700 }}>{dish.name}</h3>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#3e4152', marginBottom: 6 }}>₹{dish.price}</div>
                          <p style={{ margin: 0, fontSize: 12, color: '#7e808c', lineHeight: 1.3 }}>{dish.description}</p>
                          <div style={{ marginTop: 6, display: 'inline-block', backgroundColor: '#e5f7f1', color: '#0f8a65', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                            ✓ QUALITY CERTIFIED
                          </div>
                        </div>

                        <div style={{ position: 'relative', width: 110, height: 95, flexShrink: 0 }}>
                          <img src={dish.image} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', width: '85%' }}>
                            {cartItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', border: '1px solid #d4d5d9', borderRadius: 6, padding: '3px 6px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                                <button onClick={() => removeFromCart(dishId)} style={{ border: 'none', background: 'none', color: '#0f8a65', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>-</button>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#0f8a65' }}>{cartItem.qty}</span>
                                <button onClick={() => addToCart(dish)} style={{ border: 'none', background: 'none', color: '#0f8a65', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(dish)} style={{ width: '100%', backgroundColor: '#ffffff', color: '#0f8a65', border: '1px solid #0f8a65', borderRadius: 6, padding: '5px 0', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                                ADD
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. ADMIN KITCHEN DISPATCH (Admin Only) */}
        {isAdmin && activeTab === 'partner' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '4px solid #0f8a65' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 18, color: '#282c3f' }}>Kitchen Live Orders ({orders.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>Marking "Delivered" deletes customer details permanently from MongoDB.</p>
                </div>
                <button onClick={fetchOrders} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>🔄 Refresh</button>
              </div>

              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7e808c', fontSize: 13 }}>
                  🎉 No active orders. Database storage is clear.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {orders.map(order => (
                    <div key={order.orderId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f8a65' }}>#{order.orderId}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: '#eee', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{order.status}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f8a65' }}>₹{order.totalAmount} (ONLINE PAID)</div>
                      </div>

                      <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#282c3f' }}>👤 Customer: {order.customerName}</div>
                        <div style={{ fontSize: 13, color: '#282c3f', marginTop: 2 }}>
                          📞 Phone: <a href={`tel:${order.phone}`} style={{ color: '#0f8a65', fontWeight: 800 }}>{order.phone}</a>
                        </div>
                        <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>📍 <strong>Address:</strong> {order.address}</div>
                        <div style={{ fontSize: 12, color: '#166534', marginTop: 4, fontWeight: 800 }}>
                          💳 Paid on Admin: 7379434080 (UTR: {order.paymentMethod})
                        </div>
                        <div style={{ fontSize: 12, color: '#0f8a65', marginTop: 4, fontWeight: 800 }}>🔐 Verification OTP: {order.otp}</div>
                      </div>

                      <div style={{ fontSize: 12, color: '#686b78', marginBottom: 10 }}>
                        <strong>Items:</strong> {order.items?.map(i => `${i.name} (x${i.qty})`).join(', ')}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Food is being prepared')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Food is being prepared' ? '#0f8a65' : '#f0f0f5', color: order.status === 'Food is being prepared' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          🍳 Preparing
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Food Ready')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Food Ready' ? '#0f8a65' : '#f0f0f5', color: order.status === 'Food Ready' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          📦 Food Ready
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Out for Delivery')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Out for Delivery' ? '#0f8a65' : '#f0f0f5', color: order.status === 'Out for Delivery' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          🛵 Out for Delivery
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Delivered')}
                          style={{ padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: '#0f8a65', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                          ✓ Mark Delivered & Delete Customer Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dish Upload Form */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Partner Dish Upload</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Submit dish samples for Quality & Taste Audit.</p>

              <form onSubmit={handlePartnerUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Dish Name *</label>
                  <input required type="text" placeholder="e.g. Special Home Thali" value={newDish.name} onChange={e => setNewDish({ ...newDish, name: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Price (₹) *</label>
                    <input required type="number" placeholder="60" value={newDish.price} onChange={e => setNewDish({ ...newDish, price: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Category</label>
                    <select value={newDish.category} onChange={e => setNewDish({ ...newDish, category: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                      {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Dietary Type</label>
                  <select value={newDish.isVeg ? 'veg' : 'nonveg'} onChange={e => setNewDish({ ...newDish, isVeg: e.target.value === 'veg' })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                    <option value="veg">🟢 Pure Veg</option>
                    <option value="nonveg">🔴 Non-Veg</option>
                  </select>
                </div>

                <div style={{ border: '2px dashed #0f8a65', padding: '14px', borderRadius: 10, backgroundColor: '#f0fdf4', textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#0f8a65', marginBottom: 8, cursor: 'pointer' }}>
                    📷 Select Photo from Phone Gallery or Camera
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  {newDish.image ? (
                    <div style={{ marginTop: 8 }}>
                      <img src={newDish.image} alt="Dish Preview" style={{ width: 120, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #0f8a65' }} />
                      <div style={{ fontSize: 11, color: '#0f8a65', fontWeight: 700, marginTop: 4 }}>✓ Photo Ready</div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#777' }}>Tap to select food image</p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Description</label>
                  <textarea rows={2} placeholder="Ingredients and recipe details..." value={newDish.description} onChange={e => setNewDish({ ...newDish, description: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <button disabled={isSubmitting} type="submit" style={{ backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: 14, borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer', marginTop: 4 }}>
                  {isSubmitting ? 'Uploading...' : 'Submit Dish for Taste & Quality Audit'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. MASTER ADMIN CONTROLS (Admin Only) */}
        {isAdmin && activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '4px solid #282c3f' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Taste & Quality Audit Queue ({auditQueue.pendingDishes.length})</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Approve or reject dishes before they appear on the menu.</p>

              {auditQueue.pendingDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 13 }}>No dishes awaiting approval.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {auditQueue.pendingDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 75, height: 65, borderRadius: 8, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: 14, color: '#282c3f' }}>{dish.name} • ₹{dish.price}</h4>
                          <p style={{ margin: '2px 0', fontSize: 11, color: '#686b78' }}>{dish.description}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button onClick={() => handleAuditDecision(dishId, 'approved')} style={{ backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => handleAuditDecision(dishId, 'rejected')} style={{ backgroundColor: '#ffffff', color: '#e43b4f', border: '1px solid #e43b4f', padding: '6px 10px', borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Live Certified Menu ({auditQueue.approvedDishes.length})</h2>
                <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#7e808c' }}>Modify prices or delete dishes from database.</p>
              </div>

              {auditQueue.approvedDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 13 }}>No dishes currently live.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {auditQueue.approvedDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e8e8e8', backgroundColor: '#fafbfc', borderRadius: 10, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 75, height: 65, borderRadius: 8, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: dish.isVeg ? '#0f8a65' : '#e43b4f', fontWeight: 800 }}>{dish.isVeg ? '🟢 VEG' : '🔴 NON-VEG'}</span>
                            <h4 style={{ margin: 0, fontSize: 15, color: '#282c3f' }}>{dish.name}</h4>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f8a65', marginTop: 2 }}>Current Price: ₹{dish.price}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            onClick={() => handleUpdatePrice(dishId, dish.price)}
                            style={{ backgroundColor: '#282c3f', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                            ✏️ Edit Cost
                          </button>
                          <button
                            onClick={() => handleDeleteDish(dishId, dish.name)}
                            style={{ backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                            🗑️ Delete Dish
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Cart Bar (Customer Only) */}
      {cart.length > 0 && activeTab === 'customer' && (
        <div style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '92%', maxWidth: 600, backgroundColor: '#0f8a65', color: '#ffffff', borderRadius: 12, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 6px 20px rgba(15,138,101,0.3)', zIndex: 1000 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.9 }}>{cart.reduce((a, b) => a + b.qty, 0)} Items Added</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>₹{cartTotal}</div>
          </div>
          <button onClick={() => setOrderModalOpen(true)} style={{ backgroundColor: 'transparent', color: '#ffffff', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            PROCEED TO PAY & ORDER →
          </button>
        </div>
      )}

      {/* Checkout Modal with Strict 10 Digits, Landmark & Online Admin UPI QR */}
      {orderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 14 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 22, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#0f8a65', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900 }}>L</div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#282c3f' }}>Online Checkout (Admin: {ADMIN_PHONE})</h3>
              </div>
              <button onClick={() => setOrderModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handlePlaceOrder}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Full Name</label>
                <input required type="text" placeholder="e.g. Rahul Sharma" value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Mobile Number (Strictly 10 Digits)</label>
                <input required type="tel" maxLength={10} pattern="[0-9]{10}" placeholder="Enter 10-digit number" value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value.replace(/\D/g, '') })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Delivery Address (Street / Flat / House)</label>
                <textarea required rows={2} placeholder="House number, floor, area..." value={customerForm.address} onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Nearest Famous Place / Landmark *</label>
                <input required type="text" placeholder="e.g. Near City Hospital / Opp. Park" value={customerForm.landmark} onChange={e => setCustomerForm({ ...customerForm, landmark: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#166534' }}>PAYMENT: ONLINE UPI ONLY</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#0f8a65' }}>₹{cartTotal}</span>
                </div>
                
                <p style={{ margin: '6px 0 10px 0', fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                  Pay <strong>₹{cartTotal}</strong> to Admin:<br/>
                  • Number: <strong>{ADMIN_PHONE}</strong><br/>
                  • UPI ID: <strong>{ADMIN_UPI}</strong>
                </p>

                <div style={{ textAlign: 'center', margin: '8px 0', backgroundColor: '#fff', padding: 10, borderRadius: 8, display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                  <img 
                    src={ADMIN_QR_CODE_URL} 
                    alt="Admin UPI QR Code" 
                    style={{ width: 145, height: 145, borderRadius: 8 }} 
                  />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f8a65', marginTop: 4 }}>
                    Scan with PhonePe, Google Pay, or Paytm
                  </div>
                </div>

                <a
                  href={upiPayString}
                  style={{ display: 'block', textAlign: 'center', backgroundColor: '#0f8a65', color: '#fff', padding: '9px 0', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12, marginBottom: 12 }}>
                  ⚡ Tap to Pay via UPI App (PhonePe / GPay / Paytm)
                </a>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#166534', marginBottom: 4 }}>
                    Enter UPI Transaction ID / UTR Number *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. 12-digit UPI UTR number after payment"
                    value={customerForm.transactionRef}
                    onChange={e => setCustomerForm({ ...customerForm, transactionRef: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #86efac', backgroundColor: '#fff', boxSizing: 'border-box', fontSize: 12 }}
                  />
                </div>
              </div>

              <button type="submit" style={{ width: '100%', backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: 12, borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,138,101,0.25)' }}>
                Confirm Online Payment & Place Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}