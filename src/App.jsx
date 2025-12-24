import React, { useState, useEffect } from 'react';
import { 
  User, Lock, ShoppingBag, ChefHat, ArrowLeft, 
  CreditCard, Clock, Package, LogOut, Plus, Minus, QrCode, Trash2 
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, updateDoc, doc, 
  onSnapshot, query, where, getDocs, setDoc 
} from "firebase/firestore";

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyABbWLb_tUSfVVHTXokcnX7m1aJLR16M5M",
  authDomain: "tabetai-app-4cd22.firebaseapp.com",
  projectId: "tabetai-app-4cd22",
  storageBucket: "tabetai-app-4cd22.firebasestorage.app",
  messagingSenderId: "314181871660",
  appId: "1:314181871660:web:923c4db17c9531f7468989"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const App = () => {
  // --- STATE ---
  const [currentScreen, setCurrentScreen] = useState('login'); 
  const [currentUser, setCurrentUser] = useState(null); 
  
  // Data Realtime dari Firebase
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);

  // Helper Format Rupiah
  const formatRupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

  // Helper Gambar (DIPINDAHKAN KE SINI AGAR BISA DIAKSES SEMUA)
  const getProductImage = (productName) => {
    if (!productName) return '/logo.png';
    const name = productName.toLowerCase();
    if (name.includes('salmon')) return '/salmon.png';
    if (name.includes('tuna')) return '/tuna.png';
    if (name.includes('chicken')) return '/chicken.png';
    return '/logo.png'; 
  };

  // --- REALTIME LISTENERS (Jantung Aplikasi) ---
  useEffect(() => {
    // 1. Dengar perubahan Produk & Stok
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // LOGIKA SEEDING (Otomatis isi data jika database kosong)
      if (productsData.length === 0) {
        seedDatabase();
      } else {
        // Sortir agar urutan tidak acak (berdasarkan ID manual atau nama)
        setProducts(productsData.sort((a,b) => a.sortOrder - b.sortOrder));
      }
    });

    // 2. Dengar perubahan Pesanan
    // Query order berdasarkan waktu agar yang terbaru diatas
    const q = query(collection(db, "orders"));
    const unsubOrders = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort manual by timestamp string (simple approach)
      setOrders(ordersData.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  // Fungsi untuk mengisi Database pertama kali (Auto Seed)
  const seedDatabase = async () => {
    console.log("Seeding database...");
    const initialProducts = [
      { name: 'Onigiri Salmon Mayo', price: 15000, color: 'bg-red-50', stock: 50, sortOrder: 1 },
      { name: 'Onigiri Tuna Mayo', price: 12000, color: 'bg-blue-100', stock: 45, sortOrder: 2 },
      { name: 'Onigiri Chicken Spam', price: 12000, color: 'bg-red-100', stock: 30, sortOrder: 3 },
    ];
    for (const p of initialProducts) {
      await addDoc(collection(db, "products"), p);
    }
  };

  // --- LOGIKA AUTHENTICATION (Login/Register ke Firebase) ---
  const handleLogin = async (username, pin, isRegistering) => {
    if (!username || !pin) return alert("Isi username dan PIN");

    // Khusus Seller
    if (username === 'gillhardjo' && pin === '2131') {
      setCurrentUser({ username: 'gillhardjo', role: 'seller' });
      setCurrentScreen('s_home');
      return;
    }

    const usersRef = collection(db, "users");
    
    if (isRegistering) {
      // Cek apakah user sudah ada
      const q = query(usersRef, where("username", "==", username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        alert('Username sudah dipakai!');
      } else {
        // Buat user baru di Firestore
        await addDoc(usersRef, { username, pin, role: 'customer' });
        setCurrentUser({ username, pin, role: 'customer' });
        setCurrentScreen('c_home');
      }
    } else {
      // Login Logic: Cari user yang cocok
      const q = query(usersRef, where("username", "==", username), where("pin", "==", pin));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        setCurrentUser(userData);
        setCurrentScreen('c_home');
      } else {
        alert('Username atau PIN salah, atau belum terdaftar.');
      }
    }
  };

  // --- LOGIKA CART & CHECKOUT ---
  const addToCart = (product, variant, note, qty) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(item => 
        item.productId === product.id && 
        item.variant === variant && 
        item.note.trim().toLowerCase() === note.trim().toLowerCase()
      );

      if (existingItemIndex !== -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].qty += qty;
        return newCart;
      } else {
        return [...prevCart, {
          productId: product.id,
          name: product.name,
          price: product.price,
          variant,
          note,
          qty
        }];
      }
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const newOrder = {
      customer: currentUser.username,
      items: cart,
      total: cart.reduce((acc, item) => acc + (item.price * item.qty), 0),
      status: 'Menunggu Verifikasi',
      timestamp: new Date().toISOString(), // Gunakan ISO string agar mudah disortir
      displayTime: new Date().toLocaleString(), // Untuk tampilan
      paymentMethod: 'QRIS'
    };

    // Simpan ke Firestore
    await addDoc(collection(db, "orders"), newOrder);
    
    setCart([]);
    setCurrentScreen('c_status');
  };

  // --- LOGIKA SELLER UPDATE STATUS & STOK ---
  const updateStatus = async (orderId, newStatus) => {
    const orderRef = doc(db, "orders", orderId);
    
    // Ambil data order saat ini
    const orderCurrent = orders.find(o => o.id === orderId);
    
    // Logika Pengurangan Stok (Hanya jika status berubah jadi 'Pembayaran Diterima')
    if (newStatus === 'Pembayaran Diterima' && orderCurrent.status !== 'Pembayaran Diterima') {
      
      // Loop setiap item di order untuk kurangi stok di produk masing-masing
      for (const item of orderCurrent.items) {
        // Cari produk di state products (karena kita butuh stok saat ini)
        const productRefInDb = products.find(p => p.id === item.productId);
        
        if (productRefInDb) {
          const productDocRef = doc(db, "products", item.productId);
          const newStock = Math.max(0, productRefInDb.stock - item.qty);
          
          // Update stok di Firestore
          await updateDoc(productDocRef, { stock: newStock });
        }
      }
    }

    // Update status order di Firestore
    await updateDoc(orderRef, { status: newStatus });
  };

  const updateStockManual = async (productId, delta) => {
    const product = products.find(p => p.id === productId);
    if(product) {
       const productRef = doc(db, "products", productId);
       await updateDoc(productRef, { stock: Math.max(0, product.stock + delta) });
    }
  };

  // --- COMPONENTS UI ---

  const LoginScreen = () => {
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [isRegister, setIsRegister] = useState(false);

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') handleLogin(username, pin, isRegister);
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="w-32 h-32 bg-red-50 rounded-full flex items-center justify-center overflow-hidden border-4 border-red-100">
               {/* UPDATED: Mengambil file logo.png dari folder public */}
               <img src="/logo.png" alt="Logo Tabetai" className="w-full h-full object-cover" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Tabetai</h2>
          <p className="text-center text-gray-500 mb-8">{isRegister ? 'Registrasi Akun Baru' : 'Masuk ke Aplikasi'}</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400" size={18} />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none" placeholder="Nama Pengguna" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN Code</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={handleKeyDown} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none" placeholder="****" maxLength={4} />
              </div>
            </div>
            <button onClick={() => handleLogin(username, pin, isRegister)} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-red-200">{isRegister ? 'Daftar Sekarang' : 'Masuk'}</button>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => setIsRegister(!isRegister)} className="text-sm text-red-600 font-semibold hover:underline">{isRegister ? 'Sudah punya akun? Login' : 'Belum punya akun? Registrasi'}</button>
          </div>
        </div>
      </div>
    );
  };

  const CustomerMenu = () => {
    const [selections, setSelections] = useState({});

    const handleSelectionChange = (id, field, value) => {
      setSelections(prev => {
        const currentSelection = prev[id] || { variant: 'Original', note: '', qty: 1 };
        return { ...prev, [id]: { ...currentSelection, [field]: value } };
      });
    };

    const adjustQty = (id, delta) => {
      setSelections(prev => {
        const currentSelection = prev[id] || { variant: 'Original', note: '', qty: 1 };
        return { ...prev, [id]: { ...currentSelection, qty: Math.max(1, currentSelection.qty + delta) } };
      });
    };

    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex items-center gap-4">
          <button onClick={() => setCurrentScreen('c_home')}><ArrowLeft /></button>
          <h1 className="font-bold text-lg">Pilih Menu</h1>
        </div>
        <div className="p-4 space-y-6">
          {products.length === 0 && <p className="text-center mt-10">Memuat Menu...</p>}
          {products.map(product => {
             const selection = selections[product.id] || { variant: 'Original', note: '', qty: 1 };
             return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className={`aspect-square w-full ${product.color} flex items-center justify-center relative group overflow-hidden`}>
                  {/* UPDATED: Menggunakan file gambar dari folder public berdasarkan nama */}
                  <img 
                    src={getProductImage(product.name)} 
                    alt={product.name} 
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      e.target.onerror = null; 
                      e.target.src = "https://placehold.co/300x300/png?text=No+Image";
                    }}
                  />
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-gray-800">{product.name}</h3>
                    <span className="font-bold text-red-600">{formatRupiah(product.price)}</span>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs font-bold text-gray-500 mb-1">Varian:</p>
                    <div className="flex gap-2">
                      {['Original', 'Spicy'].map(v => (
                        <label key={v} className="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="radio" name={`variant-${product.id}`} checked={selection.variant === v} onChange={() => handleSelectionChange(product.id, 'variant', v)} className="accent-red-600" />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="mb-4">
                    <input type="text" placeholder="Catatan (opsional)..." value={selection.note} className="w-full text-sm border-b border-gray-200 py-1 focus:border-red-500 outline-none bg-transparent" onChange={(e) => handleSelectionChange(product.id, 'note', e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="flex items-center bg-gray-100 rounded-lg h-12">
                        <button onClick={() => adjustQty(product.id, -1)} className="w-10 h-full flex items-center justify-center hover:bg-gray-200 rounded-l-lg"><Minus size={16} /></button>
                        <span className="w-8 text-center font-bold text-sm">{selection.qty}</span>
                        <button onClick={() => adjustQty(product.id, 1)} className="w-10 h-full flex items-center justify-center hover:bg-gray-200 rounded-r-lg"><Plus size={16} /></button>
                     </div>
                    <button 
                      onClick={() => {
                        addToCart(product, selection.variant, selection.note, selection.qty);
                        handleSelectionChange(product.id, 'qty', 1);
                        handleSelectionChange(product.id, 'note', '');
                      }}
                      className="flex-1 bg-red-800 text-white h-12 rounded-xl font-bold text-sm hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Keranjang
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
             <button onClick={() => setCurrentScreen('c_cart')} className="w-full bg-red-600 text-white p-4 rounded-2xl shadow-lg flex justify-between items-center font-bold">
               <div className="flex items-center gap-2">
                 <div className="bg-white/20 px-2 py-1 rounded text-sm">{cart.reduce((a,b)=>a+b.qty,0)} item</div>
                 <span>Total {formatRupiah(cart.reduce((a, b) => a + (b.price * b.qty), 0))}</span>
               </div>
               <span className="flex items-center gap-1">Checkout <ArrowLeft className="rotate-180" size={18} /></span>
             </button>
          </div>
        )}
      </div>
    );
  };

  const CustomerHome = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white p-4 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Halo, {currentUser.username}</h1>
          <p className="text-xs text-gray-500">Mau makan apa hari ini?</p>
        </div>
        <button onClick={() => setCurrentScreen('login')} className="text-gray-400 hover:text-red-500"><LogOut size={20} /></button>
      </header>
      <div className="flex-1 p-6 flex flex-col justify-center gap-6">
        <button onClick={() => setCurrentScreen('c_menu')} className="bg-white p-8 rounded-2xl shadow-md border-l-8 border-red-500 flex items-center gap-6 hover:scale-105 transition-transform">
          <ShoppingBag size={48} className="text-red-500" />
          <div className="text-left">
            <h2 className="text-2xl font-bold text-gray-800">Menu</h2>
            <p className="text-gray-500">Pesan Onigiri favoritmu</p>
          </div>
        </button>
        <button onClick={() => setCurrentScreen('c_status')} className="bg-white p-8 rounded-2xl shadow-md border-l-8 border-blue-500 flex items-center gap-6 hover:scale-105 transition-transform">
          <Clock size={48} className="text-blue-500" />
          <div className="text-left">
            <h2 className="text-2xl font-bold text-gray-800">Status Pesanan</h2>
            <p className="text-gray-500">Cek proses makananmu</p>
          </div>
        </button>
      </div>
    </div>
  );

  const CustomerCart = () => {
    const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white p-4 shadow-sm flex items-center gap-4">
          <button onClick={() => setCurrentScreen('c_menu')}><ArrowLeft /></button>
          <h1 className="font-bold text-lg">Konfirmasi Pesanan</h1>
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          {cart.length === 0 ? <p className="text-center text-gray-500 mt-10">Keranjang kosong</p> : 
          cart.map((item, idx) => (
            <div key={idx} className="bg-white p-4 rounded-xl shadow-sm mb-3 flex justify-between items-start">
              <div className="flex gap-3">
                 <div className="bg-red-50 text-red-600 w-8 h-8 flex items-center justify-center rounded font-bold text-sm">{item.qty}x</div>
                 <div>
                    <h4 className="font-bold text-gray-800">{item.name}</h4>
                    <p className="text-sm text-gray-500">Varian: <span className="text-red-600 font-medium">{item.variant}</span></p>
                    {item.note && <p className="text-xs text-gray-400 italic">"{item.note}"</p>}
                 </div>
              </div>
              <div className="text-right">
                <p className="font-bold">{formatRupiah(item.price * item.qty)}</p>
                <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 mt-1"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          <div className="border-t-2 border-dashed border-gray-300 my-4"></div>
          <div className="flex justify-between items-center text-xl font-bold text-gray-800"><span>Total Bayar</span><span>{formatRupiah(total)}</span></div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <button disabled={cart.length === 0} onClick={() => setCurrentScreen('c_payment')} className="w-full bg-red-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-red-700 transition-colors disabled:bg-gray-300">Lanjut Pembayaran</button>
        </div>
      </div>
    );
  };

  const PaymentScreen = () => (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <h2 className="text-2xl font-bold mb-8">Pembayaran QRIS</h2>
      <div className="bg-white p-6 rounded-3xl mb-8 w-full max-w-xs aspect-square flex items-center justify-center relative overflow-hidden">
        {/* UPDATED: Mengambil file qris.png dari folder public */}
        <img src="qris.png" alt="QRIS Code" className="w-full h-full object-contain" />
      </div>
      <p className="text-gray-400 mb-8 text-center max-w-xs">Scan QR code di atas menggunakan aplikasi E-Wallet pilihan Anda.</p>
      <button onClick={handleCheckout} className="w-full max-w-sm bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.4)]">Bayar Sekarang</button>
      <button onClick={() => setCurrentScreen('c_cart')} className="mt-4 text-gray-500 hover:text-white transition-colors">Batalkan</button>
    </div>
  );

  const CustomerOrderStatus = () => {
    const myOrders = orders.filter(o => o.customer === currentUser.username);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white p-4 shadow-sm flex items-center gap-4">
          <button onClick={() => setCurrentScreen('c_home')}><ArrowLeft /></button>
          <h1 className="font-bold text-lg">Riwayat Pesanan</h1>
        </div>
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {myOrders.length === 0 ? <div className="text-center text-gray-400 mt-20">Belum ada pesanan aktif.</div> : (
            myOrders.map(order => (
              <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-bold text-gray-400">Order ID: ...{order.id.slice(-5)}</span>
                    <p className="text-xs text-gray-300">{order.displayTime}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'Menunggu Verifikasi' ? 'bg-yellow-100 text-yellow-700' : order.status === 'Pembayaran Diterima' ? 'bg-blue-100 text-blue-700' : order.status === 'Pesanan Dibuat' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{order.status}</span>
                </div>
                <div className="space-y-2 mb-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.qty}x {item.name} ({item.variant})</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between items-center font-bold text-gray-800">
                  <span>Total</span><span>{formatRupiah(order.total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const SellerHome = () => (
    <div className="min-h-screen bg-gray-800 text-white flex flex-col">
      <header className="p-6 flex justify-between items-center bg-gray-900 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-red-400">Seller Dashboard</h1>
          <p className="text-sm text-gray-400">Selamat bekerja, Gillhardjo!</p>
        </div>
        <button onClick={() => setCurrentScreen('login')} className="bg-gray-700 p-2 rounded-lg hover:bg-red-600 transition-colors"><LogOut size={20} /></button>
      </header>
      <div className="p-6 grid grid-cols-2 gap-6 mt-10">
        <button onClick={() => setCurrentScreen('s_orders')} className="bg-gray-700 p-8 rounded-2xl flex flex-col items-center gap-4 hover:bg-gray-600 transition-colors border border-gray-600">
          <div className="bg-red-500 p-4 rounded-full text-white"><Package size={40} /></div>
          <span className="text-xl font-bold">Pesanan Masuk</span>
          <span className="text-3xl font-bold">{orders.filter(o => o.status !== 'Pesanan Selesai').length}</span>
        </button>
        <button onClick={() => setCurrentScreen('s_stock')} className="bg-gray-700 p-8 rounded-2xl flex flex-col items-center gap-4 hover:bg-gray-600 transition-colors border border-gray-600">
          <div className="bg-blue-500 p-4 rounded-full text-white"><ShoppingBag size={40} /></div>
          <span className="text-xl font-bold">Stok Makanan</span>
          <span className="text-sm text-gray-400">Cek & Edit Stok</span>
        </button>
      </div>
    </div>
  );

  const SellerOrders = () => {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-white p-4 shadow-sm flex items-center gap-4 sticky top-0 z-10">
          <button onClick={() => setCurrentScreen('s_home')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft /></button>
          <h1 className="font-bold text-lg text-gray-800">Daftar Pesanan</h1>
        </div>
        <div className="p-4 space-y-4">
          {orders.length === 0 && <p className="text-center text-gray-500 mt-10">Belum ada pesanan.</p>}
          {orders.map(order => (
            <div key={order.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">{order.customer}</h3>
                  <span className="text-xs text-gray-400">...{order.id.slice(-5)} • {order.displayTime}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600">{formatRupiah(order.total)}</p>
                  <p className="text-xs text-gray-500">{order.paymentMethod}</p>
                </div>
              </div>
              <div className="mb-6 bg-gray-50 p-3 rounded-lg">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Items:</p>
                {order.items.map((item, i) => (
                  <div key={i} className="text-sm text-gray-700 mb-1 flex justify-between">
                     <span>• <b>{item.qty}x</b> {item.name} <span className="text-gray-400">({item.variant})</span></span>
                     {item.note && <span className="text-xs italic bg-yellow-100 px-2 rounded text-yellow-800">{item.note}</span>}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-500">Update Status:</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => updateStatus(order.id, 'Pembayaran Diterima')} disabled={order.status === 'Pembayaran Diterima'} className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-colors ${order.status === 'Pembayaran Diterima' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-blue-100'}`}>Terima Bayar</button>
                  <button onClick={() => updateStatus(order.id, 'Pesanan Dibuat')} disabled={order.status === 'Pesanan Dibuat'} className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-colors ${order.status === 'Pesanan Dibuat' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-red-100'}`}>Dibuat</button>
                  <button onClick={() => updateStatus(order.id, 'Pesanan Selesai')} disabled={order.status === 'Pesanan Selesai'} className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-colors ${order.status === 'Pesanan Selesai' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-green-100'}`}>Selesai</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const SellerStock = () => {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
       <div className="bg-white p-4 shadow-sm flex items-center gap-4 sticky top-0 z-10">
          <button onClick={() => setCurrentScreen('s_home')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft /></button>
          <h1 className="font-bold text-lg text-gray-800">Manajemen Stok</h1>
        </div>
        <div className="p-4 space-y-4">
          {products.map(product => (
            <div key={product.id} className="bg-white p-6 rounded-xl shadow-sm flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${product.color} rounded-lg flex items-center justify-center text-xl overflow-hidden`}>
                   {/* UPDATED: Gambar di list stok juga */}
                   <img src={getProductImage(product.name)} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{product.name}</h3>
                  <p className="text-sm text-gray-500">Harga: {formatRupiah(product.price)}</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                 <p className="text-xs text-gray-400">Sisa Stok</p>
                 <div className="flex items-center gap-3">
                    <button onClick={() => updateStockManual(product.id, -1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 text-red-600 font-bold flex items-center justify-center"><Minus size={16} /></button>
                    <span className={`text-xl font-bold w-8 text-center ${product.stock < 10 ? 'text-red-500' : 'text-gray-800'}`}>{product.stock}</span>
                    <button onClick={() => updateStockManual(product.id, 1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-green-100 text-green-600 font-bold flex items-center justify-center"><Plus size={16} /></button>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans text-gray-900 mx-auto max-w-md bg-white shadow-2xl min-h-screen overflow-hidden relative">
      {currentScreen === 'login' && <LoginScreen />}
      {currentScreen === 'c_home' && <CustomerHome />}
      {currentScreen === 'c_menu' && <CustomerMenu />}
      {currentScreen === 'c_cart' && <CustomerCart />}
      {currentScreen === 'c_payment' && <PaymentScreen />}
      {currentScreen === 'c_status' && <CustomerOrderStatus />}
      {currentScreen === 's_home' && <SellerHome />}
      {currentScreen === 's_orders' && <SellerOrders />}
      {currentScreen === 's_stock' && <SellerStock />}
    </div>
  );
};

export default App;
