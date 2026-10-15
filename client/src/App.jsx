import React, { useState, useEffect } from 'react';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://lasar-food-aap.onrender.com'; // <--- paste your copied Render URL here (no trailing slash)

export default function App() {
  const [activeTab, setActiveTab] = useState('customer');
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [auditQueue, setAuditQueue] = useState({ pendingDishes: [], approvedDishes: [], rejectedDishes: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVegOnly, setFilterVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', address: '' });
  const [activeCustomerOrder, setActiveCustomerOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);

  // Partner Form State
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
          // If active customer order was deleted (purged upon delivery), clear from customer UI
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
    fetchMenu();
    fetchAuditData();
    fetchOrders();

    // Auto-poll orders every 3.5 seconds
    const interval = setInterval(() => {
      fetchOrders();
    }, 3500);
    return () => clearInterval(interval);
  }, [activeCustomerOrder?.orderId]);

  // Update Status & Purge upon Delivery
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const result = await res.json();
      
      if (result.purged) {
        alert(`Order #${orderId} delivered! Customer data has been permanently cleared from database and app.`);
        // Immediately remove from state
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

  // Admin Action: Approve / Reject
  const handleAuditDecision = async (dishId, decision) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/audit-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId,
          decision,
          feedback: decision === 'approved' ? 'Approved by Master Admin' : 'Rejected'
        })
      });
      if (res.ok) {
        alert(decision === 'approved' ? 'Dish Approved & Live on Customer Menu!' : 'Dish Rejected');
        fetchAuditData();
        fetchMenu();
      }
    } catch (err) {
      alert('Error updating decision: ' + err.message);
    }
  };

  // Admin Action: Edit Price
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

  // Admin Action: Delete Dish
  const handleDeleteDish = async (dishId, dishName) => {
    const confirmDelete = window.confirm(`Admin: Permanently delete "${dishName}" from database?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/dish/${dishId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert(`"${dishName}" deleted successfully!`);
        fetchAuditData();
        fetchMenu();
      }
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Photo Compression
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

  // Partner Submit Dish
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
        alert('🎉 Dish uploaded! Now in the Master Admin Taste & Quality Queue.');
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

  // Customer Place Order
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerForm.name,
          phone: customerForm.phone,
          address: customerForm.address,
          items: cart,
          totalAmount: cartTotal
        })
      });
      const data = await res.json();
      if (data.success) {
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

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif', backgroundColor: '#f4f5f7', minHeight: '100vh', margin: 0, paddingBottom: 110 }}>
      {/* Top Header */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 850, margin: '0 auto', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fc8019', letterSpacing: '-0.5px', lineHeight: 1 }}>LASAR</div>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#686b78', letterSpacing: '0.8px' }}>THE HOME LIKE FOOD</div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setActiveTab('customer'); fetchMenu(); }} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, backgroundColor: activeTab === 'customer' ? '#fc8019' : '#f0f0f5', color: activeTab === 'customer' ? '#fff' : '#3d4152' }}>
              🍽️ Menu
            </button>
            <button onClick={() => { setActiveTab('partner'); fetchOrders(); }} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, backgroundColor: activeTab === 'partner' ? '#fc8019' : '#f0f0f5', color: activeTab === 'partner' ? '#fff' : '#3d4152' }}>
              👨‍🍳 Kitchen ({orders.length})
            </button>
            <button onClick={() => { setActiveTab('admin'); fetchAuditData(); fetchOrders(); }} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, backgroundColor: activeTab === 'admin' ? '#282c3f' : '#f0f0f5', color: activeTab === 'admin' ? '#fff' : '#3d4152' }}>
              🛡️ Admin
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: apiConnected ? '#e5f7f1' : '#ffebee', padding: '4px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: apiConnected ? '#0f8a65' : '#c62828' }}>
          {apiConnected ? '● Backend API Connected' : '○ Connecting to Backend...'}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: 750, margin: '16px auto', padding: '0 14px' }}>

        {/* 1. CUSTOMER TAB */}
        {activeTab === 'customer' && (
          <div>
            {/* Live Customer Order Tracker */}
            {activeCustomerOrder && (
              <div style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: '6px solid #fc8019', boxShadow: '0 3px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#fc8019', textTransform: 'uppercase' }}>Active Delivery</span>
                    <h3 style={{ margin: '2px 0', fontSize: 16, color: '#282c3f' }}>Order #{activeCustomerOrder.orderId}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#777' }}>Delivery OTP:</span>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#0f8a65' }}>{activeCustomerOrder.otp}</div>
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

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Search home food..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d4d5d9', fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={() => setFilterVegOnly(!filterVegOnly)}
                style={{ padding: '8px 14px', borderRadius: 10, border: `2px solid ${filterVegOnly ? '#0f8a65' : '#e0e0e0'}`, backgroundColor: filterVegOnly ? '#e5f7f1' : '#fff', color: filterVegOnly ? '#0f8a65' : '#3d4152', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                🟢 Pure Veg
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 16 }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #e0e0e0', backgroundColor: selectedCategory === cat ? '#3d4152' : '#ffffff', color: selectedCategory === cat ? '#ffffff' : '#3d4152', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  {cat}
                </button>
              ))}
            </div>

            {filteredDishes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', backgroundColor: '#fff', borderRadius: 14 }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🍲</div>
                <h3 style={{ margin: '0 0 6px 0', color: '#282c3f', fontSize: 18 }}>No Live Dishes Right Now</h3>
                <p style={{ margin: 0, color: '#7e808c', fontSize: 13 }}>Submitted food items appear here after Master Admin audit approval.</p>
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
                            ✓ TASTE AUDIT PASSED
                          </div>
                        </div>

                        <div style={{ position: 'relative', width: 110, height: 95, flexShrink: 0 }}>
                          <img src={dish.image} alt={dish.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', width: '85%' }}>
                            {cartItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', border: '1px solid #d4d5d9', borderRadius: 6, padding: '3px 6px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                                <button onClick={() => removeFromCart(dishId)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>-</button>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#1ba672' }}>{cartItem.qty}</span>
                                <button onClick={() => addToCart(dish)} style={{ border: 'none', background: 'none', color: '#fc8019', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(dish)} style={{ width: '100%', backgroundColor: '#ffffff', color: '#1ba672', border: '1px solid #d4d5d9', borderRadius: 6, padding: '5px 0', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
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

        {/* 2. KITCHEN PARTNER TAB (ACTIVE DISPATCH & PERMANENT DELETE ON DELIVERED) */}
        {activeTab === 'partner' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '4px solid #fc8019' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 18, color: '#282c3f' }}>Kitchen Live Orders ({orders.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>Marking "Delivered" automatically deletes customer details from the database.</p>
                </div>
                <button onClick={fetchOrders} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>🔄 Refresh</button>
              </div>

              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#7e808c', fontSize: 13 }}>
                  🎉 No active orders. All previous order records are completely cleared from database!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {orders.map(order => (
                    <div key={order.orderId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#fc8019' }}>#{order.orderId}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: '#eee', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{order.status}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f8a65' }}>₹{order.totalAmount} (COD)</div>
                      </div>

                      {/* Customer Details Box */}
                      <div style={{ backgroundColor: '#fff9f5', border: '1px solid #ffe3d1', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#282c3f' }}>👤 Customer: {order.customerName}</div>
                        <div style={{ fontSize: 13, color: '#282c3f', marginTop: 2 }}>
                          📞 Phone: <a href={`tel:${order.phone}`} style={{ color: '#fc8019', fontWeight: 800 }}>{order.phone}</a>
                        </div>
                        <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>📍 <strong>Address:</strong> {order.address}</div>
                        <div style={{ fontSize: 12, color: '#0f8a65', marginTop: 4, fontWeight: 800 }}>🔐 Verification OTP: {order.otp}</div>
                      </div>

                      <div style={{ fontSize: 12, color: '#686b78', marginBottom: 10 }}>
                        <strong>Items:</strong> {order.items?.map(i => `${i.name} (x${i.qty})`).join(', ')}
                      </div>

                      {/* Status Buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Food is being prepared')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Food is being prepared' ? '#fc8019' : '#f0f0f5', color: order.status === 'Food is being prepared' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          🍳 Preparing
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Food Ready')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Food Ready' ? '#fc8019' : '#f0f0f5', color: order.status === 'Food Ready' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          📦 Food Ready
                        </button>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Out for Delivery')}
                          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', backgroundColor: order.status === 'Out for Delivery' ? '#fc8019' : '#f0f0f5', color: order.status === 'Out for Delivery' ? '#fff' : '#333', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
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
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Submit dish samples for Master Admin Quality & Taste Audit.</p>

              <form onSubmit={handlePartnerUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Dish Name *</label>
                  <input required type="text" placeholder="e.g. Samosa, Dal Makhani" value={newDish.name} onChange={e => setNewDish({ ...newDish, name: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Price (₹) *</label>
                    <input required type="number" placeholder="10" value={newDish.price} onChange={e => setNewDish({ ...newDish, price: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
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

                <div style={{ border: '2px dashed #fc8019', padding: '14px', borderRadius: 10, backgroundColor: '#fff9f5', textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#fc8019', marginBottom: 8, cursor: 'pointer' }}>
                    📷 Select Photo from Phone Gallery or Camera
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  </label>
                  {newDish.image ? (
                    <div style={{ marginTop: 8 }}>
                      <img src={newDish.image} alt="Dish Preview" style={{ width: 120, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #fc8019' }} />
                      <div style={{ fontSize: 11, color: '#0f8a65', fontWeight: 700, marginTop: 4 }}>✓ Photo Ready</div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#777' }}>Tap to select food image</p>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Description</label>
                  <textarea rows={2} placeholder="Ingredients and home recipe details..." value={newDish.description} onChange={e => setNewDish({ ...newDish, description: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <button disabled={isSubmitting} type="submit" style={{ backgroundColor: '#fc8019', color: '#fff', border: 'none', padding: 14, borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: 'pointer', marginTop: 4 }}>
                  {isSubmitting ? 'Uploading...' : 'Submit Dish for LASAR Taste & Quality Audit'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. MASTER ADMIN CONTROLS TAB */}
        {activeTab === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Live Orders Overview for Master Admin */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderTop: '4px solid #282c3f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Master Admin Live Orders ({orders.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: '#7e808c' }}>Delivered orders are automatically purged to save database capacity.</p>
                </div>
                <button onClick={fetchOrders} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>🔄 Refresh</button>
              </div>

              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 13 }}>No active orders in database.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {orders.map(order => (
                    <div key={order.orderId} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, backgroundColor: '#fbfbfb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 800, color: '#282c3f' }}>Order #{order.orderId}</span>
                        <span style={{ fontWeight: 800, color: '#fc8019' }}>₹{order.totalAmount}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>
                        Customer: <strong>{order.customerName}</strong> ({order.phone})
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        Address: <strong>{order.address}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 11, backgroundColor: '#e5f7f1', color: '#0f8a65', padding: '2px 8px', borderRadius: 4, fontWeight: 800 }}>
                          Status: {order.status}
                        </span>
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.orderId, 'Delivered')}
                          style={{ backgroundColor: '#c62828', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          Purge & Finish Delivery
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Audits Queue */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Taste Audit Queue ({auditQueue.pendingDishes.length})</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#7e808c' }}>Approve or reject dishes before they appear on the menu.</p>

              {auditQueue.pendingDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#7e808c', fontSize: 13 }}>No dishes awaiting initial approval.</div>
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

            {/* Live Certified Dishes Management */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#282c3f' }}>Live Certified Menu ({auditQueue.approvedDishes.length})</h2>
                <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#7e808c' }}>Only Master Admin can modify prices or permanently delete dishes.</p>
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
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#fc8019', marginTop: 2 }}>Current Price: ₹{dish.price}</div>
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

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && activeTab === 'customer' && (
        <div style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '92%', maxWidth: 600, backgroundColor: '#60b246', color: '#ffffff', borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 1000 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.9 }}>{cart.reduce((a, b) => a + b.qty, 0)} Items Added</div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>₹{cartTotal}</div>
          </div>
          <button onClick={() => setOrderModalOpen(true)} style={{ backgroundColor: 'transparent', color: '#ffffff', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            VIEW CART & CHECKOUT →
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {orderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 14 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 420, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#282c3f' }}>Delivery Details</h3>
              <button onClick={() => setOrderModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handlePlaceOrder}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Full Name</label>
                <input required type="text" placeholder="e.g. Rahul Sharma" value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Phone Number</label>
                <input required type="tel" placeholder="e.g. 9876543210" value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Exact Delivery Address (Street / Flat / Area)</label>
                <textarea required rows={3} placeholder="House No, Floor, Landmark..." value={customerForm.address} onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ backgroundColor: '#f9f9f9', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Item Total</span>
                  <span>₹{cartTotal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>To Pay (COD)</span>
                  <span>₹{cartTotal}</span>
                </div>
              </div>

              <button type="submit" style={{ width: '100%', backgroundColor: '#60b246', color: '#fff', border: 'none', padding: 12, borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                Place Cash on Delivery Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}