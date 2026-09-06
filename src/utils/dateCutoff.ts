import { Order, Product, PrepItemSummary, PrepOrderBreakdown } from '../types';

/**
 * 3:00 AM Daily Cutoff Manager for Almallah Seafood Store
 *
 * Rule:
 * Any order placed before 3:00 AM belongs to that current day's morning prep batch.
 * Any order placed after 3:00 AM (03:00 to 23:59:59) belongs to the NEXT day's preparation inventory.
 */
export const CUTOFF_HOUR = 3; // 3:00 AM

/**
 * Returns YYYY-MM-DD string for a given Date object in local time
 */
export function formatToDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the preparation cycle date for an order based on its createdAt timestamp.
 * If order was placed between 00:00 and 02:59:59 -> Prep Cycle Date = same date.
 * If order was placed between 03:00 and 23:59:59 -> Prep Cycle Date = next day.
 */
export function getOrderPrepCycleDate(createdAt: string | Date): string {
  const orderDate = new Date(createdAt);
  const hour = orderDate.getHours();

  if (hour < CUTOFF_HOUR) {
    // Before 3:00 AM -> belongs to this day's preparation batch
    return formatToDateKey(orderDate);
  } else {
    // 3:00 AM or later -> belongs to the next day's preparation batch
    const nextDay = new Date(orderDate);
    nextDay.setDate(nextDay.getDate() + 1);
    return formatToDateKey(nextDay);
  }
}

/**
 * Returns Today's prep date (the batch being prepared/dispatched today)
 */
export function getTodayPrepDate(): string {
  const now = new Date();
  return formatToDateKey(now);
}

/**
 * Returns Tomorrow's prep date
 */
export function getTomorrowPrepDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatToDateKey(tomorrow);
}

/**
 * Returns human-readable Arabic date (e.g. "الخميس، 4 سبتمبر 2026")
 */
