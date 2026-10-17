import React, { useState, useEffect } from 'react';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://lasar-food-aap.onrender.com';

const ADMIN_EMAIL = 'ankit917379@gmail.com';
const ADMIN_PHONE = '7379434080';
const ADMIN_UPI = 'ankit917379@okhdfcbank';
const ADMIN_SECRET_PIN = '9173';

// Dynamic Scannable Admin UPI QR Code
const ADMIN_QR_CODE_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(`upi://pay?pa=${ADMIN_UPI}&pn=LASAR%20Home%20Food&cu=INR`);

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('lasar_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginMethod, setLoginMethod] = useState('mobile');
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  
  // Auth state
  const [authStep, setAuthStep] = useState(false);
  const [isAdminLoginAttempt, setIsAdminLoginAttempt] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  // App tabs & data
  const [activeTab, setActiveTab] = useState('customer');
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [auditQueue, setAuditQueue] = useState({ pendingDishes: [], approvedDishes: [], rejectedDishes: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVegOnly, setFilterVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Checkout & Order Form
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    deliveryArea: '',
    address: '',
    landmark: '',
    transactionRef: ''
  });
  const [activeCustomerOrder, setActiveCustomerOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  // Partner dish upload
  const [newDish, setNewDish] = useState({
    name: '',
    price: '',
    category: 'Thali & Meals',
    isVeg: true,
    description: '',
    image: '',
    restaurantName: 'LASAR Cloud Kitchen'
  });

  const categories = ['All', 'Thali & Meals', 'Curry & Sabzi', 'Breads & Rice', 'Snacks', 'Desserts'];
  const isAdmin = user && user.isAdmin;

  useEffect(() => {
    if (user) {
      setCustomerForm(prev => ({
        ...prev,
        name: user.name || prev.name,
        phone: user.phone || prev.phone
      }));
    }
  }, [user]);

  const safeFetchJson = async (url, options = {}) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) };
      } catch {
        return { ok: false, status: res.status, data: null, raw: text };
      }
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  };

  const checkHealth = async () => {
    const res = await safeFetchJson(`${API_BASE}/api/menu`);
    setApiConnected(res.ok);
  };

  const fetchMenu = async () => {
    const res = await safeFetchJson(`${API_BASE}/api/menu`);
    if (res.ok && Array.isArray(res.data)) setMenu(res.data);
  };

  const fetchAuditData = async () => {
    if (!isAdmin) return;
    const res = await safeFetchJson(`${API_BASE}/api/admin/audit-queue`);
    if (res.ok && res.data && res.data.pendingDishes) setAuditQueue(res.data);
  };

  const fetchOrders = async () => {
    const res = await safeFetchJson(`${API_BASE}/api/orders`);
    if (res.ok && Array.isArray(res.data)) {
      setOrders(res.data);
      if (activeCustomerOrder) {
        const found = res.data.find(o => o.orderId === activeCustomerOrder.orderId);
        if (found) {
          setActiveCustomerOrder(found);
        }
      }
    }
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

  // Auth
  const handleRequestAuth = async (e) => {
    e.preventDefault();
    if (!loginName.trim()) return alert('Please enter your full name');

    let identifier = '';
    if (loginMethod === 'mobile') {
      const cleaned = loginPhone.trim().replace(/\D/g, '');
      if (cleaned.length !== 10) return alert('Please enter a valid 10-digit mobile number');
      identifier = cleaned;
    } else {
      const cleaned = loginEmail.trim().toLowerCase();
      if (!cleaned || !cleaned.includes('@gmail.com')) return alert('Please enter a valid @gmail.com address');
      identifier = cleaned;
    }

    setIsSendingOtp(true);
    const tryingAdmin = identifier === ADMIN_PHONE || identifier === ADMIN_EMAIL;
    setIsAdminLoginAttempt(tryingAdmin);

    if (tryingAdmin) {
      setGeneratedOtp('');
      setAuthStep(true);
      setIsSendingOtp(false);
    } else {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);
      setAuthStep(true);
      setIsSendingOtp(false);
    }
  };

  const handleVerifyAuth = (e) => {
    e.preventDefault();
    const cleanIdentifier = loginMethod === 'mobile' ? loginPhone.trim() : loginEmail.trim().toLowerCase();

    if (isAdminLoginAttempt) {
      if (enteredCode.trim() !== ADMIN_SECRET_PIN) {
        return alert('Incorrect Admin Passcode. Access denied.');
      }
      const adminUser = {
        name: 'Ankit Gupta (Admin)',
        identifier: cleanIdentifier,
        phone: ADMIN_PHONE,
        email: ADMIN_EMAIL,
        isAdmin: true
      };
      setUser(adminUser);
      localStorage.setItem('lasar_user', JSON.stringify(adminUser));
      setAuthStep(false);
      setEnteredCode('');
    } else {
      if (enteredCode.trim() !== generatedOtp) {
        return alert('Incorrect verification code. Please check on-screen OTP.');
      }
      const regularUser = {
        name: loginName.trim(),
        identifier: cleanIdentifier,
        phone: cleanIdentifier.length === 10 && !isNaN(cleanIdentifier) ? cleanIdentifier : '',
        email: cleanIdentifier.includes('@') ? cleanIdentifier : '',
        isAdmin: false
      };
      setUser(regularUser);
      localStorage.setItem('lasar_user', JSON.stringify(regularUser));
      setAuthStep(false);
      setEnteredCode('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lasar_user');
    setUser(null);
    setCart([]);
    setActiveCustomerOrder(null);
    setActiveTab('customer');
    setAuthStep(false);
    setEnteredCode('');
    setIsAdminLoginAttempt(false);
  };

  // Admin verifies payment & sets delivery window
  const handleConfirmPaymentAndAccept = async (orderId) => {
    const slot = window.prompt('Set Delivery Time Slot for this order (e.g. "1:15 PM - 1:45 PM" or "35-45 mins"):', '30-45 mins');
    if (!slot) return;

    const res = await safeFetchJson(`${API_BASE}/api/orders/${orderId}/confirm-payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliverySlot: slot })
    });

    if (res.ok) {
      alert(`Order #${orderId} payment confirmed! User is notified that order is officially placed.`);
      fetchOrders();
    }
  };

  // Status updates
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    const res = await safeFetchJson(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.data?.purged || newStatus === 'Delivered') {
      alert(`Order #${orderId} delivered! Customer data removed from database.`);
      setOrders(prev => prev.filter(o => o.orderId !== orderId));
      if (activeCustomerOrder?.orderId === orderId) {
        setActiveCustomerOrder(null);
      }
    } else {
      fetchOrders();
    }
  };

  const handleAuditDecision = async (dishId, decision) => {
    const res = await safeFetchJson(`${API_BASE}/api/admin/audit-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dishId,
        decision,
        feedback: decision === 'approved' ? 'Approved by Master Admin' : 'Rejected'
      })
    });
    if (res.ok) {
      alert(decision === 'approved' ? 'Dish Approved & Added to Menu!' : 'Dish Rejected');
      fetchAuditData();
      fetchMenu();
    }
  };

  const handleUpdatePrice = async (dishId, currentPrice) => {
    const newPrice = window.prompt('Enter new price (₹):', currentPrice);
    if (!newPrice || isNaN(newPrice) || Number(newPrice) <= 0) return;

    const res = await safeFetchJson(`${API_BASE}/api/admin/dish/${dishId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: Number(newPrice) })
    });
    if (res.ok) {
      alert(`Price updated to ₹${newPrice}!`);
      fetchAuditData();
      fetchMenu();
    }
  };

  const handleDeleteDish = async (dishId, dishName) => {
    if (!window.confirm(`Permanently delete "${dishName}"?`)) return;
    const res = await safeFetchJson(`${API_BASE}/api/admin/dish/${dishId}`, { method: 'DELETE' });
    if (res.ok) {
      alert(`"${dishName}" deleted!`);
      fetchAuditData();
      fetchMenu();
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
    const res = await safeFetchJson(`${API_BASE}/api/menu/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newDish,
        price: Number(newDish.price),
        image: newDish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'
      })
    });

    setIsSubmitting(false);
    if (res.ok) {
      alert('🎉 Dish uploaded to Quality Queue!');
      setNewDish({ name: '', price: '', category: 'Thali & Meals', isVeg: true, description: '', image: '', restaurantName: 'LASAR Cloud Kitchen' });
      fetchAuditData();
      setActiveTab('admin');
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

  // Customer places order -> Payment Verification Pending
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const cleanedPhone = customerForm.phone.trim().replace(/\D/g, '');
    if (cleanedPhone.length !== 10) return alert('Mobile number must be exactly 10 digits.');
    if (!customerForm.deliveryArea.trim()) return alert('Please enter delivery area / locality.');
    if (!customerForm.address.trim()) return alert('Please enter complete delivery address.');
    if (!customerForm.landmark.trim()) return alert('Please enter nearest landmark.');
    if (!customerForm.transactionRef.trim()) return alert('Please complete UPI payment to 7379434080 and enter the UTR/Reference ID.');

    const res = await safeFetchJson(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customerForm.name.trim(),
        phone: cleanedPhone,
        deliveryArea: customerForm.deliveryArea.trim(),
        address: customerForm.address.trim(),
        landmark: customerForm.landmark.trim(),
        transactionRef: customerForm.transactionRef.trim(),
        paymentMethod: `UPI UTR: ${customerForm.transactionRef.trim()}`,
        items: cart,
        totalAmount: cartTotal
      })
    });

    if (res.ok && res.data?.success) {
      alert('Payment details submitted! Awaiting Admin bank verification.');
      setActiveCustomerOrder(res.data.order);
      setCart([]);
      setOrderModalOpen(false);
      fetchOrders();
    }
  };

  const filteredDishes = menu.filter(dish => {
    const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (dish.description && dish.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesVeg = filterVegOnly ? dish.isVeg : true;
    const matchesCat = selectedCategory === 'All' ? true : dish.category === selectedCategory;
    return matchesSearch && matchesVeg && matchesCat;
  });

  const upiPayString = `upi://pay?pa=${ADMIN_UPI}&pn=LASAR%20FOOD&am=${cartTotal}&cu=INR&tn=LASAR%20Order`;

  // ==========================================
  // VIEW 1: GATEKEEPER LOGIN ONLY
  // ==========================================
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f2f2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Basis Grotesque Pro, system-ui, -apple-system, sans-serif' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 410, padding: 30, boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
          
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fc8019 0%, #ff5200 100%)',
              color: '#ffffff',
              fontSize: 32,
              boxShadow: '0 8px 18px rgba(252, 128, 25, 0.35)',
              marginBottom: 10
            }}>
              🍲
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#282c3f', letterSpacing: '-0.5px' }}>
              LASAR
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fc8019', letterSpacing: '2.5px', textTransform: 'uppercase', marginTop: 2 }}>
              HOME LIKE FOOD
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#7e808c' }}>
              {authStep ? (isAdminLoginAttempt ? 'Admin Security Check' : 'Enter verification code below') : 'Order fresh homemade meals right to your doorstep'}
            </p>
          </div>

          {!authStep ? (
            <>
              <div style={{ display: 'flex', backgroundColor: '#f0f0f5', borderRadius: 12, padding: 4, marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={() => setLoginMethod('mobile')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, backgroundColor: loginMethod === 'mobile' ? '#ffffff' : 'transparent', color: loginMethod === 'mobile' ? '#fc8019' : '#686b78', boxShadow: loginMethod === 'mobile' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>
                  📱 Mobile Login
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('gmail')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, backgroundColor: loginMethod === 'gmail' ? '#ffffff' : 'transparent', color: loginMethod === 'gmail' ? '#fc8019' : '#686b78', boxShadow: loginMethod === 'gmail' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>
                  ✉️ Gmail Login
                </button>
              </div>

              <form onSubmit={handleRequestAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#3d4152', marginBottom: 5 }}>Full Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={loginName}
                    onChange={e => setLoginName(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {loginMethod === 'mobile' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#3d4152', marginBottom: 5 }}>10-Digit Mobile Number</label>
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      placeholder="e.g. 9876543210"
                      value={loginPhone}
                      onChange={e => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#3d4152', marginBottom: 5 }}>Gmail Address</label>
                    <input
                      required
                      type="email"
                      placeholder="name@gmail.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d4d5d9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingOtp}
                  style={{ backgroundColor: '#fc8019', color: '#ffffff', border: 'none', padding: '14px', borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: 'pointer', marginTop: 6, boxShadow: '0 4px 14px rgba(252, 128, 25, 0.35)' }}>
                  {isSendingOtp ? 'Checking...' : 'Continue to Order Food →'}
                </button>
              </form>
            </>
          ) : (
            <form onSubmit={handleVerifyAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {isAdminLoginAttempt ? (
                <div style={{ backgroundColor: '#fff5f0', border: '1.5px solid #fc8019', padding: '14px', borderRadius: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: '#d95300', fontWeight: 900, display: 'block' }}>🛡️ ADMIN ACCESS DETECTED</span>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#686b78' }}>
                    Enter Master Admin Security PIN:
                  </p>
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff5f0', border: '1.5px solid #fc8019', padding: '14px', borderRadius: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 12, color: '#fc8019', fontWeight: 900, display: 'block', textTransform: 'uppercase' }}>Your OTP Code:</span>
                  <span style={{ fontSize: 30, color: '#fc8019', fontWeight: 900, letterSpacing: 8 }}>{generatedOtp}</span>
                  <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#7e808c' }}>Enter the 6 digits below to enter</p>
                </div>
              )}

              <div>
                <input
                  required
                  autoFocus
                  type={isAdminLoginAttempt ? 'password' : 'text'}
                  maxLength={isAdminLoginAttempt ? 8 : 6}
                  placeholder={isAdminLoginAttempt ? 'Enter Admin PIN' : '• • • • • •'}
                  value={enteredCode}
                  onChange={e => setEnteredCode(e.target.value)}
                  style={{ width: '100%', padding: '14px', borderRadius: 10, border: '2px solid #fc8019', fontSize: 22, textAlign: 'center', letterSpacing: 4, fontWeight: 900, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{ backgroundColor: '#fc8019', color: '#ffffff', border: 'none', padding: '14px', borderRadius: 10, fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(252, 128, 25, 0.35)' }}>
                {isAdminLoginAttempt ? 'Unlock Admin Controls' : 'Verify & Browse Menu'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthStep(false); setEnteredCode(''); setIsAdminLoginAttempt(false); }}
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
  // VIEW 2: SWIGGY-STYLE RESTAURANT & DELIVERY EXPERIENCE
  // =========================================================
  return (
    <div style={{ fontFamily: 'Basis Grotesque Pro, system-ui, -apple-system, sans-serif', backgroundColor: '#f4f5f7', minHeight: '100vh', margin: 0, paddingBottom: 110 }}>
      
      {/* Swiggy Style Sticky Top Navbar */}
      <header style={{ backgroundColor: '#ffffff', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Logo Brand with Cloche Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fc8019 0%, #ff5200 100%)',
              color: '#ffffff',
              fontSize: 22,
              boxShadow: '0 4px 12px rgba(252, 128, 25, 0.3)'
            }}>
              🍲
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#282c3f', letterSpacing: '-0.3px' }}>LASAR</span>
                <span style={{ fontSize: 10, fontWeight: 800, backgroundColor: '#fc8019', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>HOME FOOD</span>
              </div>
              <div style={{ fontSize: 11, color: '#7e808c', marginTop: 1 }}>
                📍 Fresh Home Delivery • {user.name} {isAdmin ? '🛡️' : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <>
                <button onClick={() => { setActiveTab('customer'); fetchMenu(); }} style={{ padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, backgroundColor: activeTab === 'customer' ? '#fc8019' : '#f0f0f5', color: activeTab === 'customer' ? '#fff' : '#3d4152' }}>
                  🍽️ Menu
                </button>
                <button onClick={() => { setActiveTab('partner'); fetchOrders(); }} style={{ padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, backgroundColor: activeTab === 'partner' ? '#fc8019' : '#f0f0f5', color: activeTab === 'partner' ? '#fff' : '#3d4152' }}>
                  👨‍🍳 Kitchen ({orders.length})
                </button>
                <button onClick={() => { setActiveTab('admin'); fetchAuditData(); fetchOrders(); }} style={{ padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, backgroundColor: activeTab === 'admin' ? '#282c3f' : '#f0f0f5', color: activeTab === 'admin' ? '#fff' : '#3d4152' }}>
                  🛡️ Admin
                </button>
              </>
            )}

            <button onClick={handleLogout} style={{ padding: '7px 12px', borderRadius: 20, border: '1px solid #ffd8cc', backgroundColor: '#fff2ed', color: '#fc8019', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: apiConnected ? '#eaf8f2' : '#fff5f0', padding: '4px 16px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: apiConnected ? '#0f8a65' : '#fc8019' }}>
          {apiConnected ? '● Cloud Kitchen Online • Accepting Orders' : '○ Connecting to Kitchen Server...'}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 860, margin: '18px auto', padding: '0 16px' }}>

        {/* 1. CUSTOMER SWIGGY MENU VIEW */}
        {activeTab === 'customer' && (
          <div>
            {/* LIVE ACTIVE ORDER TRACKING HERO */}
            {activeCustomerOrder && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                padding: 20,
                marginBottom: 20,
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                borderLeft: `8px solid ${activeCustomerOrder.paymentConfirmed ? '#0f8a65' : '#fc8019'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: activeCustomerOrder.paymentConfirmed ? '#0f8a65' : '#fc8019',
                      letterSpacing: 1,
                      textTransform: 'uppercase'
                    }}>
                      {activeCustomerOrder.paymentConfirmed ? '🎉 ORDER PLACED & VERIFIED' : '⏳ PAYMENT VERIFICATION PENDING'}
                    </span>
                    <h3 style={{ margin: '4px 0 2px 0', fontSize: 18, color: '#282c3f' }}>Order #{activeCustomerOrder.orderId}</h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>
                      Delivery to: <strong>{activeCustomerOrder.deliveryArea || 'Home'}</strong>, {activeCustomerOrder.address}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#7e808c', display: 'block' }}>Delivery Passcode</span>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#282c3f' }}>{activeCustomerOrder.otp}</div>
                  </div>
                </div>

                {activeCustomerOrder.deliverySlot ? (
                  <div style={{
                    marginTop: 14,
                    backgroundColor: '#eaf8f2',
                    border: '1.5px solid #a3e6cb',
                    borderRadius: 10,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    <span style={{ fontSize: 20 }}>🕒</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#0f8a65', textTransform: 'uppercase' }}>
                        Estimated Delivery Time Slot
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#065f46' }}>
                        {activeCustomerOrder.deliverySlot}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: 14,
                    backgroundColor: '#fff7ed',
                    border: '1.5px solid #ffedd5',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#c2410c',
                    fontWeight: 700
                  }}>
                    🕒 Admin is verifying your payment in bank. Delivery time slot will appear here once verified.
                  </div>
                )}

                <div style={{ margin: '16px 0 8px 0', backgroundColor: '#f0f0f5', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    backgroundColor: activeCustomerOrder.paymentConfirmed ? '#0f8a65' : '#fc8019', 
                    width: !activeCustomerOrder.paymentConfirmed ? '20%' :
                           activeCustomerOrder.status === 'Order Placed' ? '40%' :
                           activeCustomerOrder.status === 'Food is being prepared' ? '65%' :
                           activeCustomerOrder.status === 'Food Ready' ? '80%' : '95%',
                    transition: 'width 0.5s ease'
                  }}></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 800, color: '#282c3f' }}>
                  <span>Status: {activeCustomerOrder.status}</span>
                  <span style={{ color: activeCustomerOrder.paymentConfirmed ? '#0f8a65' : '#fc8019' }}>
                    {activeCustomerOrder.paymentConfirmed ? '✓ Bank Payment Confirmed' : 'Checking Bank Records...'}
                  </span>
                </div>
              </div>
            )}

            {/* Search and Veg Toggle Filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search for dishes, thalis, desserts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: 14, outline: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
              />
              <button
                onClick={() => setFilterVegOnly(!filterVegOnly)}
                style={{ padding: '10px 16px', borderRadius: 12, border: `2px solid ${filterVegOnly ? '#0f8a65' : '#e2e8f0'}`, backgroundColor: filterVegOnly ? '#eaf8f2' : '#ffffff', color: filterVegOnly ? '#0f8a65' : '#3d4152', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
                🟢 Veg
              </button>
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 18 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 24,
                    border: 'none',
                    backgroundColor: selectedCategory === cat ? '#fc8019' : '#ffffff',
                    color: selectedCategory === cat ? '#ffffff' : '#3d4152',
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s'
                  }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Food Menu Items */}
            {filteredDishes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🍲</div>
                <h3 style={{ margin: '0 0 4px 0', color: '#282c3f', fontSize: 18 }}>Kitchen Menu is Updating</h3>
                <p style={{ margin: 0, color: '#7e808c', fontSize: 13 }}>Dishes will appear here once approved by Admin.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 18, color: '#282c3f', margin: '0 0 20px 0', fontWeight: 900 }}>
                  Recommended Dishes ({filteredDishes.length})
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {filteredDishes.map((dish, idx) => {
                    const dishId = dish._id || dish.id;
                    const cartItem = cart.find(c => (c._id || c.id) === dishId);
                    return (
                      <div key={dishId} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 22, borderBottom: idx !== filteredDishes.length - 1 ? '1px solid #f0f0f5' : 'none', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid ${dish.isVeg ? '#0f8a65' : '#e43b4f'}`, padding: 2, boxSizing: 'border-box' }}>
                            <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', backgroundColor: dish.isVeg ? '#0f8a65' : '#e43b4f' }}></span>
                          </span>
                          <h3 style={{ margin: '4px 0 2px 0', fontSize: 16, color: '#282c3f', fontWeight: 800 }}>{dish.name}</h3>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#3e4152', marginBottom: 6 }}>₹{dish.price}</div>
                          <p style={{ margin: 0, fontSize: 13, color: '#7e808c', lineHeight: 1.4 }}>{dish.description}</p>
                        </div>

                        <div style={{ position: 'relative', width: 120, height: 105, flexShrink: 0 }}>
                          <img src={dish.image} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                          <div style={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)', width: '90%' }}>
                            {cartItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', border: '1px solid #d4d5d9', borderRadius: 8, padding: '4px 8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                                <button onClick={() => removeFromCart(dishId)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontSize: 13, fontWeight: 900, color: '#fc8019' }}>{cartItem.qty}</span>
                                <button onClick={() => addToCart(dish)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(dish)} style={{ width: '100%', backgroundColor: '#ffffff', color: '#fc8019', border: '1px solid #fc8019', borderRadius: 8, padding: '7px 0', fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
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

        {/* 2. ADMIN KITCHEN DISPATCH */}
        {isAdmin && activeTab === 'partner' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', borderTop: '5px solid #fc8019' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Kitchen Orders Dispatch ({orders.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>Verify bank credit first, set delivery window, then mark delivered.</p>
                </div>
                <button onClick={fetchOrders} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>🔄 Refresh</button>
              </div>

              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#7e808c', fontSize: 14 }}>
                  🎉 No active orders. Storage is clean!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {orders.map(order => (
                    <div key={order.orderId} style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 16, backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f0f0f5', paddingBottom: 10, marginBottom: 10 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: '#282c3f' }}>#{order.orderId}</span>
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            backgroundColor: order.paymentConfirmed ? '#eaf8f2' : '#fff5f0',
                            color: order.paymentConfirmed ? '#0f8a65' : '#fc8019',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 800
                          }}>
                            {order.paymentConfirmed ? '✓ Bank Payment Confirmed' : '⚠️ Payment Needs Verification'}
                          </span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#fc8019' }}>₹{order.totalAmount}</div>
                      </div>

                      <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
                        <div>👤 <strong>Customer:</strong> {order.customerName} (📞 <a href={`tel:${order.phone}`} style={{ color: '#fc8019', fontWeight: 800 }}>{order.phone}</a>)</div>
                        <div>📍 <strong>Delivery Area:</strong> <span style={{ color: '#fc8019', fontWeight: 800 }}>{order.deliveryArea || 'Not specified'}</span></div>
                        <div>🏠 <strong>Complete Address:</strong> {order.address}</div>
                        <div>🚩 <strong>Nearest Landmark:</strong> {order.landmark || 'N/A'}</div>
                        <div style={{ marginTop: 4, color: '#1e293b' }}>
                          💳 <strong>Customer Entered UTR:</strong> <span style={{ backgroundColor: '#ffedd5', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>{order.transactionRef || order.paymentMethod}</span>
                        </div>
                        {order.deliverySlot && (
                          <div style={{ marginTop: 4, color: '#0f8a65', fontWeight: 800 }}>
                            🕒 <strong>Active Delivery Window:</strong> {order.deliverySlot}
                          </div>
                        )}
                        <div style={{ marginTop: 4, color: '#0f8a65', fontWeight: 800 }}>🔐 Verification OTP: {order.otp}</div>
                      </div>

                      <div style={{ fontSize: 12, color: '#686b78', marginBottom: 12 }}>
                        <strong>Dishes:</strong> {order.items?.map(i => `${i.name} (x${i.qty})`).join(', ')}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {!order.paymentConfirmed ? (
                          <button
                            onClick={() => handleConfirmPaymentAndAccept(order.orderId)}
                            style={{ backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                            ✓ Confirm Bank Payment Received & Accept Order
                          </button>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.orderId, 'Food is being prepared')}
                              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: order.status === 'Food is being prepared' ? '#fc8019' : '#f0f0f5', color: order.status === 'Food is being prepared' ? '#fff' : '#333', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                              🍳 Preparing Food
                            </button>
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.orderId, 'Out for Delivery')}
                              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: order.status === 'Out for Delivery' ? '#fc8019' : '#f0f0f5', color: order.status === 'Out for Delivery' ? '#fff' : '#333', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                              🛵 Out for Delivery
                            </button>
                            <button 
                              onClick={() => handleUpdateOrderStatus(order.orderId, 'Delivered')}
                              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#282c3f', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                              ✓ Mark Delivered & Clear Data
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dish Upload Form */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Kitchen Dish Upload</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Submit dish samples for Quality & Taste Audit.</p>

              <form onSubmit={handlePartnerUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Dish Name *</label>
                  <input required type="text" placeholder="e.g. Special Paneer Thali" value={newDish.name} onChange={e => setNewDish({ ...newDish, name: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Price (₹) *</label>
                    <input required type="number" placeholder="80" value={newDish.price} onChange={e => setNewDish({ ...newDish, price: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Category</label>
                    <select value={newDish.category} onChange={e => setNewDish({ ...newDish, category: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                      {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Dietary Type</label>
                  <select value={newDish.isVeg ? 'veg' : 'nonveg'} onChange={e => setNewDish({ ...newDish, isVeg: e.target.value === 'veg' })} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                    <option value="veg">🟢 Pure Veg</option>
                    <option value="nonveg">🔴 Non-Veg</option>
                  </select>
                </div>

                <div style={{ border: '2px dashed #fc8019', padding: '16px', borderRadius: 10, backgroundColor: '#fff9f5', textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#fc8019', marginBottom: 8, cursor: 'pointer' }}>
                    📷 Choose Dish Photo (Gallery / Camera)
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  {newDish.image ? (
                    <div style={{ marginTop: 8 }}>
                      <img src={newDish.image} alt="Preview" style={{ width: 120, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #fc8019' }} />
                      <div style={{ fontSize: 11, color: '#0f8a65', fontWeight: 800, marginTop: 4 }}>✓ Photo Ready</div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#777' }}>Tap here to attach photo</p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Description</label>
                  <textarea rows={2} placeholder="Ingredients, recipe details..." value={newDish.description} onChange={e => setNewDish({ ...newDish, description: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <button disabled={isSubmitting} type="submit" style={{ backgroundColor: '#fc8019', color: '#fff', border: 'none', padding: 14, borderRadius: 8, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                  {isSubmitting ? 'Uploading...' : 'Submit Dish for Taste & Quality Audit'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. MASTER ADMIN CONTROLS */}
        {isAdmin && activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Pending Audit */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', borderTop: '5px solid #282c3f' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Taste & Quality Audit ({auditQueue.pendingDishes.length})</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Approve dishes before they go live on customer menu.</p>

              {auditQueue.pendingDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7e808c', fontSize: 13 }}>No dishes awaiting approval.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {auditQueue.pendingDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 80, height: 70, borderRadius: 8, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: 15, color: '#282c3f' }}>{dish.name} • ₹{dish.price}</h4>
                          <p style={{ margin: '2px 0', fontSize: 12, color: '#686b78' }}>{dish.description}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button onClick={() => handleAuditDecision(dishId, 'approved')} style={{ backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => handleAuditDecision(dishId, 'rejected')} style={{ backgroundColor: '#fff', color: '#e43b4f', border: '1px solid #e43b4f', padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Certified Dishes */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Live Certified Dishes ({auditQueue.approvedDishes.length})</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Edit dish prices or remove items completely.</p>

              {auditQueue.approvedDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7e808c', fontSize: 13 }}>No live dishes right now.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {auditQueue.approvedDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e8e8e8', backgroundColor: '#fafbfc', borderRadius: 10, padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 80, height: 70, borderRadius: 8, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: dish.isVeg ? '#0f8a65' : '#e43b4f', fontWeight: 800 }}>{dish.isVeg ? '🟢 VEG' : '🔴 NON-VEG'}</div>
                          <h4 style={{ margin: '2px 0', fontSize: 15, color: '#282c3f' }}>{dish.name}</h4>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#fc8019' }}>₹{dish.price}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button onClick={() => handleUpdatePrice(dishId, dish.price)} style={{ backgroundColor: '#282c3f', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✏️ Edit Price
                          </button>
                          <button onClick={() => handleDeleteDish(dishId, dish.name)} style={{ backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            🗑️ Delete
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

      {/* Floating Bottom Cart */}
      {cart.length > 0 && activeTab === 'customer' && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: '92%', maxWidth: 640, backgroundColor: '#fc8019', color: '#ffffff', borderRadius: 14, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 24px rgba(252, 128, 25, 0.4)', zIndex: 1000 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.9 }}>{cart.reduce((a, b) => a + b.qty, 0)} Items Added</div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>₹{cartTotal}</div>
          </div>
          <button onClick={() => setOrderModalOpen(true)} style={{ backgroundColor: 'transparent', color: '#ffffff', border: 'none', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            VIEW CART & CHECKOUT →
          </button>
        </div>
      )}

      {/* Checkout Modal with Area, Landmark & Admin UPI Payment */}
      {orderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🍲</span>
                <h3 style={{ margin: 0, fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Delivery & Online Payment</h3>
              </div>
              <button onClick={() => setOrderModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#7e808c' }}>✕</button>
            </div>

            <form onSubmit={handlePlaceOrder}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Full Name</label>
                <input required type="text" placeholder="e.g. Rahul Sharma" value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>10-Digit Mobile Number</label>
                <input required type="tel" maxLength={10} pattern="[0-9]{10}" placeholder="Enter 10-digit number" value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value.replace(/\D/g, '') })} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#fc8019', marginBottom: 4 }}>Delivery Area / Locality / Sector *</label>
                <input required type="text" placeholder="e.g. Sector 62 / Raj Nagar / Shastri Nagar" value={customerForm.deliveryArea} onChange={e => setCustomerForm({ ...customerForm, deliveryArea: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fc8019', boxSizing: 'border-box', backgroundColor: '#fffaf6' }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Complete House / Flat Address</label>
                <textarea required rows={2} placeholder="House number, floor, building name..." value={customerForm.address} onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Nearest Landmark / Famous Place *</label>
                <input required type="text" placeholder="e.g. Near City Hospital / Opp. Central Bank" value={customerForm.landmark} onChange={e => setCustomerForm({ ...customerForm, landmark: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ backgroundColor: '#fff9f5', border: '1.5px solid #fed7aa', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#c2410c' }}>PAY ONLINE DIRECT TO ADMIN</span>
                  <span style={{ fontSize: 17, fontWeight: 900, color: '#fc8019' }}>₹{cartTotal}</span>
                </div>
                
                <p style={{ margin: '8px 0 10px 0', fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                  Pay <strong>₹{cartTotal}</strong> to Admin Account:<br/>
                  • Phone Number: <strong>{ADMIN_PHONE}</strong><br/>
                  • UPI ID: <strong>{ADMIN_UPI}</strong>
                </p>

                <div style={{ textAlign: 'center', margin: '8px 0', backgroundColor: '#fff', padding: 10, borderRadius: 10, display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                  <img src={ADMIN_QR_CODE_URL} alt="Admin UPI QR" style={{ width: 145, height: 145, borderRadius: 8 }} />
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#fc8019', marginTop: 4 }}>
                    Scan with PhonePe, Google Pay, or Paytm
                  </div>
                </div>

                <a href={upiPayString} style={{ display: 'block', textAlign: 'center', backgroundColor: '#fc8019', color: '#fff', padding: '10px 0', borderRadius: 8, textDecoration: 'none', fontWeight: 900, fontSize: 13, marginBottom: 12 }}>
                  ⚡ Tap to Pay via Installed UPI App
                </a>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#c2410c', marginBottom: 4 }}>
                    Enter 12-Digit UPI Transaction ID / UTR Number *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Enter UTR reference after making payment"
                    value={customerForm.transactionRef}
                    onChange={e => setCustomerForm({ ...customerForm, transactionRef: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #fed7aa', backgroundColor: '#fff', boxSizing: 'border-box', fontSize: 13 }}
                  />
                </div>
              </div>

              <button type="submit" style={{ width: '100%', backgroundColor: '#fc8019', color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontWeight: 900, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(252, 128, 25, 0.35)' }}>
                Submit Payment & Place Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}