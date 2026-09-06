import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Store,
  Truck,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Save,
  Clock,
  Phone,
  MapPin,
  RefreshCw,
  Code,
  ShieldCheck,
  User,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Mail,
  Smartphone,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Sparkles,
  Zap,
} from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const {
    settings,
    updateSettings,
    toggleStoreStatus,
    adminUser,
    updateAdminProfile,
    authCredentials,
    updateCredentials,
    phoneNotificationsEnabled,
    togglePhoneNotifications,
    sendPhoneNotification,
    soundEnabled,
    toggleSound,
    darkMode,
    toggleDarkMode,
    addToast,
  } = useApp();

  // Store settings form state
  const [storeName, setStoreName] = useState(settings.storeName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [deliveryFee, setDeliveryFee] = useState(settings.deliveryFee);
  const [minOrderAmount, setMinOrderAmount] = useState(settings.minOrderAmount);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(settings.freeDeliveryThreshold);
  const [workingHours, setWorkingHours] = useState(settings.workingHours);
  const [closedReason, setClosedReason] = useState(settings.closedReason || '');

  // Admin Profile form state
  const [adminName, setAdminName] = useState(adminUser.name);
  const [adminEmail, setAdminEmail] = useState(adminUser.email);

  // Security & Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState(authCredentials.email);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [securityStatusMsg, setSecurityStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUpdateSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityStatusMsg(null);

    if (newPassword && newPassword.length < 6) {
      setSecurityStatusMsg({ type: 'error', text: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أرقام على الأقل' });
      return;
    }

    if (newPassword && newPassword !== confirmNewPassword) {
      setSecurityStatusMsg({ type: 'error', text: 'كلمة المرور الجديدة غير متطابقة مع خانة التأكيد' });
      return;
    }

    try {
      const result = await updateCredentials(currentPassword, newEmail, newPassword || undefined);
      if (result.success) {
        setSecurityStatusMsg({ type: 'success', text: result.message });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setAdminEmail(newEmail);
      } else {
        setSecurityStatusMsg({ type: 'error', text: result.message });
      }
    } catch (err) {
      setSecurityStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور' });
    }
  };

  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      storeName,
      phone,
      address,
      deliveryFee: Number(deliveryFee),
      minOrderAmount: Number(minOrderAmount),
      freeDeliveryThreshold: Number(freeDeliveryThreshold),
      workingHours,
      closedReason,
    });
  };

  const handleSaveAdminProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateAdminProfile({
      name: adminName,
      email: adminEmail,
    });
  };

  return (
    <div className="space-y-5 pb-12 max-w-4xl">
      {/* 1. Notifications & Mobile Push Card */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-cyan-500" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                إشعارات الهاتف وتنبيهات الطلبات
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                استقبال إشعارات فورية واهتزاز على الهاتف عند ورود طلبات جديدة أو عربون
              </p>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              phoneNotificationsEnabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {phoneNotificationsEnabled ? 'الإشعارات مفعلة' : 'الإشعارات معطلة'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-500" />
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">إشعارات الهاتف الفورية</p>
                <p className="text-[10px] text-slate-500">اهتزاز + إشعار شاشة القفل</p>
              </div>
            </div>
            <button
              type="button"
              onClick={togglePhoneNotifications}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                phoneNotificationsEnabled
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
              }`}
            >
              {phoneNotificationsEnabled ? 'تعطيل' : 'تفعيل الآن'}
            </button>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-500" />
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">صوت التنبيهات</p>
                <p className="text-[10px] text-slate-500">رنين صوتي فوري عند الطلب</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={`p-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                soundEnabled
                  ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-2">
          <p className="text-[11px] text-slate-500">
            للحصول على أفضل تجربة على هاتفك: اضغط &quot;تفعيل الآن&quot; واقبل طلب إذن الإشعارات من المتصفح لتصلك تنبيهات الطلبات الجديدة وتحديثات العربون فوراً.
          </p>
        </div>
      </div>

      {/* 2. Appearance & Theme Card */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                مظهر لوحة التحكم (الوضع الليلي والنهاري)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                التبديل بين الوضع الداكن المريح والوضع النهاري عالي الوضوح
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
              darkMode
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{darkMode ? 'التحويل للوضع النهاري' : 'التحويل للوضع الليلي'}</span>
          </button>
        </div>
      </div>

      {/* 3. Store Operation Status Banner */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              settings.isOpen
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
            }`}
          >
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>حالة استقبال الطلبات:</span>
              <span className={settings.isOpen ? 'text-emerald-500' : 'text-rose-500'}>
                {settings.isOpen ? 'المتجر مفتوح' : 'المتجر مغلق'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {settings.isOpen
                ? 'المتجر يستقبل طلبات الأسماك والبحريات الطازجة على مدار الساعة'
                : settings.closedReason || 'المتجر مغلق حالياً ولا يستقبل طلبات جديدة'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleStoreStatus}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
            settings.isOpen
              ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
              : 'bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400'
          }`}
        >
          {settings.isOpen ? 'إغلاق المتجر مؤقتاً' : 'فتح واستقبال الطلبات'}
        </button>
      </div>

      {/* 4. Store Info Settings Form */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            بيانات المتجر والتوصيل
          </h3>
          <p className="text-[11px] text-slate-500">
            تعديل اسم المتجر ورسوم التوصيل بالجنيه المصري (ج.م)
          </p>
        </div>

        <form onSubmit={handleSaveStoreSettings} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                اسم المتجر
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم هاتف المتجر
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 dir-ltr text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رسوم التوصيل (ج.م)
              </label>
              <input
                type="number"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                حد التوصيل المجاني (ج.م)
              </label>
              <input
                type="number"
                value={freeDeliveryThreshold}
                onChange={(e) => setFreeDeliveryThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                الحد الأدنى للطلب (ج.م)
              </label>
              <input
                type="number"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              حفظ إعدادات المتجر
            </button>
          </div>
        </form>
      </div>

      {/* 5. Security & Password Change Card */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-500" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                أمان الحساب وتغيير البريد وكلمة المرور
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              تعديل بيانات تسجيل الدخول لحماية لوحة الإدارة بتشفير فائق الأمان
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              تشفير Salted SHA-256 نشط
            </span>
          </div>
        </div>

        {securityStatusMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              securityStatusMsg.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{securityStatusMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdateSecurity} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              البريد الإلكتروني للإدارة
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 dir-ltr text-right"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                كلمة المرور الحالية (مطلوبة للتأكيد)
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الحالية"
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                كلمة المرور الجديدة (اختياري)
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="اتركها فارغة إذا أردت تغيير الإيميل فقط"
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {newPassword && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              حفظ بيانات الدخول الجديدة
            </button>
          </div>
        </form>
      </div>

      {/* 6. Unified Database & Backend Connection */}
      <div className="bg-white dark:bg-[#111827] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-500" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                خادم قاعدة البيانات المشتركة (Shared Server DB)
              </h3>
              <p className="text-[11px] text-slate-500">
                قاعدة بيانات SQLite مدمجة مع نظام بث فوري عبر SSE لربط لوحة التحكم بمتجر العملاء
              </p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            خادم نشط ومتصل
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-bold mb-1">المحرك وقاعدة البيانات</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">SQLite + WAL Mode</div>
              <div className="text-[10px] text-emerald-500 font-mono mt-1">/data/almallah.db</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-bold mb-1">تحديثات الطلبات الفورية</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">Server-Sent Events (SSE)</div>
              <div className="text-[10px] text-cyan-500 font-mono mt-1">/api/admin/realtime</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-bold mb-1">الأمان والمصادقة</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">Server-Side JWT + PBKDF2</div>
              <div className="text-[10px] text-amber-500 font-mono mt-1">Bearer Token Authentication</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-slate-700 dark:text-slate-300">
            <h4 className="font-bold text-cyan-600 dark:text-cyan-400 mb-1.5 flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5" />
              <span>نقاط اتصال متجر العملاء المتاحة (Public Store Endpoints):</span>
            </h4>
            <ul className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <li><strong className="text-emerald-500">GET</strong> /api/products - جلب الأسماك والأحجام المتوفرة</li>
              <li><strong className="text-emerald-500">GET</strong> /api/categories - جلب تصنيفات الأسماك</li>
              <li><strong className="text-blue-500">POST</strong> /api/orders - تقديم طلب جديد مع بيانات العربون</li>
              <li><strong className="text-blue-500">POST</strong> /api/coupons/verify - التحقق من كود الخصم وتطبيقه</li>
              <li><strong className="text-emerald-500">GET</strong> /api/settings - جلب حالة الفتح والأسعار ومعلومات التحويل</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
