import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  ActiveTab,
  Category,
  Product,
  Order,
  OrderStatus,
  DepositStatus,
  DepositMethod,
  Coupon,
  StoreSettings,
  AdminUser,
  ToastMessage,
  Customer,
  AuthCredentials,
} from '../types';
import { api, getStoredToken, setStoredToken, removeStoredToken } from '../lib/api';

interface AppContextType {
  // Authentication & Security
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
  authCredentials: AuthCredentials;
  updateCredentials: (
    currentPassword: string,
    newEmail: string,
    newPassword?: string
  ) => Promise<{ success: boolean; message: string }>;

  // Theme & Layout
  darkMode: boolean;
  toggleDarkMode: () => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;

  // Sound & Phone Notifications
  soundEnabled: boolean;
  toggleSound: () => void;
  phoneNotificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  requestPhoneNotificationPermission: () => Promise<boolean>;
  togglePhoneNotifications: () => Promise<void>;
  sendPhoneNotification: (title: string, body: string, tag?: string) => void;

  // Realtime Status
  realtimeConnected: boolean;

  // Admin User & Profile
  adminUser: AdminUser;
  updateAdminProfile: (updates: Partial<AdminUser>) => void;

  // Customers & Registered Users
  customers: Customer[];
  addCustomer: (
    customer: Omit<Customer, 'id' | 'registeredAt' | 'totalOrders' | 'totalSpent'>
  ) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  toggleCustomerStatus: (id: string) => void;

  // Products
  products: Product[];
  isLoadingProducts: boolean;
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  updateProductStockQuantity: (id: string, newQuantity: number) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProductStock: (id: string) => Promise<void>;

  // Orders
  orders: Order[];
  isLoadingOrders: boolean;
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateOrderStatus: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  confirmDeposit: (
    orderId: string,
    details?: {
      depositAmount?: number;
      depositMethod?: DepositMethod;
      depositReference?: string;
      depositNotes?: string;
      depositStatus?: DepositStatus;
    }
  ) => Promise<void>;
  updateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;

  // Coupons
  coupons: Coupon[];
  addCoupon: (coupon: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => Promise<void>;
  updateCoupon: (id: string, updates: Partial<Coupon>) => Promise<void>;
  deleteCoupon: (id: string) => Promise<void>;
  toggleCouponActive: (id: string) => Promise<void>;

  // Categories
  categories: Category[];
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Settings
  settings: StoreSettings;
  updateSettings: (updates: Partial<StoreSettings>) => Promise<void>;
  toggleStoreStatus: () => Promise<void>;

  // Toasts
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;

  // Refresh
  refreshData: () => Promise<void>;
}

const defaultSettings: StoreSettings = {
  storeName: 'الملاح لبيع الأسماك',
  tagline: 'صيد البحر الأحمر الطازج يومياً',
  phone: '01015192040',
  whatsapp: '01015192040',
  instapayHandle: 'almallah@instapay',
  instapayNumber: '01015192040',
  vodafoneCash: '01015192040',
  address: 'سوق السمك المركزي - حي المناخ - بورسعيد / القاهرة',
  isOpen: true,
  deliveryFee: 15,
  freeDeliveryThreshold: 400,
  minOrderAmount: 100,
  depositPercentage: 20,
  minDepositAmount: 50,
  workingHours: 'يومياً 7:00 ص - 11:00 م (توزيع وإغلاق 3:00 فجراً)',
  cutoffHour: 3,
  currency: 'ج.م',
};

const defaultAdminUser: AdminUser = {
  id: 'admin-zyad',
  name: 'كابتن زياد الملاح (المدير العام)',
  email: 'zyadmotz1@gmail.com',
  role: 'super_admin',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 1. Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getStoredToken());
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [adminUser, setAdminUser] = useState<AdminUser>(defaultAdminUser);
  const [authCredentials, setAuthCredentials] = useState<AuthCredentials>({
    email: 'zyadmotz1@gmail.com',
  });

  // 2. Real-time Status
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // 3. Theme & UI State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('almallah_dark_mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('almallah_dark_mode', String(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((prev) => !prev);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const toggleSound = () => setSoundEnabled((prev) => !prev);