export function formatArabicDate(dateKey: string): string {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

/**
 * Returns status about the 3:00 AM cutoff for today
 */
export function getCutoffInfo(): {
  nextCutoffDate: Date;
  isPastTodayCutoff: boolean;
  hoursUntilCutoff: number;
  minutesUntilCutoff: number;
  activeIntakeBatchDate: string; // The date batch orders placed RIGHT NOW are assigned to
} {
  const now = new Date();
  const currentHour = now.getHours();

  const isPastTodayCutoff = currentHour >= CUTOFF_HOUR;

  const nextCutoff = new Date(now);
  if (isPastTodayCutoff) {
    // Next cutoff is tomorrow at 3:00 AM
    nextCutoff.setDate(nextCutoff.getDate() + 1);
  }
  nextCutoff.setHours(CUTOFF_HOUR, 0, 0, 0);

  const diffMs = Math.max(0, nextCutoff.getTime() - now.getTime());
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const activeIntakeBatchDate = getOrderPrepCycleDate(now);

  return {
    nextCutoffDate: nextCutoff,
    isPastTodayCutoff,
    hoursUntilCutoff: diffHours,
    minutesUntilCutoff: diffMinutes,
    activeIntakeBatchDate,
  };
}

/**
 * Aggregates all item quantities needed for kitchen prep, grouped by product
 * and filtered optionally by preparation cycle date.
 */
export function aggregatePrepRequirements(
  orders: Order[],
  products: Product[],
  options?: {
    targetPrepDate?: string; // If specified, only include orders with this prep cycle date
    filter?: 'today' | 'tomorrow' | 'all' | 'custom';
    customDate?: string;
    includeStatus?: ('pending' | 'preparing' | 'delivering' | 'completed')[];
  }
): {
  prepItems: PrepItemSummary[];
  totalKg: number;
  totalPieces: number;
  totalOrdersCount: number;
  totalEstimatedPrepCost: number;
  uniqueProductsCount: number;
  prepDateLabel: string;
} {
  const todayKey = getTodayPrepDate();
  const tomorrowKey = getTomorrowPrepDate();

  let targetDate = options?.targetPrepDate;
  if (!targetDate) {
    if (options?.filter === 'today') {
      targetDate = todayKey;
    } else if (options?.filter === 'tomorrow') {
      targetDate = tomorrowKey;
    } else if (options?.filter === 'custom' && options?.customDate) {
      targetDate = options.customDate;
    }
  }

  // Filter orders
  const allowedStatuses = options?.includeStatus || ['pending', 'preparing', 'delivering'];

  const filteredOrders = orders.filter((o) => {
    // exclude cancelled orders
    if (o.status === 'cancelled') return false;
    if (!allowedStatuses.includes(o.status)) return false;

    if (options?.filter === 'all') return true;

    if (targetDate) {
      const orderPrepDate = getOrderPrepCycleDate(o.createdAt);
      return orderPrepDate === targetDate;
    }

    return true;
  });

  // Initialize map with ALL existing products from the catalog
  const productLookup = new Map<string, Product>();
  products.forEach((p) => productLookup.set(p.id, p));

  interface ProductAccumulator {
    product: Product;
    totalRequired: number;
    variantMap: Map<string, {
      variantId: string;
      variantTitle: string;
      pieceCount?: number;
      weightKg?: number;
      price: number;
      inStock: number;
      requiredQuantity: number;
      pricingUnit: PricingUnit;
      ordersCount: number;
    }>;
    orders: PrepOrderBreakdown[];
  }

  const productSummaryMap = new Map<string, ProductAccumulator>();

  // Pre-populate with all products and their known variants
  products.forEach((prod) => {
    const variantMap = new Map<string, {
      variantId: string;
      variantTitle: string;
      pieceCount?: number;
      weightKg?: number;
      price: number;
      inStock: number;
      requiredQuantity: number;
      pricingUnit: PricingUnit;
      ordersCount: number;
    }>();

    if (prod.variants && prod.variants.length > 0) {
      prod.variants.forEach((v) => {
        variantMap.set(v.id, {
          variantId: v.id,
          variantTitle: v.title,
          pieceCount: v.pieceCount,
          weightKg: v.weightKg,
          price: v.price || prod.price,
          inStock: v.stockQuantity ?? Math.floor((prod.stockQuantity || 0) / prod.variants!.length),
          requiredQuantity: 0,
          pricingUnit: prod.pricingUnit,
          ordersCount: 0,
        });
      });
    }

    productSummaryMap.set(prod.id, {
      product: prod,
      totalRequired: 0,
      variantMap,
      orders: [],
    });
  });

  // Aggregate orders
  filteredOrders.forEach((order) => {
    order.items.forEach((item) => {
      let entry = productSummaryMap.get(item.productId);
      if (!entry) {
        const prod = productLookup.get(item.productId) || {
          id: item.productId,
          name: item.productName,
          description: '',
          categoryId: '',
          pricingUnit: item.pricingUnit,
          price: item.unitPrice,
          stockQuantity: 0,
          inStock: false,
          imageUrl: '',
          createdAt: new Date().toISOString(),
        };
        entry = {
          product: prod,
          totalRequired: 0,
          variantMap: new Map(),
          orders: [],
        };
        productSummaryMap.set(item.productId, entry);
      }

      const qty = Number(item.quantity) || 0;
      entry.totalRequired += qty;

      // Handle variant mapping
      const vKey = item.variantId || item.variantTitle || 'default';
      const existingV = entry.variantMap.get(vKey);
      if (existingV) {
        existingV.requiredQuantity += qty;
        existingV.ordersCount += 1;
      } else {
        entry.variantMap.set(vKey, {
          variantId: item.variantId || vKey,
          variantTitle: item.variantTitle || (entry.product.variants?.length ? 'حجم موحد' : 'الطلب الأساسي'),
          pieceCount: item.pieceCount,
          weightKg: item.weightKg,
          price: item.unitPrice,
          inStock: entry.product.stockQuantity || 0,
          requiredQuantity: qty,
          pricingUnit: item.pricingUnit,
          ordersCount: 1,
        });
      }

      entry.orders.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        quantity: item.quantity,
        variantTitle: item.variantTitle,
        orderStatus: order.status,
        depositStatus: order.depositStatus,
        createdAt: order.createdAt,
        notes: order.notes,
      });
    });
  });

  // Build summary array
  const prepItems: PrepItemSummary[] = [];
  let totalKg = 0;
  let totalPieces = 0;
  let totalEstimatedCost = 0;

  productSummaryMap.forEach((entry) => {
    const { product, totalRequired, variantMap, orders: orderBreakdown } = entry;
    const currentStock = product.stockQuantity || 0;
    const deficit = Math.max(0, totalRequired - currentStock);

    let stockStatus: 'sufficient' | 'warning' | 'deficit' = 'sufficient';
    if (deficit > 0) {
      stockStatus = 'deficit';
    } else if (currentStock > 0 && currentStock - totalRequired < 5) {
      stockStatus = 'warning';
    }

    if (product.pricingUnit === 'kg') {
      totalKg += totalRequired;
    } else {
      totalPieces += totalRequired;
    }

    totalEstimatedCost += totalRequired * product.price;

    // Convert variant map to sorted list
    const variantsBreakdown = Array.from(variantMap.values()).map((v) => ({
      variantId: v.variantId,
      variantTitle: v.variantTitle,
      pieceCount: v.pieceCount,
      weightKg: v.weightKg,
      price: v.price,
      inStock: v.inStock,
      requiredQuantity: Number(v.requiredQuantity.toFixed(2)),
      pricingUnit: v.pricingUnit,
      deficit: Math.max(0, Number((v.requiredQuantity - v.inStock).toFixed(2))),
      ordersCount: v.ordersCount,
    }));

    // If product has no variants defined in map, create a single representative variant
    if (variantsBreakdown.length === 0) {
      variantsBreakdown.push({
        variantId: 'base',
        variantTitle: 'الحجم القياسي',
        price: product.price,
        inStock: currentStock,
        requiredQuantity: Number(totalRequired.toFixed(2)),
        pricingUnit: product.pricingUnit,
        deficit: Number(deficit.toFixed(2)),
        ordersCount: orderBreakdown.length,
      });
    }

    // Sort variants: ones with demand first, then by title
    variantsBreakdown.sort((a, b) => b.requiredQuantity - a.requiredQuantity);

    prepItems.push({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      categoryName: product.categoryName,
      pricingUnit: product.pricingUnit,
      totalRequired: Number(totalRequired.toFixed(2)),
      inStock: currentStock,
      deficit: Number(deficit.toFixed(2)),
      stockStatus,
      ordersCount: orderBreakdown.length,
      variantsBreakdown,
      orders: orderBreakdown,
      isMarkedPrepared: false,
    });
  });

  // Sort: products with required demand > 0 first, then by inStock descending
  prepItems.sort((a, b) => {
    if (b.totalRequired !== a.totalRequired) {
      return b.totalRequired - a.totalRequired;
    }
    return b.inStock - a.inStock;
  });

  let prepDateLabel = 'جميع الأيام والطلبات النشطة';
  if (options?.filter === 'today' || targetDate === todayKey) {
    prepDateLabel = `مخزون تجهيز اليوم (${formatArabicDate(todayKey)}) - الطلبات حتى 3:00 فجراً`;
  } else if (options?.filter === 'tomorrow' || targetDate === tomorrowKey) {
    prepDateLabel = `مخزون تجهيز الغد (${formatArabicDate(tomorrowKey)}) - الطلبات بعد 3:00 فجراً`;
  } else if (targetDate) {
    prepDateLabel = `مخزون دورة: ${formatArabicDate(targetDate)}`;
  }

  return {
    prepItems,
    totalKg: Number(totalKg.toFixed(2)),
    totalPieces,
    totalOrdersCount: filteredOrders.length,
    totalEstimatedPrepCost: Math.round(totalEstimatedCost),
    uniqueProductsCount: prepItems.length,
    prepDateLabel,
  };
}
