import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PackageCheck,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Share2,
  Printer,
  Download,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  PhoneCall,
  Scale,
  Fish,
  DollarSign,
  Utensils,
  Check,
  Send,
  Zap,
} from 'lucide-react';
import {
  getTodayPrepDate,
  getTomorrowPrepDate,
  formatArabicDate,
  getOrderPrepCycleDate,
  getCutoffInfo,
  aggregatePrepRequirements,
} from '../../utils/dateCutoff';
import { PrepItemSummary, PrepCycleFilter, Order, PricingUnit } from '../../types';

export const InventoryTab: React.FC = () => {
  const {
    products,
    orders,
    updateProductStockQuantity,
    addOrder,
    addToast,
  } = useApp();

  // Cycle filter state
  const [cycleFilter, setCycleFilter] = useState<PrepCycleFilter>('today');
  const [customDate, setCustomDate] = useState<string>(getTodayPrepDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'deficit' | 'sufficient'>('all');

  // Expanded item row IDs to view orders breakdown
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  // Checklist for kitchen: items marked as prepared
  const [preparedItems, setPreparedItems] = useState<Record<string, boolean>>({});

  // Quick manual intake modal state
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeCustName, setIntakeCustName] = useState('');
  const [intakeCustPhone, setIntakeCustPhone] = useState('');
  const [intakeCustAddress, setIntakeCustAddress] = useState('استلام من فرع المحل');
  const [intakeProductId, setIntakeProductId] = useState('');
  const [intakeQuantity, setIntakeQuantity] = useState('1');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeDepositAmount, setIntakeDepositAmount] = useState('0');

  // Live cutoff timer update
  const [cutoffData, setCutoffData] = useState(() => getCutoffInfo());

  useEffect(() => {
    const timer = setInterval(() => {
      setCutoffData(getCutoffInfo());
    }, 1000 * 30); // update every 30s
    return () => clearInterval(timer);
  }, []);

  // Calculate aggregation based on active cycle
  const prepResult = useMemo(() => {
    return aggregatePrepRequirements(orders, products, {
      filter: cycleFilter,
      customDate: cycleFilter === 'custom' ? customDate : undefined,
    });
  }, [orders, products, cycleFilter, customDate]);

  // Filtered prep items by search & status
  const filteredPrepItems = useMemo(() => {
    return prepResult.prepItems.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.productName.toLowerCase().includes(q);
        const matchesCategory = item.categoryName?.toLowerCase().includes(q);
        if (!matchesName && !matchesCategory) return false;
      }

      if (stockStatusFilter === 'deficit' && item.deficit === 0) return false;
      if (stockStatusFilter === 'sufficient' && item.deficit > 0) return false;

      return true;
    });
  }, [prepResult.prepItems, searchQuery, stockStatusFilter]);

  // Count items with stock shortage
  const deficitItemsCount = prepResult.prepItems.filter((i) => i.deficit > 0).length;

  const toggleExpand = (productId: string) => {
    setExpandedItems((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  const togglePreparedStatus = (productId: string) => {
    setPreparedItems((prev) => {
      const next = !prev[productId];
      addToast({
        type: next ? 'success' : 'info',
        title: next ? 'تم تسجيل الصنف كجاهز' : 'تم إلغاء حالة التجهيز',
        description: next ? 'تم وضع علامة اكتمال تجهيز الكمية المطلوبة بالمطبخ' : 'تمت إعادة الصنف لقائمة الانتظار',
      });
      return { ...prev, [productId]: next };
    });
  };

  // Quick stock adjuster
  const handleAdjustStock = (productId: string, currentStock: number, delta: number) => {
    const nextVal = Math.max(0, currentStock + delta);
    updateProductStockQuantity(productId, nextVal);
  };

  // Printable Kitchen Sheet
  const handlePrintPrepSheet = () => {
    window.print();
  };

  // Export CSV for supplier / kitchen
  const handleExportCSV = () => {
    const headers = ['اسم الصنف', 'الوحدة', 'إجمالي المطلوب للتجهيز', 'المتوفر بالمخزن', 'العجز / النقص المطلوب شراؤه', 'عدد الطلبات'];
    const rows = prepResult.prepItems.map((item) => [
      `"${item.productName}"`,
      item.pricingUnit === 'kg' ? 'كيلوجرام' : 'قطعة',
      item.totalRequired,
      item.inStock,
      item.deficit,
      item.ordersCount,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `كشف_تجهيز_المخزون_${cycleFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: 'تم تصدير كشف التجهيز بنجاح',
      description: 'تم تحميل ملف CSV الخاص بكشف التجهيز للمطبخ والموردين',
    });
  };

  // Share formatted WhatsApp Message
  const handleShareWhatsApp = () => {
    let msg = `*🐟 كشف تجهيز المخزون والطلبات - أسماك الملاح*\n`;
    msg += `📅 الدورة: ${prepResult.prepDateLabel}\n`;
    msg += `⏰ توقيت الإغلاق: 3:00 فجراً\n`;
    msg += `---------------------------------\n`;
    msg += `*📊 الإجماليات المطلوبة للتحضير:*\n`;
    msg += `• إجمالي الوزن: ${prepResult.totalKg} كجم\n`;
    msg += `• إجمالي القطع: ${prepResult.totalPieces} قطعة\n`;
    msg += `• عدد الطلبات النشطة: ${prepResult.totalOrdersCount} طلب\n\n`;

    msg += `*📋 تفاصيل الأصناف المطلوبة للتجهيز:*\n`;
    prepResult.prepItems.forEach((item, index) => {
      const unit = item.pricingUnit === 'kg' ? 'كجم' : 'ق';
      const statusIcon = item.deficit > 0 ? '⚠️ عجز:' + item.deficit + unit : '✅ متوفر';
      msg += `${index + 1}. *${item.productName}*: المطلوب [${item.totalRequired} ${unit}] - المتوفر: ${item.inStock} ${unit} (${statusIcon})\n`;
    });

    if (deficitItemsCount > 0) {
      msg += `\n*🚨 تنبيه النواقص للشراء الفوري:*\n`;
      prepResult.prepItems.filter((i) => i.deficit > 0).forEach((item) => {
        const unit = item.pricingUnit === 'kg' ? 'كجم' : 'قطعة';
        msg += `• مطلوب شراء ${item.deficit} ${unit} من ${item.productName}\n`;
      });
    }

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Submit quick order intake
  const handleQuickIntakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeCustName.trim() || !intakeCustPhone.trim()) {
      addToast({
        type: 'error',
        title: 'بيانات غير مكتملة',
        description: 'يرجى إدخال اسم العميل ورقم هاتفه',
      });
      return;
    }

    const selectedProd = products.find((p) => p.id === intakeProductId) || products[0];
    if (!selectedProd) return;

    const qty = Math.max(0.5, Number(intakeQuantity) || 1);
    const itemTotal = qty * selectedProd.price;
    const subtotal = itemTotal;
    const deliveryFee = 35;
    const totalAmount = subtotal + deliveryFee;
    const deposit = Number(intakeDepositAmount) || 0;

    const newOrderPayload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'> = {
      customerName: intakeCustName.trim(),
      customerPhone: intakeCustPhone.trim(),
      customerAddress: intakeCustAddress.trim() || 'استلام من فرع المحل',
      items: [
        {
          productId: selectedProd.id,
          productName: selectedProd.name,
          pricingUnit: selectedProd.pricingUnit,
          unitPrice: selectedProd.price,
          quantity: qty,
          totalPrice: itemTotal,
        },
      ],
      subtotal,
      deliveryFee,
      discountAmount: 0,
      totalAmount,
      depositAmount: deposit,
      depositStatus: deposit > 0 ? 'confirmed' : 'pending',
      depositMethod: 'instapay',
      remainingAmount: Math.max(0, totalAmount - deposit),
      status: 'pending',
      notes: intakeNotes.trim() || undefined,
    };

    addOrder(newOrderPayload);
    setShowIntakeModal(false);
    setIntakeCustName('');
    setIntakeCustPhone('');
    setIntakeNotes('');
    setIntakeDepositAmount('0');
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 animate-fadeIn" dir="rtl">
      {/* 3:00 AM Cutoff Notice Banner */}
      <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-800/50 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>منظومة فصل مخزون الأيام وقاعدة الإغلاق:</span>
                  <span className="bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-lg text-xs font-mono font-bold border border-blue-500/40">
                    الساعة 3:00 فجراً
                  </span>
                </h2>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                    cutoffData.isPastTodayCutoff
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {cutoffData.isPastTodayCutoff ? 'تم تجاوز إغلاق 3 فجراً لليوم' : 'استقبال طلبات دورة اليوم ما زال جارياً'}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed max-w-3xl">
                <strong className="text-cyan-300">القاعدة المعتمدة:</strong> أي طلب يُسجل قبل الساعة 3:00 فجراً يدرج فوراً في مخزون تجهيز
                اليوم ذاته. وأي طلب يُسجل بعد 3:00 فجراً يرحل تلقائياً إلى مخزون دورة اليوم التالي.
              </p>
            </div>
          </div>

          {/* Countdown & Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full lg:w-auto justify-between lg:justify-end pt-2 lg:pt-0 border-t border-slate-800 lg:border-t-0">
            <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl px-3 py-2 text-center">
              <div className="text-[10px] text-slate-400">الإغلاق القادم (3 فجراً)</div>
              <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300">
                باقي {cutoffData.hoursUntilCutoff} س و {cutoffData.minutesUntilCutoff} د
              </div>
            </div>

            <button
              onClick={() => setShowIntakeModal(true)}
              className="flex items-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل طلب فوري</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cycle Tabs / Filters Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Day selection tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setCycleFilter('today')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                cycleFilter === 'today'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>مخزون وتجهيز اليوم</span>
              <span className="text-[10px] opacity-80 px-1 py-0.2 rounded bg-black/20 font-mono">
                {formatArabicDate(getTodayPrepDate()).split('،')[0]}
              </span>
            </button>

            <button
              onClick={() => setCycleFilter('tomorrow')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                cycleFilter === 'tomorrow'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>مخزون وتجهيز الغد</span>
              <span className="text-[10px] opacity-80 px-1 py-0.2 rounded bg-black/20 font-mono">
                {formatArabicDate(getTomorrowPrepDate()).split('،')[0]}
              </span>
            </button>

            <button
              onClick={() => setCycleFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                cycleFilter === 'all'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>كافة الأيام</span>
            </button>

            <button
              onClick={() => setCycleFilter('custom')}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                cycleFilter === 'custom'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>تاريخ مخصص</span>
            </button>
          </div>

          {/* Action buttons: Print, Export, WhatsApp */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handlePrintPrepSheet}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              title="طباعة كشف التجهيز للمطبخ"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">طباعة كشف المطبخ</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              title="تصدير كشف التجهيز Excel / CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">تصدير CSV</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              title="إرسال ملخص التجهيز عبر واتساب"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">مشاركة واتساب</span>
            </button>
          </div>
        </div>

        {/* Custom date picker row if active */}
        {cycleFilter === 'custom' && (
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-3">
            <span className="text-xs text-slate-300 font-medium">اختر يوم التجهيز المراد عرض أصنافه:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-xs text-cyan-400 font-semibold">{formatArabicDate(customDate)}</span>
          </div>
        )}
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Metric 1: Total Kg Required */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">إجمالي الوزن المطلوب</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-100">{prepResult.totalKg}</span>
            <span className="text-xs font-bold text-cyan-400">كيلوجرام</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            المطلوب وزنه وتنظيفه لتسليمات الدورة
          </div>
        </div>

        {/* Metric 2: Total Pieces */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">إجمالي القطع المطلوبة</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Fish className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-100">{prepResult.totalPieces}</span>
            <span className="text-xs font-bold text-blue-400">قطعة</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            (كابوريا، استاكوزا، وجبات بحرية)
          </div>
        </div>

        {/* Metric 3: Total Orders Included */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">عدد الطلبات قيد التجهيز</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-100">{prepResult.totalOrdersCount}</span>
            <span className="text-xs font-bold text-emerald-400">طلب</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            تغطي {prepResult.uniqueProductsCount} صنف بحري مختلف
          </div>
        </div>

        {/* Metric 4: Shortage Alert */}
        <div
          className={`border rounded-2xl p-3 sm:p-4 relative overflow-hidden transition-all ${
            deficitItemsCount > 0
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-100'
              : 'bg-emerald-950/30 border-emerald-800/50 text-emerald-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {deficitItemsCount > 0 ? 'نواقص وعجز بالمخزن' : 'حالة كفاية المخزون'}
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                deficitItemsCount > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {deficitItemsCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black">
              {deficitItemsCount > 0 ? `${deficitItemsCount} صنف` : 'المخزون كافٍ'}
            </span>
          </div>
          <div className="text-[11px] opacity-80 mt-1 truncate">
            {deficitItemsCount > 0
              ? 'تتطلب شراء صيد إضافي من الميناء فوراً'
              : 'جميع الأصناف تغطي طلبات اليوم بالكامل'}
          </div>
        </div>
      </div>

      {/* Search & Status Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ابحث باسم الصنف (جمبري، دنيس، وقار، سبيط...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pr-9 pl-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setStockStatusFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                stockStatusFilter === 'all' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300'
              }`}
            >
              الكل ({prepResult.prepItems.length})
            </button>
            <button
              onClick={() => setStockStatusFilter('deficit')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                stockStatusFilter === 'deficit' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400'
              }`}
            >
              <span>عجز</span>
              {deficitItemsCount > 0 && (
                <span className="bg-rose-700 text-white text-[10px] px-1 rounded-full">{deficitItemsCount}</span>
              )}
            </button>
            <button
              onClick={() => setStockStatusFilter('sufficient')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                stockStatusFilter === 'sufficient' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-emerald-400'
              }`}
            >
              متوفر بالكامل
            </button>
          </div>
        </div>
      </div>

      {/* Preparation Items List */}
      <div className="space-y-3">
        {filteredPrepItems.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <PackageCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-200">لا توجد أصناف مطلوبة للتجهيز في هذه الدورة</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              لم تسجل طلبات نشطة بحاجة لتجهيز وتنظيف خلال هذا التوقيت أو مطابقة لمعايير البحث.
            </p>
          </div>
        ) : (
          filteredPrepItems.map((item) => {
            const isExpanded = !!expandedItems[item.productId];
            const isPrepared = !!preparedItems[item.productId];
            const unitLabel = item.pricingUnit === 'kg' ? 'كجم' : 'قطعة';

            return (
              <div
                key={item.productId}
                className={`bg-slate-900/90 border rounded-2xl transition-all shadow-sm overflow-hidden ${
                  isPrepared
                    ? 'border-emerald-700/60 bg-emerald-950/10'
                    : item.deficit > 0
                    ? 'border-rose-800/60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Main Row */}
                <div className="p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  {/* Item info */}
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Checkbox for kitchen completed */}
                    <button
                      onClick={() => togglePreparedStatus(item.productId)}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center border transition-all shrink-0 ${
                        isPrepared
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : 'border-slate-700 hover:border-slate-500 bg-slate-800 text-transparent hover:text-slate-400'
                      }`}
                      title={isPrepared ? 'تم التجهيز والوزن' : 'انقر لتعيين كتم التجهيز'}
                    >
                      <Check className="w-4 h-4 font-bold stroke-[3]" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4
                          className={`text-sm sm:text-base font-bold ${
                            isPrepared ? 'line-through text-slate-400' : 'text-slate-100'
                          }`}
                        >
                          {item.productName}
                        </h4>
                        {item.categoryName && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md border border-slate-700">
                            {item.categoryName}
                          </span>
                        )}
                        {item.deficit > 0 && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold border border-rose-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            عجز {item.deficit} {unitLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                        <span>مطلوب لـ {item.ordersCount} طلب عميل</span>
                        <span>•</span>
                        <span>المتوفر بالمخزن: {item.inStock} {unitLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quantity Breakdown & Quick Stock Adjuster */}
                  <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto pt-2 md:pt-0 border-t border-slate-800/80 md:border-t-0">
                    {/* Big Requirement Box */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-center min-w-[100px]">
                      <div className="text-[10px] text-cyan-400 font-semibold">المطلوب تجهيزه</div>
                      <div className="text-base sm:text-lg font-black text-cyan-300 font-mono">
                        {item.totalRequired} <span className="text-xs font-bold text-slate-400">{unitLabel}</span>
                      </div>
                    </div>

                    {/* Quick Stock Controls */}
                    <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/80 rounded-xl p-1">
                      <button
                        onClick={() => handleAdjustStock(item.productId, item.inStock, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold flex items-center justify-center transition-colors"
                        title="إنقاص المخزون بمقدار 1"
                      >
                        -
                      </button>
                      <span className="text-xs font-mono font-bold text-slate-200 px-2">
                        {item.inStock}
                      </span>
                      <button
                        onClick={() => handleAdjustStock(item.productId, item.inStock, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold flex items-center justify-center transition-colors"
                        title="زيادة المخزون بمقدار 1"
                      >
                        +
                      </button>
                    </div>

                    {/* Expand Orders Breakdown Button */}
                    <button
                      onClick={() => toggleExpand(item.productId)}
                      className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors border border-slate-700"
                    >
                      <span>الطلبات ({item.ordersCount})</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Orders Breakdown Accordion */}
                {isExpanded && (
                  <div className="bg-slate-950/60 border-t border-slate-800 p-3 sm:p-4 space-y-2">
                    <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5 text-cyan-400" />
                      <span>تفاصيل الطلبات التي تشمل صنف ({item.productName}):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {item.orders.map((ord, idx) => (
                        <div
                          key={`${ord.orderId}-${idx}`}
                          className="bg-slate-900 border border-slate-800/90 rounded-xl p-2.5 text-xs text-slate-200 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-cyan-300">طلب #{ord.orderNumber}</span>
                            <span className="bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border border-cyan-800/60">
                              {ord.quantity} {unitLabel}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-slate-400">
                            <span className="font-medium text-slate-200">{ord.customerName}</span>
                            <span className="font-mono text-[11px]">{ord.customerPhone}</span>
                          </div>

                          {ord.notes && (
                            <div className="bg-amber-950/30 border border-amber-800/40 rounded p-1.5 text-[11px] text-amber-200">
                              <strong>ملاحظات المطبخ/التنظيف:</strong> {ord.notes}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                            <span>
                              العربون:{' '}
                              <strong className={ord.depositStatus === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}>
                                {ord.depositStatus === 'confirmed' ? 'مؤكد ومقبوض' : 'قيد التحصيل'}
                              </strong>
                            </span>
                            <span>{new Date(ord.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Manual Quick Intake Modal */}
      {showIntakeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">تسجيل طلب وارد فوري</h3>
                  <p className="text-xs text-slate-400">
                    يتم إدراجه فوراً في دورة {cutoffData.activeIntakeBatchDate} (قاعدة الـ 3:00 فجراً)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIntakeModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickIntakeSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: د. طارق عبد الرازق"
                  value={intakeCustName}
                  onChange={(e) => setIntakeCustName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    placeholder="01012345678"
                    value={intakeCustPhone}
                    onChange={(e) => setIntakeCustPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">العنوان أو الاستلام</label>
                  <input
                    type="text"
                    placeholder="المعادي أو استلام من المحل"
                    value={intakeCustAddress}
                    onChange={(e) => setIntakeCustAddress(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الصنف المطلوب *</label>
                  <select
                    value={intakeProductId}
                    onChange={(e) => setIntakeProductId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.price} ج.م / {p.pricingUnit === 'kg' ? 'كجم' : 'ق'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الكمية المطلوبة (كجم / ق) *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    required
                    value={intakeQuantity}
                    onChange={(e) => setIntakeQuantity(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">مبلغ العربون المدفوع (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={intakeDepositAmount}
                  onChange={(e) => setIntakeDepositAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">ملاحظات التجهيز والتنظيف</label>
                <textarea
                  rows={2}
                  placeholder="مثال: تنظيف سنجاري وفتح من الظهر، أو تتبيل للشوي"
                  value={intakeNotes}
                  onChange={(e) => setIntakeNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowIntakeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>تأكيد وتسجيل الطلب بالمخزون</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
