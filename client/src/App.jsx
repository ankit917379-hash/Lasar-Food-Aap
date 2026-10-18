import React, { useState, useEffect } from 'react';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://lasar-food-aap.onrender.com';

const ADMIN_EMAIL = 'ankit917379@gmail.com';
const ADMIN_PHONE = '7379434080';
const ADMIN_UPI = 'ankit917379@okhdfcbank';
const ADMIN_SECRET_PIN = '9173';

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
  const [activeTab, setActiveTab] = useState('customer'); // 'customer' | 'history' | 'adminOrders' | 'admin'
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);

  // Load persistent orders directly by logged in phone number from device storage
  const [userHistory, setUserHistory] = useState(() => {
    try {
      const savedUser = localStorage.getItem('lasar_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const phone = (parsed.phone || parsed.identifier || '').replace(/\D/g, '');
        if (phone) {
          const stored = localStorage.getItem(`lasar_phone_history_${phone}`);
          return stored ? JSON.parse(stored) : [];
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [auditQueue, setAuditQueue] = useState({ pendingDishes: [], approvedDishes: [], rejectedDishes: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVegOnly, setFilterVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Checkout & Order Form
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    deliveryArea: '',
    address: '',
    landmark: ''
  });

  const [apiConnected, setApiConnected] = useState(false);

  // Time Slot Selection Modal
  const [slotModalOrder, setSlotModalOrder] = useState(null);
  const [customSlotInput, setCustomSlotInput] = useState('30-40 mins');

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

  // Keep phone history synced in local storage
  const saveUserOrdersLocally = (phone, ordersList) => {
    if (!phone) return;
    const clean = String(phone).replace(/\D/g, '');
    try {
      localStorage.setItem(`lasar_phone_history_${clean}`, JSON.stringify(ordersList));
    } catch {
      // ignore quota
    }
  };

  useEffect(() => {
    if (user) {
      const userPhone = (user.phone || user.identifier || '').replace(/\D/g, '');
      setCustomerForm(prev => ({
        ...prev,
        name: user.name || prev.name,
        phone: userPhone || prev.phone
      }));

      // Immediately restore this phone's stored history
      if (userPhone) {
        try {
          const localSaved = localStorage.getItem(`lasar_phone_history_${userPhone}`);
          if (localSaved) {
            setUserHistory(JSON.parse(localSaved));
          }
        } catch {
          // ignore
        }
      }
    }
  }, [user]);

  const safeFetchJson = async (url, options = {}) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second graceful timeout
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

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

  // Sync orders for Admin and Phone History
  const fetchOrders = async () => {
    if (isAdmin) {
      const res = await safeFetchJson(`${API_BASE}/api/orders?ts=` + Date.now());
      if (res.ok && Array.isArray(res.data)) {
        setOrders(res.data);
      }
    }

    const currentPhone = (user?.phone || user?.identifier || customerForm.phone || '').replace(/\D/g, '');
    if (currentPhone) {
      const userRes = await safeFetchJson(`${API_BASE}/api/orders/user/${currentPhone}?ts=` + Date.now());
      if (userRes.ok && Array.isArray(userRes.data)) {
        setUserHistory(userRes.data);
        saveUserOrdersLocally(currentPhone, userRes.data);
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
        checkHealth();
        fetchOrders();
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

  // Auth Handlers
  const handleRequestAuth = async (e) => {
    e.preventDefault();
    if (!loginName.trim()) return alert('Please enter your full name');

    let identifier = '';
    if (loginMethod === 'mobile') {
      const cleaned = loginPhone.trim().replace(/\D/g, '');
      if (cleaned.length !== 10) return alert('Please enter a 10-digit mobile number');
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
      setActiveTab('adminOrders');
    } else {
      if (enteredCode.trim() !== generatedOtp) {
        return alert('Incorrect verification code. Please check on-screen OTP.');
      }
      const cleanPhone = cleanIdentifier.length === 10 && !isNaN(cleanIdentifier) ? cleanIdentifier : '';
      const regularUser = {
        name: loginName.trim(),
        identifier: cleanIdentifier,
        phone: cleanPhone,
        email: cleanIdentifier.includes('@') ? cleanIdentifier : '',
        isAdmin: false
      };
      setUser(regularUser);
      localStorage.setItem('lasar_user', JSON.stringify(regularUser));

      // Instantly load this phone's cached history
      if (cleanPhone) {
        try {
          const cached = localStorage.getItem(`lasar_phone_history_${cleanPhone}`);
          if (cached) {
            setUserHistory(JSON.parse(cached));
          }
        } catch {
          // ignore
        }
      }

      setAuthStep(false);
      setEnteredCode('');
      setActiveTab('customer');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lasar_user');
    setUser(null);
    setCart([]);
    setActiveTab('customer');
    setAuthStep(false);
    setEnteredCode('');
    setIsAdminLoginAttempt(false);
  };

  // ADMIN APPROVES ORDER AND SETS DELIVERY TIME
  const submitAcceptOrderWithSlot = async (slotValue) => {
    if (!slotModalOrder) return;
    const orderId = slotModalOrder.orderId;
    const finalSlot = slotValue || customSlotInput || '30-40 mins';

    setOrders(prev => prev.map(o => o.orderId === orderId ? {
      ...o,
      paymentConfirmed: true,
      status: 'Confirmed & Preparing',
      deliverySlot: finalSlot
    } : o));

    setSlotModalOrder(null);

    await safeFetchJson(`${API_BASE}/api/orders/${orderId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliverySlot: finalSlot })
    });

    fetchOrders();
  };

  // ADMIN REJECTS UNPAID ORDER
  const handleRejectUnpaidOrder = async (orderId) => {
    setOrders(prev => prev.map(o => o.orderId === orderId ? {
      ...o,
      status: 'Rejected',
      paymentConfirmed: false,
      cancellationReason: 'Payment was not credited to Admin bank account'
    } : o));

    await safeFetchJson(`${API_BASE}/api/orders/${orderId}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Payment was not credited to Admin bank account' })
    });

    fetchOrders();
  };

  // ADVANCE FOOD STATUS OR DELIVER
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status: newStatus } : o));

    await safeFetchJson(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    fetchOrders();
  };

  // CLEAR ALL REJECTED ORDERS FROM MONGODB & VIEW
  const handleClearAllRejected = async () => {
    setOrders(prev => prev.filter(o => o.status !== 'Rejected' && o.status !== 'Cancelled'));
    await safeFetchJson(`${API_BASE}/api/orders/clear-all-rejected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    fetchOrders();
  };

  const handleAuditDecision = async (dishId, decision) => {
    const res = await safeFetchJson(`${API_BASE}/api/admin/audit-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dishId,
        decision,
        feedback: decision === 'approved' ? 'Approved by Master Admin' : 'Quality rejected'
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

    const res = await safeFetchJson(`${API_BASE}/api/menu/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newDish,
        price: Number(newDish.price),
        image: newDish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'
      })
    });

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

  // USER SUBMITS ORDER (Waits for database to save before redirecting to UPI)
  const handleInitiatePayment = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const cleanedPhone = customerForm.phone.trim().replace(/\D/g, '');
    if (cleanedPhone.length !== 10) return alert('Mobile number must be exactly 10 digits.');
    if (!customerForm.deliveryArea.trim()) return alert('Please enter delivery area.');
    if (!customerForm.address.trim()) return alert('Please enter complete delivery address.');
    if (!customerForm.landmark.trim()) return alert('Please enter nearest landmark.');

    setIsSubmittingOrder(true);

    const orderRes = await safeFetchJson(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customerForm.name.trim(),
        phone: cleanedPhone,
        deliveryArea: customerForm.deliveryArea.trim(),
        address: customerForm.address.trim(),
        landmark: customerForm.landmark.trim(),
        items: cart,
        totalAmount: cartTotal
      })
    });

    setIsSubmittingOrder(false);

    if (orderRes.ok && orderRes.data?.success) {
      const createdOrder = orderRes.data.order;
      setCart([]);
      setOrderModalOpen(false);

      // Save immediately to local device cache for this phone
      const updatedHistory = [createdOrder, ...userHistory.filter(o => o.orderId !== createdOrder.orderId)];
      setUserHistory(updatedHistory);
      saveUserOrdersLocally(cleanedPhone, updatedHistory);

      // Switch to history view so customer sees their pending status immediately
      setActiveTab('history');
      fetchOrders();

      // Launch UPI
      const upiUrl = `upi://pay?pa=${ADMIN_UPI}&pn=LASAR%20Home%20Food&am=${cartTotal}&cu=INR&tn=${encodeURIComponent('Order ' + createdOrder.orderId)}`;
      window.location.href = upiUrl;
    } else {
      alert('Could not submit order: ' + (orderRes.data?.error || orderRes.error || 'Server is waking up, please tap again in 5 seconds.'));
    }
  };

  const filteredDishes = menu.filter(dish => {
    const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (dish.description && dish.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesVeg = filterVegOnly ? dish.isVeg : true;
    const matchesCat = selectedCategory === 'All' ? true : dish.category === selectedCategory;
    return matchesSearch && matchesVeg && matchesCat;
  });

  const latestUserOrder = userHistory.length > 0 ? userHistory[0] : null;

  // Split orders for Admin view
  const pendingOrders = orders.filter(o => o.status === 'Pending Verification');
  const approvedActiveOrders = orders.filter(o => o.paymentConfirmed && o.status !== 'Delivered' && o.status !== 'Rejected' && o.status !== 'Cancelled');
  const rejectedOrders = orders.filter(o => o.status === 'Rejected' || o.status === 'Cancelled');

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
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, backgroundColor: loginMethod === 'mobile' ? '#ffffff' : 'transparent', color: loginMethod === 'mobile' ? '#fc8019' : '#686b78', boxShadow: loginMethod === 'mobile' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                  📱 Mobile Login
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod('gmail')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, backgroundColor: loginMethod === 'gmail' ? '#ffffff' : 'transparent', color: loginMethod === 'gmail' ? '#fc8019' : '#686b78', boxShadow: loginMethod === 'gmail' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
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
      
      {/* Top Navbar */}
      <header style={{ backgroundColor: '#ffffff', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fc8019 0%, #ff5200 100%)',
              color: '#ffffff',
              fontSize: 20,
              boxShadow: '0 4px 10px rgba(252, 128, 25, 0.3)'
            }}>
              🍲
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#282c3f', letterSpacing: '-0.3px' }}>LASAR</span>
                <span style={{ fontSize: 10, fontWeight: 800, backgroundColor: '#fc8019', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>HOME FOOD</span>
              </div>
              <div style={{ fontSize: 11, color: '#7e808c', marginTop: 1 }}>
                📍 {user.name} ({user.phone || user.identifier}) {isAdmin ? '🛡️ (Admin)' : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => { setActiveTab('customer'); fetchMenu(); }} style={{ padding: '6px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, backgroundColor: activeTab === 'customer' ? '#fc8019' : '#f0f0f5', color: activeTab === 'customer' ? '#fff' : '#3d4152' }}>
              🍽️ Menu
            </button>

            {/* Customers see "My Orders", Admin sees "Orders Received" */}
            {!isAdmin ? (
              <button onClick={() => { setActiveTab('history'); fetchOrders(); }} style={{ padding: '6px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, backgroundColor: activeTab === 'history' ? '#fc8019' : '#f0f0f5', color: activeTab === 'history' ? '#fff' : '#3d4152' }}>
                📜 My Orders ({userHistory.length})
              </button>
            ) : (
              <button onClick={() => { setActiveTab('adminOrders'); fetchOrders(); }} style={{ padding: '6px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, backgroundColor: activeTab === 'adminOrders' ? '#282c3f' : '#f0f0f5', color: activeTab === 'adminOrders' ? '#fff' : '#3d4152' }}>
                📦 Orders Received ({pendingOrders.length + approvedActiveOrders.length})
              </button>
            )}

            {isAdmin && (
              <button onClick={() => { setActiveTab('admin'); fetchAuditData(); fetchOrders(); }} style={{ padding: '6px 10px', borderRadius: 16, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, backgroundColor: activeTab === 'admin' ? '#282c3f' : '#f0f0f5', color: activeTab === 'admin' ? '#fff' : '#3d4152' }}>
                🛡️ Admin
              </button>
            )}

            <button onClick={handleLogout} style={{ padding: '6px 10px', borderRadius: 16, border: '1px solid #ffd8cc', backgroundColor: '#fff2ed', color: '#fc8019', cursor: 'pointer', fontWeight: 800, fontSize: 11 }}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: apiConnected ? '#eaf8f2' : '#fff5f0', padding: '3px 16px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: apiConnected ? '#0f8a65' : '#fc8019' }}>
          {apiConnected ? '● Cloud Kitchen Online • Accepting Orders' : '○ Connecting to Kitchen Server...'}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 860, margin: '14px auto', padding: '0 16px' }}>

        {/* VIEW A: CUSTOMER ORDER HISTORY (PERSISTENT LOG) */}
        {!isAdmin && activeTab === 'history' && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#282c3f', fontWeight: 900 }}>Your Orders History</h2>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#7e808c' }}>Orders placed under: <strong>{user.phone || customerForm.phone}</strong></p>
              </div>
              <button onClick={fetchOrders} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', backgroundColor: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                🔄 Refresh
              </button>
            </div>

            {userHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#7e808c' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📜</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#282c3f' }}>No Orders Found Yet</div>
                <p style={{ fontSize: 12, marginTop: 4 }}>Place an order from the menu to track it here live.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {userHistory.map(order => (
                  <div key={order.orderId} style={{
                    border: `1.5px solid ${
                      order.status === 'Rejected' || order.status === 'Cancelled' ? '#fecaca' :
                      order.status === 'Delivered' ? '#e2e8f0' :
                      order.paymentConfirmed ? '#bbf7d0' : '#fed7aa'
                    }`,
                    borderRadius: 12,
                    padding: 16,
                    backgroundColor: order.status === 'Rejected' || order.status === 'Cancelled' ? '#fef2f2' : '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f0f0f5', paddingBottom: 10, marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: '#282c3f' }}>#{order.orderId}</span>
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          backgroundColor: 
                            order.status === 'Rejected' || order.status === 'Cancelled' ? '#fee2e2' :
                            order.status === 'Delivered' ? '#f1f5f9' :
                            order.paymentConfirmed ? '#eaf8f2' : '#fffbeb',
                          color:
                            order.status === 'Rejected' || order.status === 'Cancelled' ? '#dc2626' :
                            order.status === 'Delivered' ? '#475569' :
                            order.paymentConfirmed ? '#0f8a65' : '#b45309',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontWeight: 900
                        }}>
                          {order.status === 'Rejected' || order.status === 'Cancelled' ? '❌ REJECTED (PAYMENT NOT RECEIVED)' :
                           order.status === 'Delivered' ? '📦 DELIVERED' :
                           order.status === 'Out for Delivery' ? '🛵 OUT FOR DELIVERY' :
                           order.paymentConfirmed ? '👨‍🍳 CONFIRMED & COOKING' : '⚠️ PENDING ADMIN APPROVAL'}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#fc8019' }}>₹{order.totalAmount}</div>
                    </div>

                    <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5, marginBottom: 8 }}>
                      <div>📍 <strong>Address:</strong> {order.deliveryArea}, {order.address}</div>
                      <div>🚩 <strong>Landmark:</strong> {order.landmark || 'N/A'}</div>
                      {order.deliverySlot && (
                        <div style={{ color: '#0f8a65', fontWeight: 800, marginTop: 4 }}>
                          🕒 <strong>Delivery Slot:</strong> {order.deliverySlot}
                        </div>
                      )}
                      {order.cancellationReason && (
                        <div style={{ color: '#dc2626', fontWeight: 800, marginTop: 4 }}>
                          ⚠️ <strong>Admin Note:</strong> {order.cancellationReason}
                        </div>
                      )}
                      {order.paymentConfirmed && order.status !== 'Rejected' && order.status !== 'Cancelled' && (
                        <div style={{ color: '#0f8a65', fontWeight: 800, marginTop: 4 }}>
                          🔐 Delivery Passcode: {order.otp}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      <strong>Items:</strong> {order.items?.map(i => `${i.name} (x${i.qty})`).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW B: CUSTOMER MENU & LATEST ORDER LIVE TRACKER */}
        {activeTab === 'customer' && (
          <div>
            {/* Live Latest Order Status Box */}
            {latestUserOrder && latestUserOrder.status !== 'Delivered' && (
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                padding: 18,
                marginBottom: 16,
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                borderLeft: `6px solid ${
                  latestUserOrder.status === 'Rejected' || latestUserOrder.status === 'Cancelled' ? '#e43b4f' :
                  latestUserOrder.paymentConfirmed ? '#0f8a65' : '#f59e0b'
                }`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'gap', gap: 8 }}>
                  <div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: latestUserOrder.status === 'Rejected' || latestUserOrder.status === 'Cancelled' ? '#e43b4f' :
                             latestUserOrder.paymentConfirmed ? '#0f8a65' : '#b45309',
                      letterSpacing: 0.8,
                      textTransform: 'uppercase'
                    }}>
                      {latestUserOrder.status === 'Rejected' || latestUserOrder.status === 'Cancelled'
                        ? '❌ ORDER REJECTED (PAYMENT NOT RECEIVED)'
                        : latestUserOrder.status === 'Out for Delivery'
                        ? '🛵 OUT FOR DELIVERY'
                        : latestUserOrder.paymentConfirmed
                        ? '✅ ORDER CONFIRMED & PREPARING'
                        : '⚠️ ORDER PENDING — NOT CONFIRMED YET'}
                    </span>
                    <h3 style={{ margin: '2px 0', fontSize: 16, color: '#282c3f' }}>Order #{latestUserOrder.orderId}</h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>
                      Delivery to: <strong>{latestUserOrder.deliveryArea || 'Home'}</strong>, {latestUserOrder.address}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {latestUserOrder.paymentConfirmed && latestUserOrder.status !== 'Rejected' && latestUserOrder.status !== 'Cancelled' && (
                      <>
                        <span style={{ fontSize: 10, color: '#7e808c', display: 'block' }}>Passcode</span>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#282c3f' }}>{latestUserOrder.otp}</div>
                      </>
                    )}
                  </div>
                </div>

                {latestUserOrder.status === 'Rejected' || latestUserOrder.status === 'Cancelled' ? (
                  <div style={{
                    marginTop: 10,
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: '#991b1b',
                    fontWeight: 700
                  }}>
                    ❌ <strong>Order Rejected:</strong> Admin checked bank records and could not find your payment transfer. This order will not be prepared.
                  </div>
                ) : !latestUserOrder.paymentConfirmed ? (
                  <div style={{
                    marginTop: 10,
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: '#92400e',
                    fontWeight: 700
                  }}>
                    ⏳ <strong>Verification in progress:</strong> Admin is cross-checking incoming funds in the bank. Your order will be confirmed only after bank credit is verified.
                  </div>
                ) : (
                  <div style={{
                    marginTop: 10,
                    backgroundColor: '#eaf8f2',
                    border: '1px solid #a3e6cb',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#065f46',
                    fontWeight: 800
                  }}>
                    🕒 Delivery Slot: <strong>{latestUserOrder.deliverySlot || '30-40 mins'}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Search and Veg Toggle Filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search for dishes, thalis, desserts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '11px 16px', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: 14, outline: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
              />
              <button
                onClick={() => setFilterVegOnly(!filterVegOnly)}
                style={{ padding: '8px 14px', borderRadius: 12, border: `2px solid ${filterVegOnly ? '#0f8a65' : '#e2e8f0'}`, backgroundColor: filterVegOnly ? '#eaf8f2' : '#ffffff', color: filterVegOnly ? '#0f8a65' : '#3d4152', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>
                🟢 Veg
              </button>
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 20,
                    border: 'none',
                    backgroundColor: selectedCategory === cat ? '#fc8019' : '#ffffff',
                    color: selectedCategory === cat ? '#ffffff' : '#3d4152',
                    fontSize: 12,
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
              <div style={{ textAlign: 'center', padding: '50px 20px', backgroundColor: '#fff', borderRadius: 16 }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>🍲</div>
                <h3 style={{ margin: '0 0 4px 0', color: '#282c3f', fontSize: 16 }}>Kitchen Menu is Updating</h3>
                <p style={{ margin: 0, color: '#7e808c', fontSize: 12 }}>Dishes will appear here once approved by Admin.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 16, color: '#282c3f', margin: '0 0 16px 0', fontWeight: 900 }}>
                  Recommended Dishes ({filteredDishes.length})
                </h2>

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
                          <h3 style={{ margin: '4px 0 2px 0', fontSize: 15, color: '#282c3f', fontWeight: 800 }}>{dish.name}</h3>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#3e4152', marginBottom: 4 }}>₹{dish.price}</div>
                          <p style={{ margin: 0, fontSize: 12, color: '#7e808c', lineHeight: 1.4 }}>{dish.description}</p>
                        </div>

                        <div style={{ position: 'relative', width: 110, height: 95, flexShrink: 0 }}>
                          <img src={dish.image} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
                          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', width: '85%' }}>
                            {cartItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', border: '1px solid #d4d5d9', borderRadius: 6, padding: '3px 6px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                                <button onClick={() => removeFromCart(dishId)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontSize: 12, fontWeight: 900, color: '#fc8019' }}>{cartItem.qty}</span>
                                <button onClick={() => addToCart(dish)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(dish)} style={{ width: '100%', backgroundColor: '#ffffff', color: '#fc8019', border: '1px solid #fc8019', borderRadius: 6, padding: '5px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
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

        {/* VIEW C: ADMIN "ORDERS RECEIVED" DASHBOARD */}
        {isAdmin && activeTab === 'adminOrders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* 1. INCOMING UNVERIFIED ORDERS */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', borderTop: '4px solid #fc8019' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 16, color: '#282c3f', fontWeight: 900 }}>
                    Orders Awaiting Verification ({pendingOrders.length})
                  </h2>
                  <p style={{ margin: 0, fontSize: 11, color: '#7e808c' }}>Check your UPI app. Confirm only after funds reflect.</p>
                </div>
                <button onClick={fetchOrders} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                  🔄 Refresh
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7e808c', fontSize: 13 }}>
                  🎉 No pending orders awaiting approval!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {pendingOrders.map(order => (
                    <div key={order.orderId} style={{ border: '1.5px solid #fed7aa', borderRadius: 10, padding: 14, backgroundColor: '#fffaf5' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #ffedd5', paddingBottom: 8, marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: '#282c3f' }}>#{order.orderId}</span>
                          <span style={{ marginLeft: 8, fontSize: 10, backgroundColor: '#fffbeb', color: '#b45309', padding: '3px 8px', borderRadius: 6, fontWeight: 900 }}>
                            ⚠️ UNVERIFIED REQUEST
                          </span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#fc8019' }}>₹{order.totalAmount}</div>
                      </div>

                      <div style={{ backgroundColor: '#ffffff', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12, lineHeight: 1.5, border: '1px solid #ffedd5' }}>
                        <div>👤 <strong>Customer:</strong> {order.customerName} (📞 <a href={`tel:${order.phone}`} style={{ color: '#fc8019', fontWeight: 800 }}>{order.phone}</a>)</div>
                        <div>📍 <strong>Area:</strong> <span style={{ color: '#fc8019', fontWeight: 800 }}>{order.deliveryArea}</span></div>
                        <div>🏠 <strong>Address:</strong> {order.address}</div>
                        <div>🚩 <strong>Landmark:</strong> {order.landmark || 'N/A'}</div>
                        <div style={{ marginTop: 2, color: '#0f8a65', fontWeight: 800 }}>🔐 Passcode: {order.otp}</div>
                      </div>

                      <div style={{ fontSize: 11, color: '#686b78', marginBottom: 12 }}>
                        <strong>Dishes:</strong> {order.items?.map(i => `${i.name} (x${i.qty})`).join(', ')}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => { setSlotModalOrder(order); setCustomSlotInput('30-40 mins'); }}
                          style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', backgroundColor: '#0f8a65', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', boxShadow: '0 2px 6px rgba(15,138,101,0.2)' }}>
                          ✓ Approve Payment & Confirm Order
                        </button>
                        <button 
                          onClick={() => handleRejectUnpaidOrder(order.orderId)}
                          style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ef4444', backgroundColor: '#ffffff', color: '#dc2626', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                          ✕ Reject Payment (Unpaid)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. APPROVED & ACTIVE IN THE KITCHEN */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', borderTop: '4px solid #0f8a65' }}>
              <h2 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#282c3f', fontWeight: 900 }}>
                Active Kitchen Orders ({approvedActiveOrders.length})
              </h2>

              {approvedActiveOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 12 }}>No active cooking orders.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {approvedActiveOrders.map(order => (
                    <div key={order.orderId} style={{ border: '1.5px solid #bbf7d0', borderRadius: 10, padding: 12, backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f0f0f5', paddingBottom: 6, marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#282c3f' }}>#{order.orderId}</span>
                          <span style={{ marginLeft: 8, fontSize: 10, backgroundColor: '#eaf8f2', color: '#0f8a65', padding: '2px 6px', borderRadius: 4, fontWeight: 900 }}>
                            ✓ {order.status.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#fc8019' }}>₹{order.totalAmount}</div>
                      </div>

                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                        <div>👤 {order.customerName} (📞 {order.phone}) • 📍 {order.deliveryArea}</div>
                        {order.deliverySlot && <div style={{ color: '#0f8a65', fontWeight: 800 }}>🕒 Delivery Slot: {order.deliverySlot}</div>}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Food is being prepared')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Food is being prepared' ? '#282c3f' : '#f0f0f5', color: order.status === 'Food is being prepared' ? '#fff' : '#333', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                          🍳 Cooking
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Out for Delivery')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Out for Delivery' ? '#282c3f' : '#f0f0f5', color: order.status === 'Out for Delivery' ? '#fff' : '#333', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                          🛵 Out for Delivery
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Delivered')}
                          style={{ padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: '#0f8a65', color: '#fff', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                          ✓ Delivered
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. REJECTED ORDERS SECTION */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', borderTop: '4px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 16, color: '#991b1b', fontWeight: 900 }}>
                    Rejected / Cancelled Orders ({rejectedOrders.length})
                  </h2>
                  <p style={{ margin: 0, fontSize: 11, color: '#7e808c' }}>Orders rejected for lack of payment.</p>
                </div>
                {rejectedOrders.length > 0 && (
                  <button
                    onClick={handleClearAllRejected}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ef4444', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                    🗑️ Clear All Rejected Orders
                  </button>
                )}
              </div>

              {rejectedOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 12 }}>No rejected orders. Queue is clean!</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rejectedOrders.map(order => (
                    <div key={order.orderId} style={{ border: '1px solid #fecaca', borderRadius: 8, padding: 10, backgroundColor: '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: '#991b1b' }}>
                        <strong>#{order.orderId}</strong> — {order.customerName} ({order.phone}) • ₹{order.totalAmount}
                        <div style={{ fontSize: 10, color: '#7f1d1d', marginTop: 2 }}>❌ Rejected: Payment not received</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW D: MASTER ADMIN AUDIT & DISH MANAGEMENT */}
        {isAdmin && activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Dish Upload Form */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 2px 0', fontSize: 16, color: '#282c3f', fontWeight: 900 }}>Kitchen Dish Upload</h2>
              <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#7e808c' }}>Submit dish samples for Quality & Taste Audit.</p>

              <form onSubmit={handlePartnerUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>Dish Name *</label>
                  <input required type="text" placeholder="e.g. Special Paneer Thali" value={newDish.name} onChange={e => setNewDish({ ...newDish, name: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>Price (₹) *</label>
                    <input required type="number" placeholder="80" value={newDish.price} onChange={e => setNewDish({ ...newDish, price: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>Category</label>
                    <select value={newDish.category} onChange={e => setNewDish({ ...newDish, category: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                      {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>Dietary Type</label>
                  <select value={newDish.isVeg ? 'veg' : 'nonveg'} onChange={e => setNewDish({ ...newDish, isVeg: e.target.value === 'veg' })} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}>
                    <option value="veg">🟢 Pure Veg</option>
                    <option value="nonveg">🔴 Non-Veg</option>
                  </select>
                </div>

                <div style={{ border: '2px dashed #fc8019', padding: '14px', borderRadius: 8, backgroundColor: '#fff9f5', textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#fc8019', marginBottom: 6, cursor: 'pointer' }}>
                    📷 Choose Dish Photo (Gallery / Camera)
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  {newDish.image ? (
                    <div style={{ marginTop: 6 }}>
                      <img src={newDish.image} alt="Preview" style={{ width: 100, height: 85, objectFit: 'cover', borderRadius: 6, border: '2px solid #fc8019' }} />
                      <div style={{ fontSize: 10, color: '#0f8a65', fontWeight: 800, marginTop: 2 }}>✓ Photo Ready</div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 11, color: '#777' }}>Tap here to attach photo</p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>Description</label>
                  <textarea rows={2} placeholder="Ingredients, recipe details..." value={newDish.description} onChange={e => setNewDish({ ...newDish, description: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <button type="submit" style={{ backgroundColor: '#fc8019', color: '#fff', border: 'none', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
                  Submit Dish for Taste & Quality Audit
                </button>
              </form>
            </div>

            {/* Quality Audit */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', borderTop: '4px solid #282c3f' }}>
              <h2 style={{ margin: '0 0 2px 0', fontSize: 16, color: '#282c3f', fontWeight: 900 }}>Taste & Quality Audit ({auditQueue.pendingDishes.length})</h2>
              <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#7e808c' }}>Approve dishes before they go live on customer menu.</p>

              {auditQueue.pendingDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 12 }}>No dishes awaiting approval.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {auditQueue.pendingDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 70, height: 60, borderRadius: 6, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: 14, color: '#282c3f' }}>{dish.name} • ₹{dish.price}</h4>
                          <p style={{ margin: '2px 0', fontSize: 11, color: '#686b78' }}>{dish.description}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button onClick={() => handleAuditDecision(dishId, 'approved')} style={{ backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 5, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => handleAuditDecision(dishId, 'rejected')} style={{ backgroundColor: '#fff', color: '#e43b4f', border: '1px solid #e43b4f', padding: '5px 10px', borderRadius: 5, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Dishes */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 2px 0', fontSize: 16, color: '#282c3f', fontWeight: 900 }}>Live Certified Dishes ({auditQueue.approvedDishes.length})</h2>
              <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#7e808c' }}>Edit dish prices or remove items completely.</p>

              {auditQueue.approvedDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 12 }}>No live dishes right now.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {auditQueue.approvedDishes.map(dish => {
                    const dishId = dish._id || dish.id;
                    return (
                      <div key={dishId} style={{ border: '1px solid #e8e8e8', backgroundColor: '#fafbfc', borderRadius: 8, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <img src={dish.image} alt={dish.name} style={{ width: 70, height: 60, borderRadius: 6, objectFit: 'cover' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: dish.isVeg ? '#0f8a65' : '#e43b4f', fontWeight: 800 }}>{dish.isVeg ? '🟢 VEG' : '🔴 NON-VEG'}</div>
                          <h4 style={{ margin: '2px 0', fontSize: 14, color: '#282c3f' }}>{dish.name}</h4>
                          <div style={{ fontSize: 13, fontWeight: 900, color: '#fc8019' }}>₹{dish.price}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button onClick={() => handleUpdatePrice(dishId, dish.price)} style={{ backgroundColor: '#282c3f', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 5, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                            ✏️ Edit Price
                          </button>
                          <button onClick={() => handleDeleteDish(dishId, dish.name)} style={{ backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', padding: '5px 10px', borderRadius: 5, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
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
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: '92%', maxWidth: 640, backgroundColor: '#fc8019', color: '#ffffff', borderRadius: 12, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 24px rgba(252, 128, 25, 0.4)', zIndex: 1000 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.9 }}>{cart.reduce((a, b) => a + b.qty, 0)} Items Added</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>₹{cartTotal}</div>
          </div>
          <button onClick={() => setOrderModalOpen(true)} style={{ backgroundColor: 'transparent', color: '#ffffff', border: 'none', fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            VIEW CART & CHECKOUT →
          </button>
        </div>
      )}

      {/* REDESIGNED ADDRESS & PAYMENT MODAL */}
      {orderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 14 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 440, padding: 22, maxHeight: '92vh', overflowY: 'auto', border: '2px solid #fed7aa', boxShadow: '0 20px 40px rgba(252,128,25,0.18)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1.5px solid #fff2eb', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 24 }}>📍</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: '#1e293b', fontWeight: 900 }}>Delivery Details</h3>
                  <span style={{ fontSize: 11, color: '#fc8019', fontWeight: 700 }}>Enter your exact location below</span>
                </div>
              </div>
              <button onClick={() => setOrderModalOpen(false)} style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: 30, height: 30, fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleInitiatePayment}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1.2 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#334155', marginBottom: 4 }}>Full Name</label>
                  <input required type="text" placeholder="e.g. Rahul Sharma" value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc', boxSizing: 'border-box', fontSize: 13, outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#334155', marginBottom: 4 }}>Mobile Number</label>
                  <input required type="tel" maxLength={10} pattern="[0-9]{10}" placeholder="10-digit number" value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value.replace(/\D/g, '') })} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc', boxSizing: 'border-box', fontSize: 13, outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#ea580c', marginBottom: 4 }}>
                  🏙️ Delivery Area / Locality / Sector *
                </label>
                <input required type="text" placeholder="e.g. Sector 62 / Raj Nagar / Shastri Nagar" value={customerForm.deliveryArea} onChange={e => setCustomerForm({ ...customerForm, deliveryArea: e.target.value })} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '2px solid #fdba74', backgroundColor: '#fff7ed', boxSizing: 'border-box', fontSize: 13, color: '#9a3412', fontWeight: 800, outline: 'none' }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
                  🏠 Complete House / Flat / Street Address *
                </label>
                <textarea required rows={2} placeholder="Flat no., building name, street..." value={customerForm.address} onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #cbd5e1', backgroundColor: '#f8fafc', boxSizing: 'border-box', fontSize: 13, outline: 'none' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
                  🚩 Nearest Landmark / Famous Shop *
                </label>
                <input required type="text" placeholder="e.g. Near City Hospital / Opp. Bank" value={customerForm.landmark} onChange={e => setCustomerForm({ ...customerForm, landmark: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #cbd5e1', backgroundColor: '#f8fafc', boxSizing: 'border-box', fontSize: 13, outline: 'none' }} />
              </div>

              <div style={{ backgroundColor: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#c2410c' }}>ORDER TOTAL</span>
                  <span style={{ fontSize: 19, fontWeight: 900, color: '#ea580c' }}>₹{cartTotal}</span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: 11, color: '#7c2d12', lineHeight: 1.4 }}>
                  Tapping below opens your UPI app to transfer <strong>₹{cartTotal}</strong> to Admin ({ADMIN_PHONE}). Your order will be sent to the kitchen.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmittingOrder}
                style={{ width: '100%', backgroundColor: '#0f8a65', color: '#fff', border: 'none', padding: 14, borderRadius: 10, fontWeight: 900, fontSize: 15, cursor: isSubmittingOrder ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(15,138,101,0.3)' }}>
                {isSubmittingOrder ? 'Saving Order...' : `⚡ Open UPI App & Pay ₹${cartTotal}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MOBILE TIME SLOT MODAL FOR ADMIN */}
      {slotModalOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 17, color: '#282c3f', fontWeight: 900 }}>
              Verify & Set Delivery Time
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#686b78' }}>
              Confirm credit for Order #{slotModalOrder.orderId} and select expected delivery window:
            </p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {['25-35 mins', '35-45 mins', '45-60 mins'].map(slot => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => submitAcceptOrderWithSlot(slot)}
                  style={{
                    flex: 1,
                    padding: '9px 4px',
                    borderRadius: 8,
                    border: '1.5px solid #0f8a65',
                    backgroundColor: '#eaf8f2',
                    color: '#0f8a65',
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}>
                  {slot}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#282c3f', marginBottom: 4 }}>Or Custom Time Window</label>
              <input
                type="text"
                placeholder="e.g. 1:15 PM - 1:45 PM"
                value={customSlotInput}
                onChange={e => setCustomSlotInput(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setSlotModalOrder(null)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid #ccc', backgroundColor: '#f0f0f5', color: '#666', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitAcceptOrderWithSlot(customSlotInput)}
                style={{ flex: 1.5, padding: '11px 0', borderRadius: 8, border: 'none', backgroundColor: '#0f8a65', color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,138,101,0.25)' }}>
                Confirm & Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}