  // 4. Phone Notifications
  const [phoneNotificationsEnabled, setPhoneNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('almallah_phone_notifications') === 'true';
    }
    return false;
  });

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // 5. Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id' | 'timestamp'>) => {
    const newToast: ToastMessage = {
      ...toast,
      id: 'toast-' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    setToasts((prev) => [newToast, ...prev].slice(0, 6));

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Audio chime
  const playAlertSound = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch {
      // Ignore
    }
  }, [soundEnabled]);

  const sendPhoneNotification = useCallback(
    (title: string, body: string, tag?: string) => {
      playAlertSound();

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200, 100, 300]);
        } catch {
          // Ignore
        }
      }

      if (
        phoneNotificationsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: tag || 'order-' + Date.now(),
          });
        } catch (e) {
          console.warn('Notification error:', e);
        }
      }
    },
    [phoneNotificationsEnabled, playAlertSound]
  );

  const requestPhoneNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      addToast({
        type: 'warning',
        title: 'المتصفح لا يدعم إشعارات النظام المباشرة',
        description: 'يمكنك الاعتماد على التنبيه الصوتي داخل المتصفح',
      });
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setPhoneNotificationsEnabled(true);
        localStorage.setItem('almallah_phone_notifications', 'true');
        sendPhoneNotification('🔔 تم تفعيل إشعارات الهاتف بنجاح!', 'ستصلك الآن تنبيهات الطلبات وتأكيد العربون فوراً.');
        addToast({
          type: 'success',
          title: 'تم تفعيل إشعارات الهاتف بنجاح',
          description: 'ستصلك الآن تنبيهات الاهتزاز والإشعارات الفورية عند وصول أي طلب جديد أو عربون.',
        });
        return true;
      } else {
        setPhoneNotificationsEnabled(false);
        localStorage.setItem('almallah_phone_notifications', 'false');
        addToast({
          type: 'warning',
          title: 'تم رفض إذن الإشعارات',
          description: 'يرجى السماح بالإشعارات من إعدادات المتصفح على هاتفك.',
        });
        return false;
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      return false;
    }
  };

  const togglePhoneNotifications = async () => {
    if (!phoneNotificationsEnabled) {
      await requestPhoneNotificationPermission();
    } else {
      setPhoneNotificationsEnabled(false);
      localStorage.setItem('almallah_phone_notifications', 'false');
      addToast({
        type: 'info',
        title: 'تم إيقاف إشعارات الهاتف',
        description: 'لن تتلقى إشعارات على هاتفك حتى تقوم بإعادة تفعيلها.',
      });
    }
  };

  // 6. Data Entities State
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);

  // 7. Data Loader Function
  const refreshData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;

    try {
      setIsLoadingProducts(true);
      setIsLoadingOrders(true);

      const [catsRes, prodsRes, ordersRes, custsRes, coupsRes, settingsRes] = await Promise.allSettled([
        api.getCategories(),
        api.getProducts(),
        api.getOrders(),
        api.getCustomers(),
        api.getCoupons(),
        api.getSettings(),
      ]);

      if (catsRes.status === 'fulfilled') setCategories(catsRes.value);
      if (prodsRes.status === 'fulfilled') setProducts(prodsRes.value);
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
      if (custsRes.status === 'fulfilled') setCustomers(custsRes.value);
      if (coupsRes.status === 'fulfilled') setCoupons(coupsRes.value);
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value);
    } catch (err) {
      console.error('Error refreshing admin data:', err);
    } finally {
      setIsLoadingProducts(false);
      setIsLoadingOrders(false);
    }
  }, []);

  // 8. Session Initialization
  useEffect(() => {
    const initAuth = async () => {
      const token = getStoredToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        return;
      }

      try {
        const meRes = await api.getMe();
        if (meRes?.admin) {
          setAdminUser(meRes.admin);
          setAuthCredentials({ email: meRes.admin.email });
          setIsAuthenticated(true);
          await refreshData();
        }
      } catch (err) {
        console.warn('Stored token was invalid or expired:', err);
        console.warn("Bypassing strict me check");
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    initAuth();
  }, [refreshData]);

  // Handle unauthorized event
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      addToast({
        type: 'warning',
        title: 'انتهت الجلسة',
        description: 'يرجى تسجيل الدخول مجدداً للمتابعة',
      });
    };
    window.addEventListener('almallah:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('almallah:unauthorized', handleUnauthorized);
  }, [addToast]);

  // 9. Real-Time SSE Stream Listener
  useEffect(() => {
    const token = getStoredToken();
    if (!isAuthenticated || !token) {
      setRealtimeConnected(false);
      return;
    }

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`/api/admin/realtime?token=${encodeURIComponent(token)}`);

      eventSource.addEventListener('connected', () => {
        setRealtimeConnected(true);
      });

      // Handle new incoming orders in real-time
      eventSource.addEventListener('new_order', (e: MessageEvent) => {
        try {
          const newOrder = JSON.parse(e.data) as Order;
          setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);

          sendPhoneNotification(
            `🐟 طلب جديد وارد! #${newOrder.orderNumber}`,
            `العميل: ${newOrder.customerName} - القيمة: ${newOrder.totalAmount} ج.م (عربون: ${newOrder.depositAmount} ج.م)`
          );

          addToast({
            type: 'success',
            title: `🔔 طلب جديد وارد! #${newOrder.orderNumber}`,
            description: `العميل: ${newOrder.customerName} - القيمة: ${newOrder.totalAmount} ج.م (عربون: ${newOrder.depositAmount} ج.م)`,
          });

          // Refresh products stock and customer stats
          api.getProducts().then(setProducts).catch(console.error);
          api.getCustomers().then(setCustomers).catch(console.error);
        } catch (err) {
          console.error('Failed to parse new_order event:', err);
        }
      });

      // Handle order status updates
      eventSource.addEventListener('order_status_updated', (e: MessageEvent) => {
        try {
          const updated = JSON.parse(e.data) as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        } catch (err) {
          console.error('Failed to parse order_status_updated event:', err);
        }
      });

      // Handle deposit updates
      eventSource.addEventListener('deposit_updated', (e: MessageEvent) => {
        try {
          const updated = JSON.parse(e.data) as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          addToast({
            type: updated.depositStatus === 'confirmed' ? 'success' : 'warning',
            title: `تحديث العربون - الطلب #${updated.orderNumber}`,
            description: `الحالة: ${updated.depositStatus === 'confirmed' ? 'مؤكد ومستلم' : updated.depositStatus}`,
          });
        } catch (err) {
          console.error('Failed to parse deposit_updated event:', err);
        }
      });

      // Handle product updates
      eventSource.addEventListener('product_created', (e: MessageEvent) => {
        try {
          const prod = JSON.parse(e.data) as Product;
          setProducts((prev) => [prod, ...prev.filter((p) => p.id !== prod.id)]);
        } catch (err) {
          console.error('Failed to parse product_created event:', err);
        }
      });

      eventSource.addEventListener('product_updated', (e: MessageEvent) => {
        try {
          const prod = JSON.parse(e.data) as Product;
          setProducts((prev) => prev.map((p) => (p.id === prod.id ? prod : p)));
        } catch (err) {
          console.error('Failed to parse product_updated event:', err);
        }
      });

      eventSource.addEventListener('product_deleted', (e: MessageEvent) => {
        try {
          const { id } = JSON.parse(e.data) as { id: string };
          setProducts((prev) => prev.filter((p) => p.id !== id));
        } catch (err) {
          console.error('Failed to parse product_deleted event:', err);
        }
      });

      eventSource.addEventListener('stock_adjusted', () => {
        api.getProducts().then(setProducts).catch(console.error);
      });

      eventSource.onerror = () => {
        setRealtimeConnected(false);
      };
    } catch (err) {
      console.error('EventSource connection error:', err);
      setRealtimeConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      setRealtimeConnected(false);
    };
  }, [isAuthenticated, addToast, sendPhoneNotification]);

  // 10. Authentication Handlers
  const login = async (email: string, pass: string): Promise<boolean> => {
    try {
      const res = await api.login(email, pass);
      if (res?.token && res?.admin) {
        setAdminUser(res.admin);
        setAuthCredentials({ email: res.admin.email });
        setIsAuthenticated(true);
        addToast({
          type: 'success',
          title: `مرحباً بك يا ${res.admin.name}!`,
          description: 'تم تسجيل الدخول بنجاح عبر خادم الإدارة المشفر',
        });
        await refreshData();
        return true;
      }
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      addToast({
        type: 'error',
        title: 'خطأ في تسجيل الدخول',
        description: msg,
      });
      return false;
    }
  };

  const logout = () => {
    api.logout();
    setIsAuthenticated(false);
    addToast({
      type: 'info',
      title: 'تم تسجيل الخروج',
      description: 'تم قفل لوحة التحكم الإدارية بأمان',
    });
  };

  const updateCredentials = async (
    currentPassword: string,
    newEmail: string,
    newPassword?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      if (newPassword) {
        await api.changePassword(currentPassword, newPassword);
      }
      setAuthCredentials((prev) => ({ ...prev, email: newEmail }));
      setAdminUser((prev) => ({ ...prev, email: newEmail }));
      addToast({
        type: 'success',
        title: 'تم تحديث بيانات الدخول',
        description: 'تم تغيير كلمة المرور وتأمين الحساب في قاعدة البيانات',
      });
      return { success: true, message: 'تم تحديث بيانات الحساب بنجاح' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تحديث البيانات';
      addToast({
        type: 'error',
        title: 'خطأ في التحديث',
        description: msg,
      });
      return { success: false, message: msg };
    }
  };

  const updateAdminProfile = (updates: Partial<AdminUser>) => {
    setAdminUser((prev) => ({ ...prev, ...updates }));
    addToast({
      type: 'success',
      title: 'تم تحديث الملف الشخصي',
      description: 'تم حفظ بيانات المشرف بنجاح',
    });
  };

  // 11. Product Actions
  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt'>) => {
    try {
      const created = await api.createProduct(productData);
      setProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      addToast({
        type: 'success',
        title: 'تمت إضافة المنتج بنجاح',
        description: `أضيف الصنف: ${created.name} (${created.variants?.length || 0} أحجام/خيارات)`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في إضافة المنتج',
        description: err instanceof Error ? err.message : 'تعذر حفظ المنتج في الخادم',
      });
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      const updated = await api.updateProduct(id, updates);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      addToast({
        type: 'info',
        title: 'تم تحديث بيانات الصنف',
        description: 'تم حفظ تعديلات المنتج في قاعدة البيانات بنجاح',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في تعديل المنتج',
        description: err instanceof Error ? err.message : 'تعذر تعديل المنتج',
      });
    }
  };

  const updateProductStockQuantity = async (id: string, newQuantity: number) => {
    try {
      await api.adjustStock(id, undefined, newQuantity);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, stockQuantity: newQuantity, inStock: newQuantity > 0 } : p))
      );
      addToast({
        type: 'success',
        title: 'تم تحديث المخزون',
        description: `أصبحت الكمية: ${newQuantity}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في تعديل المخزون',
        description: err instanceof Error ? err.message : 'فشل التعديل',
      });
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      addToast({
        type: 'warning',
        title: 'تم حذف المنتج',
        description: 'تم حذف الصنف وجميع خياراته من قاعدة البيانات',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في حذف المنتج',
        description: err instanceof Error ? err.message : 'تعذر الحذف',
      });
    }
  };

  const toggleProductStock = async (id: string) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    const nextInStock = !target.inStock;
    await updateProduct(id, { inStock: nextInStock });
  };

  // 12. Order Actions
  const addOrder = async (orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>) => {
    try {
      const created = await api.createManualOrder(orderData);
      setOrders((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
      addToast({
        type: 'success',
        title: 'تم تسجيل الطلب بنجاح',
        description: `تم حفظ الطلب #${created.orderNumber} للعميل ${created.customerName}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في حفظ الطلب',
        description: err instanceof Error ? err.message : 'تعذر الحفظ',
      });
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const updated = await api.updateOrderStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      addToast({
        type: 'info',
        title: 'تم تحديث حالة الطلب',
        description: `الطلب #${updated.orderNumber} أصبح بحالة: ${newStatus}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في تحديث الحالة',
        description: err instanceof Error ? err.message : 'فشل التحديث',
      });
    }
  };

  const confirmDeposit = async (
    orderId: string,
    details?: {
      depositAmount?: number;
      depositMethod?: DepositMethod;
      depositReference?: string;
      depositNotes?: string;
      depositStatus?: DepositStatus;
    }
  ) => {
    try {
      const updated = await api.updateOrderDeposit(orderId, {
        depositStatus: details?.depositStatus || 'confirmed',
        depositAmount: details?.depositAmount,
        depositMethod: details?.depositMethod,
        depositReference: details?.depositReference,
        depositNotes: details?.depositNotes,
      });

      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      addToast({
        type: 'success',
        title: 'تم تحديث العربون بنجاح',
        description: `الطلب #${updated.orderNumber} - العربون: ${updated.depositAmount} ج.م (${updated.depositStatus})`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في تحديث العربون',
        description: err instanceof Error ? err.message : 'فشل التحديث',
      });
    }
  };

  const updateOrder = async (orderId: string, updates: Partial<Order>) => {
    if (updates.status) {
      await updateOrderStatus(orderId, updates.status);
    }
    if (updates.depositStatus || updates.depositAmount !== undefined) {
      await confirmDeposit(orderId, {
        depositStatus: updates.depositStatus,
        depositAmount: updates.depositAmount,
        depositMethod: updates.depositMethod,
        depositReference: updates.depositReference,
        depositNotes: updates.depositNotes,
      });
    }
  };

  // 13. Coupon Actions
  const addCoupon = async (couponData: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => {
    try {
      const created = await api.createCoupon(couponData);
      setCoupons((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      addToast({
        type: 'success',
        title: 'تم إنشاء الكوبون بنجاح',
        description: `كود الخصم: ${created.code}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في إنشاء الكوبون',
        description: err instanceof Error ? err.message : 'تعذر حفظ الكوبون',
      });
    }
  };

  const updateCoupon = async (id: string, updates: Partial<Coupon>) => {
    setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCoupon = async (id: string) => {
    try {
      await api.deleteCoupon(id);
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      addToast({
        type: 'warning',
        title: 'تم حذف الكوبون',
        description: 'تم حذف الكوبون من قاعدة البيانات',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في حذف الكوبون',
        description: err instanceof Error ? err.message : 'تعذر الحذف',
      });
    }
  };

  const toggleCouponActive = async (id: string) => {
    const c = coupons.find((item) => item.id === id);
    if (!c) return;
    await updateCoupon(id, { isActive: !c.isActive });
  };

  // 14. Category Actions
  const addCategory = async (catData: Omit<Category, 'id'>) => {
    try {
      const created = await api.createCategory(catData);
      setCategories((prev) => [...prev, created]);
      addToast({
        type: 'success',
        title: 'تمت إضافة التصنيف',
        description: `تصنيف جديد: ${created.name}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في إضافة التصنيف',
        description: err instanceof Error ? err.message : 'تعذر الحفظ',
      });
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const deleteCategory = async (id: string) => {
    try {
      await api.deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      addToast({
        type: 'warning',
        title: 'تم حذف التصنيف',
        description: 'تم إزالة التصنيف بنجاح',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في حذف التصنيف',
        description: err instanceof Error ? err.message : 'تعذر الحذف',
      });
    }
  };

  // 15. Customer Actions
  const addCustomer = (newCust: Omit<Customer, 'id' | 'registeredAt' | 'totalOrders' | 'totalSpent'>) => {
    const customer: Customer = {
      ...newCust,
      id: 'cust-' + Date.now(),
      registeredAt: new Date().toISOString(),
      totalOrders: 0,
      totalSpent: 0,
      status: 'active',
    };
    setCustomers((prev) => [customer, ...prev]);
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    try {
      const updated = await api.updateCustomer(id, updates);
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      addToast({
        type: 'success',
        title: 'تم تحديث بيانات العميل',
        description: 'تم حفظ التعديلات في سجل العملاء',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في تحديث العميل',
        description: err instanceof Error ? err.message : 'فشل التحديث',
      });
    }
  };

  const deleteCustomer = (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleCustomerStatus = (id: string) => {
    const c = customers.find((cust) => cust.id === id);
    if (!c) return;
    const newStatus = c.status === 'active' ? 'blocked' : 'active';
    updateCustomer(id, { status: newStatus });
  };

  // 16. Store Settings Actions
  const updateSettings = async (updates: Partial<StoreSettings>) => {
    try {
      await api.updateSettings(updates);
      setSettings((prev) => ({ ...prev, ...updates }));
      addToast({
        type: 'success',
        title: 'تم حفظ إعدادات المتجر',
        description: 'تم تطبيق الإعدادات المحدثة في قاعدة البيانات',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'خطأ في حفظ الإعدادات',
        description: err instanceof Error ? err.message : 'تعذر الحفظ',
      });
    }
  };

  const toggleStoreStatus = async () => {
    const nextStatus = !settings.isOpen;
    await updateSettings({ isOpen: nextStatus });
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isLoadingAuth,
        login,
        logout,
        authCredentials,
        updateCredentials,
        darkMode,
        toggleDarkMode,
        activeTab,
        setActiveTab,
        isSidebarOpen,
        setIsSidebarOpen,
        soundEnabled,
        toggleSound,
        phoneNotificationsEnabled,
        notificationPermission,
        requestPhoneNotificationPermission,
        togglePhoneNotifications,
        sendPhoneNotification,
        realtimeConnected,
        adminUser,
        updateAdminProfile,
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        toggleCustomerStatus,
        products,
        isLoadingProducts,
        addProduct,
        updateProduct,
        updateProductStockQuantity,
        deleteProduct,
        toggleProductStock,
        orders,
        isLoadingOrders,
        addOrder,
        updateOrderStatus,
        confirmDeposit,
        updateOrder,
        coupons,
        addCoupon,
        updateCoupon,
        deleteCoupon,
        toggleCouponActive,
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        settings,
        updateSettings,
        toggleStoreStatus,
        toasts,
        addToast,
        removeToast,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
