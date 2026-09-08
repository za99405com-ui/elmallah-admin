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

  darkMode: boolean;
  toggleDarkMode: () => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;

  soundEnabled: boolean;
  toggleSound: () => void;
  phoneNotificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  requestPhoneNotificationPermission: () => Promise<boolean>;
  togglePhoneNotifications: () => Promise<void>;
  sendPhoneNotification: (title: string, body: string, tag?: string) => void;

  realtimeConnected: boolean;

  adminUser: AdminUser;
  updateAdminProfile: (updates: Partial<AdminUser>) => void;

  customers: Customer[];
  addCustomer: (
    customer: Omit<Customer, 'id' | 'registeredAt' | 'totalOrders' | 'totalSpent'>
  ) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  toggleCustomerStatus: (id: string) => void;

  products: Product[];
  isLoadingProducts: boolean;
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  updateProductStockQuantity: (id: string, newQuantity: number) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProductStock: (id: string) => Promise<void>;

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

  coupons: Coupon[];
  addCoupon: (coupon: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => Promise<void>;
  updateCoupon: (id: string, updates: Partial<Coupon>) => Promise<void>;
  deleteCoupon: (id: string) => Promise<void>;
  toggleCouponActive: (id: string) => Promise<void>;

  categories: Category[];
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  settings: StoreSettings;
  updateSettings: (updates: Partial<StoreSettings>) => Promise<void>;
  toggleStoreStatus: () => Promise<void>;

  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;

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
  workingHours: 'يومياً 7:00 ص - 11:00 م',
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
  // 1. Toasts State & Helper Functions (تعريفها أولاً لتكون متاحة لجميع الأجزاء)
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

  // 2. Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getStoredToken());
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<AdminUser>(defaultAdminUser);
  const [authCredentials, setAuthCredentials] = useState<AuthCredentials>({
    email: 'zyadmotz1@gmail.com',
  });

  // 3. UI and Audio
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const toggleSound = () => setSoundEnabled((prev) => !prev);
  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const [phoneNotificationsEnabled, setPhoneNotificationsEnabled] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  const sendPhoneNotification = useCallback((title: string, body: string) => {
    console.log(title, body);
  }, []);

  const requestPhoneNotificationPermission = async (): Promise<boolean> => true;
  const togglePhoneNotifications = async () => {};

  // 4. Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);

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
      console.error(err);
    } finally {
      setIsLoadingProducts(false);
      setIsLoadingOrders(false);
    }
  }, []);

  // 5. Direct Supabase Login Implementation
  const login = async (email: string, pass: string): Promise<boolean> => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase');
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase Client Not Initialized');

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) throw error;

      if (data?.session) {
        setStoredToken(data.session.access_token);
        setIsAuthenticated(true);
        addToast({
          type: 'success',
          title: 'مرحباً بك!',
          description: 'تم تسجيل الدخول بنجاح',
        });
        return true;
      }
      return false;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'خطأ في تسجيل الدخول',
        description: err.message || 'فشل تسجيل الدخول',
      });
      return false;
    }
  };

  const logout = () => {
    // // removeStoredToken();
    // setIsAuthenticated(false);
  };

  const updateCredentials = async () => ({ success: true, message: 'Updated' });
  const updateAdminProfile = (updates: Partial<AdminUser>) => setAdminUser((prev) => ({ ...prev, ...updates }));

  const addProduct = async () => {};
  const updateProduct = async () => {};
  const updateProductStockQuantity = async () => {};
  const deleteProduct = async () => {};
  const toggleProductStock = async () => {};

  const addOrder = async () => {};
  const updateOrderStatus = async () => {};
  const confirmDeposit = async () => {};
  const updateOrder = async () => {};

  const addCoupon = async () => {};
  const updateCoupon = async () => {};
  const deleteCoupon = async () => {};
  const toggleCouponActive = async () => {};

  const addCategory = async () => {};
  const updateCategory = async () => {};
  const deleteCategory = async () => {};

  const addCustomer = () => {};
  const updateCustomer = async () => {};
  const deleteCustomer = () => {};
  const toggleCustomerStatus = () => {};

  const updateSettings = async () => {};
  const toggleStoreStatus = async () => {};

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
