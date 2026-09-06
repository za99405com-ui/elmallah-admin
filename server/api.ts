import express, { Request, Response, Router } from 'express';
import crypto from 'node:crypto';
import { db } from './db';
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
  signToken,
  verifyPassword,
  hashPassword,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  logAuditAction,
  verifyToken,
} from './auth';
import { addRealtimeClient, broadcastRealtimeEvent } from './realtime';

export const router = Router();

// ==========================================
// 1. ADMIN AUTHENTICATION
// ==========================================

// POST /api/admin/auth/login
router.post('/admin/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const rateLimitKey = `${clientIp}_${(email || '').toLowerCase().trim()}`;

  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: `تم حظر محاولات الدخول مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار لمدة ${rateCheck.waitSeconds} ثانية.`,
    });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const adminRow = db
    .prepare('SELECT id, name, email, password_hash, salt, role, avatar_url FROM admins WHERE email = ?')
    .get(normalizedEmail) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string;
        salt: string;
        role: string;
        avatar_url: string;
      }
    | undefined;

  if (!adminRow) {
    recordFailedAttempt(rateLimitKey);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.' });
  }

  const isValid = verifyPassword(password, adminRow.password_hash, adminRow.salt);
  if (!isValid) {
    recordFailedAttempt(rateLimitKey);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.' });
  }

  // Clear rate limit on success
  clearRateLimit(rateLimitKey);

  // Update last_login
  const now = new Date().toISOString();
  db.prepare('UPDATE admins SET last_login = ? WHERE id = ?').run(now, adminRow.id);

  const payload = {
    id: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    role: adminRow.role as 'super_admin' | 'manager' | 'operator',
    avatarUrl: adminRow.avatar_url,
  };

  const token = signToken(payload, 24);

  logAuditAction(payload, 'login', 'admin', adminRow.id, null, { email: adminRow.email }, String(clientIp));

  return res.json({
    token,
    admin: payload,
  });
});

// GET /api/admin/auth/me
router.get('/admin/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ admin: req.admin });
});

// POST /api/admin/auth/change-password
router.post('/admin/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
  }

  const adminRow = db
    .prepare('SELECT password_hash, salt FROM admins WHERE id = ?')
    .get(req.admin!.id) as { password_hash: string; salt: string } | undefined;

  if (!adminRow || !verifyPassword(currentPassword, adminRow.password_hash, adminRow.salt)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);

  db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?').run(newHash, newSalt, req.admin!.id);

  logAuditAction(req.admin, 'change_password', 'admin', req.admin!.id, null, null, req.ip);

  return res.json({ message: 'تم تحديث كلمة المرور بنجاح' });
});

// GET /api/admin/auth/admins (Super Admin only)
router.get('/admin/auth/admins', requireAuth, requireRole(['super_admin']), (req: AuthenticatedRequest, res: Response) => {
  const rows = db.prepare('SELECT id, name, email, role, avatar_url, created_at, last_login FROM admins ORDER BY created_at DESC').all();
  return res.json(rows);
});

// POST /api/admin/auth/admins (Super Admin only)
router.post('/admin/auth/admins', requireAuth, requireRole(['super_admin']), (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const id = `admin-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  db.prepare(`
    INSERT INTO admins (id, name, email, password_hash, salt, role, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name.trim(),
    normalizedEmail,
    hash,
    salt,
    role,
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    new Date().toISOString()
  );

  logAuditAction(req.admin, 'create_admin', 'admin', id, null, { email: normalizedEmail, role }, req.ip);

  return res.status(201).json({ id, name, email: normalizedEmail, role });
});

// DELETE /api/admin/auth/admins/:id
router.delete('/admin/auth/admins/:id', requireAuth, requireRole(['super_admin']), (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  if (targetId === req.admin!.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(targetId);
  logAuditAction(req.admin, 'delete_admin', 'admin', targetId, null, null, req.ip);

  return res.json({ message: 'تم حذف المستخدم الإداري' });
});

// ==========================================
// 2. REALTIME SSE STREAM
// ==========================================
router.get('/admin/realtime', (req: Request, res: Response) => {
  // Check token from query parameter
  const token = req.query.token as string;
  if (!token) {
    return res.status(401).json({ error: 'مطلوب رمز المصادقة للبث اللحظي' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'انتهت صلاحية الرمز' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  addRealtimeClient(clientId, res, payload.id);
});

// ==========================================
// 3. DASHBOARD STATS
// ==========================================
router.get('/admin/dashboard/stats', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const totalOrdersRow = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  
  // Cutoff 3 AM calculation for "today"
  const now = new Date();
  const cutoffToday = new Date(now);
  if (now.getHours() < 3) {
    cutoffToday.setDate(cutoffToday.getDate() - 1);
  }
  cutoffToday.setHours(3, 0, 0, 0);
  const cutoffIso = cutoffToday.toISOString();

  const todayOrdersRow = db
    .prepare('SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as totalSales FROM orders WHERE created_at >= ?')
    .get(cutoffIso) as { count: number; totalSales: number };

  const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all() as {
    status: string;
    count: number;
  }[];

  const statusCounts: Record<string, number> = {};
  for (const s of statusRows) {
    statusCounts[s.status] = s.count;
  }

  const depositPendingRow = db
    .prepare("SELECT COUNT(*) as count, COALESCE(SUM(deposit_amount), 0) as totalAmount FROM orders WHERE deposit_status = 'pending'")
    .get() as { count: number; totalAmount: number };

  const totalSalesRow = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) as totalSales FROM orders WHERE status != 'cancelled'")
    .get() as { totalSales: number };

  const customersCountRow = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
  const productsCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  const outOfStockRow = db.prepare('SELECT COUNT(*) as count FROM products WHERE in_stock = 0 OR stock_quantity <= 0').get() as { count: number };
  const totalVariantsRow = db.prepare('SELECT COUNT(*) as count FROM product_variants').get() as { count: number };

  return res.json({
    totalOrders: totalOrdersRow.count,
    todayOrders: todayOrdersRow.count,
    pendingOrders: statusCounts['pending'] || 0,
    preparingOrders: statusCounts['preparing'] || 0,
    deliveringOrders: statusCounts['delivering'] || 0,
    completedOrders: statusCounts['completed'] || 0,
    cancelledOrders: statusCounts['cancelled'] || 0,
    pendingDepositsCount: depositPendingRow.count,
    pendingDepositsAmount: depositPendingRow.totalAmount,
    totalSales: totalSalesRow.totalSales,
    todaySales: todayOrdersRow.totalSales,
    totalCustomers: customersCountRow.count,
    totalProducts: productsCountRow.count,
    outOfStockProducts: outOfStockRow.count,
    totalVariants: totalVariantsRow.count,
  });
});

// ==========================================
// 4. PRODUCTS & PRODUCT VARIANTS
// ==========================================

// Helper to get product with variants
function getProductWithVariants(productId: string) {
  const product = db
    .prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `)
    .get(productId) as Record<string, unknown> | undefined;

  if (!product) return null;

  const variants = db
    .prepare(`
      SELECT * FROM product_variants
      WHERE product_id = ?
      ORDER BY sort_order ASC, weight_kg ASC, piece_count ASC
    `)
    .all(productId) as Record<string, unknown>[];

  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    categoryId: product.category_id,
    categoryName: product.category_name || '',
    pricingUnit: product.pricing_unit,
    price: product.base_price,
    stockQuantity: product.stock_quantity,
    inStock: Boolean(product.in_stock),
    imageUrl: product.image_url,
    isActive: Boolean(product.is_active),
    minOrderQuantity: product.min_order_quantity,
    maxOrderQuantity: product.max_order_quantity,
    sortOrder: product.sort_order,
    badge: product.badge,
    variants: variants.map((v) => ({
      id: v.id,
      productId: v.product_id,
      title: v.title,
      weightKg: v.weight_kg,
      pieceCount: v.piece_count,
      approxPieceWeightG: v.approx_piece_weight_g,
      price: v.price,
      stockQuantity: v.stock_quantity,
      isActive: Boolean(v.is_active),
      sortOrder: v.sort_order,
      createdAt: v.created_at,
    })),
    createdAt: product.created_at,
  };
}

// GET /api/admin/products
router.get('/admin/products', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const products = db
    .prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.sort_order ASC, p.created_at DESC
    `)
    .all() as Record<string, unknown>[];

  const variants = db
    .prepare('SELECT * FROM product_variants ORDER BY sort_order ASC, weight_kg ASC, piece_count ASC')
    .all() as Record<string, unknown>[];

  const variantsByProduct: Record<string, unknown[]> = {};
  for (const v of variants) {
    const pId = String(v.product_id);
    if (!variantsByProduct[pId]) variantsByProduct[pId] = [];
    variantsByProduct[pId].push({
      id: v.id,
      productId: v.product_id,
      title: v.title,
      weightKg: v.weight_kg,
      pieceCount: v.piece_count,
      approxPieceWeightG: v.approx_piece_weight_g,
      price: v.price,
      stockQuantity: v.stock_quantity,
      isActive: Boolean(v.is_active),
      sortOrder: v.sort_order,
      createdAt: v.created_at,
    });
  }

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    categoryId: p.category_id,
    categoryName: p.category_name || '',
    pricingUnit: p.pricing_unit,
    price: p.base_price,
    stockQuantity: p.stock_quantity,
    inStock: Boolean(p.in_stock),
    imageUrl: p.image_url,
    isActive: Boolean(p.is_active),
    minOrderQuantity: p.min_order_quantity,
    maxOrderQuantity: p.max_order_quantity,
    sortOrder: p.sort_order,
    badge: p.badge,
    variants: variantsByProduct[String(p.id)] || [],
    createdAt: p.created_at,
  }));

  return res.json(result);
});

// POST /api/admin/products (Manager & Super Admin)
router.post('/admin/products', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    description,
    categoryId,
    pricingUnit,
    price,
    stockQuantity,
    inStock,
    imageUrl,
    badge,
    variants,
    minOrderQuantity,
    maxOrderQuantity,
    sortOrder,
  } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: 'اسم المنتج والسعر الأساسي مطلوبان' });
  }

  const productId = `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  // Execute in transaction
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      INSERT INTO products (
        id, name, description, category_id, pricing_unit, base_price,
        stock_quantity, in_stock, image_url, min_order_quantity, max_order_quantity,
        sort_order, badge, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      productId,
      name.trim(),
      description || '',
      categoryId || null,
      pricingUnit || 'kg',
      Number(price),
      Number(stockQuantity || 0),
      inStock !== false ? 1 : 0,
      imageUrl || 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=800&q=80',
      minOrderQuantity || null,
      maxOrderQuantity || null,
      sortOrder || 0,
      badge || null,
      now
    );

    // Insert variants if provided
    if (Array.isArray(variants) && variants.length > 0) {
      const insertVar = db.prepare(`
        INSERT INTO product_variants (
          id, product_id, title, weight_kg, piece_count, approx_piece_weight_g,
          price, stock_quantity, is_active, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const vId = `var-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}`;
        insertVar.run(
          vId,
          productId,
          v.title || `${v.pieceCount || 1} قطع / ${v.weightKg || 1} كجم`,
          Number(v.weightKg || 1),
          Number(v.pieceCount || 1),
          v.approxPieceWeightG ? Number(v.approxPieceWeightG) : null,
          Number(v.price || price),
          Number(v.stockQuantity || 0),
          v.sortOrder || i,
          now
        );
      }
    }

    db.exec('COMMIT;');

    const created = getProductWithVariants(productId);
    logAuditAction(req.admin, 'create_product', 'product', productId, null, created, req.ip);
    broadcastRealtimeEvent('product_created', created);

    return res.status(201).json(created);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Error creating product:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء المنتج' });
  }
});

// PUT /api/admin/products/:id
router.put('/admin/products/:id', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const existing = getProductWithVariants(productId);
  if (!existing) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  const {
    name,
    description,
    categoryId,
    pricingUnit,
    price,
    stockQuantity,
    inStock,
    imageUrl,
    badge,
    isActive,
    variants,
  } = req.body;

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        category_id = COALESCE(?, category_id),
        pricing_unit = COALESCE(?, pricing_unit),
        base_price = COALESCE(?, base_price),
        stock_quantity = COALESCE(?, stock_quantity),
        in_stock = COALESCE(?, in_stock),
        image_url = COALESCE(?, image_url),
        badge = COALESCE(?, badge),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : null,
      description !== undefined ? description : null,
      categoryId !== undefined ? categoryId : null,
      pricingUnit !== undefined ? pricingUnit : null,
      price !== undefined ? Number(price) : null,
      stockQuantity !== undefined ? Number(stockQuantity) : null,
      inStock !== undefined ? (inStock ? 1 : 0) : null,
      imageUrl !== undefined ? imageUrl : null,
      badge !== undefined ? badge : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      productId
    );

    // If variants array is explicitly provided, update them
    if (Array.isArray(variants)) {
      // Remove variants not in the new array
      const keepIds = variants.filter((v) => v.id).map((v) => v.id);
      if (keepIds.length > 0) {
        const placeholders = keepIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM product_variants WHERE product_id = ? AND id NOT IN (${placeholders})`).run(productId, ...keepIds);
      } else {
        db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
      }

      const updateVar = db.prepare(`
        UPDATE product_variants SET
          title = ?, weight_kg = ?, piece_count = ?, approx_piece_weight_g = ?,
          price = ?, stock_quantity = ?, is_active = ?, sort_order = ?
        WHERE id = ?
      `);

      const insertVar = db.prepare(`
        INSERT INTO product_variants (
          id, product_id, title, weight_kg, piece_count, approx_piece_weight_g,
          price, stock_quantity, is_active, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (v.id && keepIds.includes(v.id)) {
          updateVar.run(
            v.title,
            Number(v.weightKg || 1),
            Number(v.pieceCount || 1),
            v.approxPieceWeightG ? Number(v.approxPieceWeightG) : null,
            Number(v.price),
            Number(v.stockQuantity || 0),
            v.isActive !== false ? 1 : 0,
            v.sortOrder || i,
            v.id
          );
        } else {
          const vId = `var-${Date.now()}-${i}-${crypto.randomBytes(2).toString('hex')}`;
          insertVar.run(
            vId,
            productId,
            v.title,
            Number(v.weightKg || 1),
            Number(v.pieceCount || 1),
            v.approxPieceWeightG ? Number(v.approxPieceWeightG) : null,
            Number(v.price),
            Number(v.stockQuantity || 0),
            v.isActive !== false ? 1 : 0,
            v.sortOrder || i,
            new Date().toISOString()
          );
        }
      }
    }

    db.exec('COMMIT;');

    const updated = getProductWithVariants(productId);
    logAuditAction(req.admin, 'update_product', 'product', productId, existing, updated, req.ip);
    broadcastRealtimeEvent('product_updated', updated);

    return res.json(updated);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Error updating product:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء تعديل المنتج' });
  }
});

// DELETE /api/admin/products/:id (Manager and Super Admin only; operator FORBIDDEN)
router.delete('/admin/products/:id', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const existing = getProductWithVariants(productId);
  if (!existing) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  logAuditAction(req.admin, 'delete_product', 'product', productId, existing, null, req.ip);
  broadcastRealtimeEvent('product_deleted', { id: productId });

  return res.json({ message: 'تم حذف المنتج بنجاح' });
});

// POST /api/admin/products/:id/variants
router.post('/admin/products/:id/variants', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const productId = req.params.id;
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

  const { title, weightKg, pieceCount, approxPieceWeightG, price, stockQuantity } = req.body;
  if (!title || price === undefined) {
    return res.status(400).json({ error: 'اسم الحجم والسعر مطلوبان' });
  }

  const variantId = `var-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO product_variants (
      id, product_id, title, weight_kg, piece_count, approx_piece_weight_g, price, stock_quantity, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    variantId,
    productId,
    String(title).trim(),
    Number(weightKg || 1),
    Number(pieceCount || 1),
    approxPieceWeightG ? Number(approxPieceWeightG) : null,
    Number(price),
    Number(stockQuantity || 0),
    now
  );

  const updatedProduct = getProductWithVariants(productId);
  broadcastRealtimeEvent('product_updated', updatedProduct);

  return res.status(201).json({
    id: variantId,
    productId,
    title,
    weightKg: Number(weightKg || 1),
    pieceCount: Number(pieceCount || 1),
    price: Number(price),
    stockQuantity: Number(stockQuantity || 0),
  });
});

// DELETE /api/admin/products/:id/variants/:variantId
router.delete('/admin/products/:id/variants/:variantId', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const { id: productId, variantId } = req.params;
  const existing = db.prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?').get(variantId, productId);
  if (!existing) return res.status(404).json({ error: 'الحجم غير موجود' });

  db.prepare('DELETE FROM product_variants WHERE id = ? AND product_id = ?').run(variantId, productId);
  const updatedProduct = getProductWithVariants(productId);
  broadcastRealtimeEvent('product_updated', updatedProduct);

  return res.json({ message: 'تم حذف الحجم بنجاح' });
});

// ==========================================
// 5. CATEGORIES
// ==========================================
router.get('/admin/categories', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(`
      SELECT c.*, COUNT(p.id) as item_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC
    `)
    .all() as Record<string, unknown>[];

  return res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description || '',
      icon: r.icon,
      imageUrl: r.image_url,
      isActive: Boolean(r.is_active),
      sortOrder: r.sort_order,
      itemCount: Number(r.item_count || 0),
    }))
  );
});

router.post('/admin/categories', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const { name, slug, description, icon, imageUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });

  const catId = `cat-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const finalSlug = (slug || name).toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]+/g, '');

  db.prepare(`
    INSERT INTO categories (id, name, slug, description, icon, image_url, is_active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
  `).run(catId, name.trim(), finalSlug, description || '', icon || 'Fish', imageUrl || null, new Date().toISOString());

  const created = { id: catId, name, slug: finalSlug, description, icon, imageUrl, isActive: true, itemCount: 0 };
  logAuditAction(req.admin, 'create_category', 'category', catId, null, created, req.ip);

  return res.status(201).json(created);
});

router.delete('/admin/categories/:id', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id;
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  logAuditAction(req.admin, 'delete_category', 'category', id, null, null, req.ip);
  return res.json({ message: 'تم حذف التصنيف بنجاح' });
});

// ==========================================
// 6. ORDERS & ORDER ITEMS
// ==========================================

function getOrderWithItems(orderId: string) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined;
  if (!order) return null;

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Record<string, unknown>[];

  return {
    id: String(order.id),
    orderNumber: String(order.order_number),
    customerId: order.customer_id ? String(order.customer_id) : undefined,
    customerName: String(order.customer_name),
    customerPhone: String(order.customer_phone),
    customerAddress: String(order.customer_address),
    city: String(order.city || ''),
    district: String(order.district || ''),
    subtotal: Number(order.subtotal || 0),
    discountAmount: Number(order.discount_amount || 0),
    couponCode: order.coupon_code as string | null,
    deliveryFee: Number(order.delivery_fee || 0),
    totalAmount: Number(order.total_amount || 0),
    depositAmount: Number(order.deposit_amount || 0),
    depositStatus: String(order.deposit_status || 'not_required'),
    depositMethod: order.deposit_method as string | null,
    depositReference: order.deposit_reference as string | null,
    depositNotes: order.deposit_notes as string | null,
    depositConfirmedAt: order.deposit_confirmed_at as string | null,
    depositConfirmedBy: order.deposit_confirmed_by as string | null,
    remainingAmount: Number(order.remaining_amount || 0),
    status: String(order.status),
    notes: order.notes as string | null,
    items: items.map((i) => ({
      id: String(i.id),
      productId: String(i.product_id),
      productName: String(i.product_name),
      variantId: i.variant_id ? String(i.variant_id) : undefined,
      variantTitle: i.variant_title ? String(i.variant_title) : undefined,
      pricingUnit: String(i.pricing_unit),
      weightKg: Number(i.weight_kg || 0),
      pieceCount: Number(i.piece_count || 0),
      unitPrice: Number(i.unit_price || 0),
      quantity: Number(i.quantity || 0),
      totalPrice: Number(i.total_price || 0),
      snapshotData: i.snapshot_data ? JSON.parse(String(i.snapshot_data)) : undefined,
    })),
    createdAt: String(order.created_at),
    updatedAt: String(order.updated_at),
  };
}

// GET /api/admin/orders
router.get('/admin/orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { status, depositStatus, search } = req.query;

  let query = 'SELECT * FROM orders WHERE 1=1';
  const params: (string | number)[] = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(String(status));
  }

  if (depositStatus && depositStatus !== 'all') {
    query += ' AND deposit_status = ?';
    params.push(String(depositStatus));
  }

  if (search) {
    query += ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR deposit_reference LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY created_at DESC LIMIT 200';

  const orders = db.prepare(query).all(...params) as Record<string, unknown>[];

  // Fetch all items for these orders efficiently
  if (orders.length === 0) return res.json([]);

  const orderIds = orders.map((o) => String(o.id));
  const placeholders = orderIds.map(() => '?').join(',');
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).all(...orderIds) as Record<string, unknown>[];

  const itemsByOrder: Record<string, unknown[]> = {};
  for (const item of items) {
    const oId = String(item.order_id);
    if (!itemsByOrder[oId]) itemsByOrder[oId] = [];
    itemsByOrder[oId].push({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      variantId: item.variant_id,
      variantTitle: item.variant_title,
      pricingUnit: item.pricing_unit,
      weightKg: item.weight_kg,
      pieceCount: item.piece_count,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      totalPrice: item.total_price,
    });
  }

  const result = orders.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerId: o.customer_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    customerAddress: o.customer_address,
    city: o.city,
    district: o.district,
    subtotal: o.subtotal,
    discountAmount: o.discount_amount,
    couponCode: o.coupon_code,
    deliveryFee: o.delivery_fee,
    totalAmount: o.total_amount,
    depositAmount: o.deposit_amount,
    depositStatus: o.deposit_status,
    depositMethod: o.deposit_method,
    depositReference: o.deposit_reference,
    depositNotes: o.deposit_notes,
    depositConfirmedAt: o.deposit_confirmed_at,
    depositConfirmedBy: o.deposit_confirmed_by,
    remainingAmount: o.remaining_amount,
    status: o.status,
    notes: o.notes,
    items: itemsByOrder[String(o.id)] || [],
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));

  return res.json(result);
});

// POST /api/admin/orders (Manual order entry by admin)
router.post('/admin/orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const {
    customerName,
    customerPhone,
    customerAddress,
    city,
    district,
    items,
    depositAmount,
    depositMethod,
    depositReference,
    depositStatus,
    notes,
    deliveryFee,
  } = req.body;

  if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'اسم العميل، الهاتف، وقائمة الأصناف مطلوبة' });
  }

  const orderId = `order-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const orderNumber = `#ALM-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    let subtotal = 0;
    const processedItems: {
      productId: string;
      variantId?: string;
      productName: string;
      variantTitle?: string;
      pricingUnit: string;
      weightKg?: number;
      pieceCount?: number;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }[] = [];

    for (const item of items) {
      let unitPrice = item.unitPrice;
      let productName = item.productName || 'صنف سمك';
      let variantTitle = item.variantTitle;
      let weightKg = item.weightKg;
      let pieceCount = item.pieceCount;
      const pricingUnit = item.pricingUnit || 'kg';
      const quantity = Number(item.quantity || 1);

      // Verify product and variant against DB
      const prod = db.prepare('SELECT name, base_price, pricing_unit FROM products WHERE id = ?').get(item.productId) as
        | { name: string; base_price: number; pricing_unit: string }
        | undefined;

      if (prod) {
        productName = prod.name;
        unitPrice = prod.base_price;
      }

      if (item.variantId) {
        const v = db.prepare('SELECT title, price, weight_kg, piece_count FROM product_variants WHERE id = ?').get(item.variantId) as
          | { title: string; price: number; weight_kg: number; piece_count: number }
          | undefined;

        if (v) {
          variantTitle = v.title;
          unitPrice = v.price;
          weightKg = v.weight_kg;
          pieceCount = v.piece_count;
        }
      }

      const itemTotal = unitPrice * quantity;
      subtotal += itemTotal;

      processedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        productName,
        variantTitle,
        pricingUnit,
        weightKg,
        pieceCount,
        unitPrice,
        quantity,
        totalPrice: itemTotal,
      });

      // Deduct stock if variant
      if (item.variantId) {
        db.prepare('UPDATE product_variants SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?').run(quantity, item.variantId);
      }
      // Deduct stock from product
      db.prepare('UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?').run(quantity, item.productId);
    }

    const fee = Number(deliveryFee || 15);
    const totalAmount = subtotal + fee;
    const deposit = Number(depositAmount || 0);
    const finalDepositStatus = depositStatus || (deposit > 0 ? 'confirmed' : 'pending');
    const remaining = Math.max(0, totalAmount - deposit);

    // Upsert Customer
    let customerId: string | null = null;
    const existingCust = db.prepare('SELECT id, total_orders, total_spent FROM customers WHERE phone = ?').get(customerPhone.trim()) as
      | { id: string; total_orders: number; total_spent: number }
      | undefined;

    if (existingCust) {
      customerId = existingCust.id;
      db.prepare(`
        UPDATE customers SET
          total_orders = total_orders + 1,
          total_spent = total_spent + ?,
          last_order_date = ?,
          name = ?,
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          district = COALESCE(?, district)
        WHERE id = ?
      `).run(totalAmount, now, customerName.trim(), customerAddress, city, district, customerId);
    } else {
      customerId = `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      db.prepare(`
        INSERT INTO customers (id, name, phone, city, district, address, total_orders, total_spent, last_order_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'active', ?)
      `).run(customerId, customerName.trim(), customerPhone.trim(), city || 'القاهرة', district || '', customerAddress || '', totalAmount, now, now);
    }

    // Insert Order
    db.prepare(`
      INSERT INTO orders (
        id, order_number, customer_id, customer_name, customer_phone, customer_address,
        city, district, subtotal, discount_amount, delivery_fee, total_amount,
        deposit_amount, deposit_status, deposit_method, deposit_reference, deposit_notes,
        deposit_confirmed_at, deposit_confirmed_by, remaining_amount, status, notes,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
      )
    `).run(
      orderId,
      orderNumber,
      customerId,
      customerName.trim(),
      customerPhone.trim(),
      customerAddress || '',
      city || 'القاهرة',
      district || '',
      subtotal,
      fee,
      totalAmount,
      deposit,
      finalDepositStatus,
      depositMethod || 'instapay',
      depositReference || null,
      null,
      finalDepositStatus === 'confirmed' ? now : null,
      finalDepositStatus === 'confirmed' ? req.admin!.name : null,
      remaining,
      notes || null,
      now,
      now
    );

    // Insert Order Items
    const insertItem = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, product_name, variant_title,
        pricing_unit, weight_kg, piece_count, unit_price, quantity, total_price,
        snapshot_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pi of processedItems) {
      const itemId = `item-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      insertItem.run(
        itemId,
        orderId,
        pi.productId,
        pi.variantId || null,
        pi.productName,
        pi.variantTitle || null,
        pi.pricingUnit,
        pi.weightKg || null,
        pi.pieceCount || null,
        pi.unitPrice,
        pi.quantity,
        pi.totalPrice,
        JSON.stringify(pi),
        now
      );
    }

    db.exec('COMMIT;');

    const createdOrder = getOrderWithItems(orderId);
    logAuditAction(req.admin, 'create_manual_order', 'order', orderId, null, { orderNumber, totalAmount }, req.ip);
    broadcastRealtimeEvent('new_order', createdOrder);

    return res.status(201).json(createdOrder);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Error creating manual order:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الطلب' });
  }
});

// PUT /api/admin/orders/:id/status
router.put('/admin/orders/:id/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['pending', 'preparing', 'delivering', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'حالة الطلب غير صالحة' });
  }

  const existing = getOrderWithItems(orderId);
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود' });

  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, orderId);

  const updated = getOrderWithItems(orderId);
  logAuditAction(req.admin, 'update_order_status', 'order', orderId, { oldStatus: existing.status }, { newStatus: status }, req.ip);
  broadcastRealtimeEvent('order_status_updated', updated);

  return res.json(updated);
});

// PUT /api/admin/orders/:id/deposit
router.put('/admin/orders/:id/deposit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  const { depositStatus, depositAmount, depositMethod, depositReference, depositNotes } = req.body;

  const existing = getOrderWithItems(orderId);
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود' });

  const now = new Date().toISOString();
  const newDepositAmount = depositAmount !== undefined ? Number(depositAmount) : existing.depositAmount;
  const newRemaining = Math.max(0, existing.totalAmount - newDepositAmount);
  const isConfirmed = depositStatus === 'confirmed';

  db.prepare(`
    UPDATE orders SET
      deposit_status = COALESCE(?, deposit_status),
      deposit_amount = ?,
      remaining_amount = ?,
      deposit_method = COALESCE(?, deposit_method),
      deposit_reference = COALESCE(?, deposit_reference),
      deposit_notes = COALESCE(?, deposit_notes),
      deposit_confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE deposit_confirmed_at END,
      deposit_confirmed_by = CASE WHEN ? = 'confirmed' THEN ? ELSE deposit_confirmed_by END,
      updated_at = ?
    WHERE id = ?
  `).run(
    depositStatus || null,
    newDepositAmount,
    newRemaining,
    depositMethod || null,
    depositReference || null,
    depositNotes || null,
    depositStatus || '',
    now,
    depositStatus || '',
    req.admin!.name,
    now,
    orderId
  );

  const updated = getOrderWithItems(orderId);
  logAuditAction(req.admin, 'update_order_deposit', 'order', orderId, { oldDeposit: existing.depositStatus }, { newDeposit: depositStatus, amount: newDepositAmount }, req.ip);
  broadcastRealtimeEvent('deposit_updated', updated);

  return res.json(updated);
});

// ==========================================
// 7. CUSTOMERS
// ==========================================
router.get('/admin/customers', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const customers = db
    .prepare('SELECT * FROM customers ORDER BY total_orders DESC, created_at DESC')
    .all() as Record<string, unknown>[];

  return res.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone,
      city: c.city || 'القاهرة',
      district: c.district || '',
      address: c.address || '',
      totalOrders: Number(c.total_orders || 0),
      totalSpent: Number(c.total_spent || 0),
      lastOrderDate: c.last_order_date,
      status: c.status || 'active',
      notes: c.notes || '',
      registeredAt: c.created_at,
    }))
  );
});

router.put('/admin/customers/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const customerId = req.params.id;
  const { name, phone, city, district, address, status, notes } = req.body;

  db.prepare(`
    UPDATE customers SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      city = COALESCE(?, city),
      district = COALESCE(?, district),
      address = COALESCE(?, address),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name, phone, city, district, address, status, notes, customerId);

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  logAuditAction(req.admin, 'update_customer', 'customer', customerId, null, updated, req.ip);

  return res.json(updated);
});

// ==========================================
// 8. COUPONS
// ==========================================
router.get('/admin/coupons', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return res.json(
    coupons.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      minOrderValue: c.min_order_value,
      maxDiscountValue: c.max_discount_value,
      usageLimit: c.usage_limit,
      usedCount: c.used_count,
      expiryDate: c.expiry_date,
      isActive: Boolean(c.is_active),
      createdAt: c.created_at,
    }))
  );
});

router.post('/admin/coupons', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const { code, discountType, discountValue, minOrderValue, maxDiscountValue, usageLimit, expiryDate } = req.body;
  if (!code || !discountType || discountValue === undefined || !expiryDate) {
    return res.status(400).json({ error: 'كود الكوبون، نوع الخصم، القيمة وتاريخ الانتهاء مطلوبة' });
  }

  const id = `cpn-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const cleanCode = code.toUpperCase().trim();

  db.prepare(`
    INSERT INTO coupons (id, code, discount_type, discount_value, min_order_value, max_discount_value, usage_limit, used_count, expiry_date, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
  `).run(
    id,
    cleanCode,
    discountType,
    Number(discountValue),
    Number(minOrderValue || 0),
    maxDiscountValue ? Number(maxDiscountValue) : null,
    Number(usageLimit || 100),
    expiryDate,
    new Date().toISOString()
  );

  const created = { id, code: cleanCode, discountType, discountValue, minOrderValue, maxDiscountValue, usageLimit, usedCount: 0, expiryDate, isActive: true };
  logAuditAction(req.admin, 'create_coupon', 'coupon', id, null, created, req.ip);

  return res.status(201).json(created);
});

router.delete('/admin/coupons/:id', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id;
  db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
  logAuditAction(req.admin, 'delete_coupon', 'coupon', id, null, null, req.ip);
  return res.json({ message: 'تم حذف الكوبون' });
});

// ==========================================
// 9. STORE SETTINGS
// ==========================================
router.get('/admin/settings', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const s = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!s) return res.status(404).json({ error: 'الإعدادات غير موجودة' });

  return res.json({
    storeName: s.store_name,
    tagline: s.tagline || '',
    phone: s.phone || '',
    whatsapp: s.whatsapp || '',
    instapayHandle: s.instapay_handle || '',
    instapayNumber: s.instapay_number || '',
    vodafoneCash: s.vodafone_cash || '',
    address: s.address || '',
    isOpen: Boolean(s.is_open),
    closedReason: s.closed_reason || '',
    deliveryFee: Number(s.default_delivery_fee || 15),
    freeDeliveryThreshold: Number(s.free_delivery_threshold || 400),
    minOrderAmount: Number(s.min_order_amount || 100),
    depositPercentage: Number(s.deposit_percentage || 20),
    minDepositAmount: Number(s.min_deposit_amount || 50),
    workingHours: s.working_hours || '',
    cutoffHour: Number(s.cutoff_hour || 3),
    currency: s.currency || 'ج.م',
  });
});

router.put('/admin/settings', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const {
    storeName,
    tagline,
    phone,
    whatsapp,
    instapayHandle,
    instapayNumber,
    vodafoneCash,
    address,
    isOpen,
    closedReason,
    deliveryFee,
    freeDeliveryThreshold,
    minOrderAmount,
    depositPercentage,
    minDepositAmount,
    workingHours,
    cutoffHour,
    currency,
  } = req.body;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE store_settings SET
      store_name = COALESCE(?, store_name),
      tagline = COALESCE(?, tagline),
      phone = COALESCE(?, phone),
      whatsapp = COALESCE(?, whatsapp),
      instapay_handle = COALESCE(?, instapay_handle),
      instapay_number = COALESCE(?, instapay_number),
      vodafone_cash = COALESCE(?, vodafone_cash),
      address = COALESCE(?, address),
      is_open = COALESCE(?, is_open),
      closed_reason = COALESCE(?, closed_reason),
      default_delivery_fee = COALESCE(?, default_delivery_fee),
      free_delivery_threshold = COALESCE(?, free_delivery_threshold),
      min_order_amount = COALESCE(?, min_order_amount),
      deposit_percentage = COALESCE(?, deposit_percentage),
      min_deposit_amount = COALESCE(?, min_deposit_amount),
      working_hours = COALESCE(?, working_hours),
      cutoff_hour = COALESCE(?, cutoff_hour),
      currency = COALESCE(?, currency),
      updated_at = ?
    WHERE id = 1
  `).run(
    storeName,
    tagline,
    phone,
    whatsapp,
    instapayHandle,
    instapayNumber,
    vodafoneCash,
    address,
    isOpen !== undefined ? (isOpen ? 1 : 0) : null,
    closedReason,
    deliveryFee !== undefined ? Number(deliveryFee) : null,
    freeDeliveryThreshold !== undefined ? Number(freeDeliveryThreshold) : null,
    minOrderAmount !== undefined ? Number(minOrderAmount) : null,
    depositPercentage !== undefined ? Number(depositPercentage) : null,
    minDepositAmount !== undefined ? Number(minDepositAmount) : null,
    workingHours,
    cutoffHour !== undefined ? Number(cutoffHour) : null,
    currency,
    now
  );

  const updated = db.prepare('SELECT * FROM store_settings WHERE id = 1').get();
  logAuditAction(req.admin, 'update_store_settings', 'store_settings', '1', null, updated, req.ip);

  return res.json({ message: 'تم حفظ إعدادات المتجر بنجاح' });
});

// ==========================================
// 10. AUDIT LOGS
// ==========================================
router.get('/admin/audit-logs', requireAuth, requireRole(['super_admin', 'manager']), (_req: AuthenticatedRequest, res: Response) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all() as Record<string, unknown>[];
  return res.json(
    logs.map((l) => ({
      id: l.id,
      adminId: l.admin_id,
      adminName: l.admin_name,
      adminEmail: l.admin_email,
      action: l.action,
      entityType: l.entity_type,
      entityId: l.entity_id,
      oldValues: l.old_values,
      newValues: l.new_values,
      ipAddress: l.ip_address,
      createdAt: l.created_at,
    }))
  );
});

// ==========================================
// 11. INVENTORY & CUTOFF PREP
// ==========================================
router.get('/admin/inventory', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  // Aggregate stock across products and variants
  const products = db.prepare(`
    SELECT p.id, p.name, p.pricing_unit, p.stock_quantity, p.in_stock, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name ASC
  `).all() as Record<string, unknown>[];

  const variants = db.prepare('SELECT * FROM product_variants ORDER BY weight_kg ASC, piece_count ASC').all() as Record<string, unknown>[];

  return res.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.category_name,
      pricingUnit: p.pricing_unit,
      stockQuantity: p.stock_quantity,
      inStock: Boolean(p.in_stock),
    })),
    variants: variants.map((v) => ({
      id: v.id,
      productId: v.product_id,
      title: v.title,
      weightKg: v.weight_kg,
      pieceCount: v.piece_count,
      approxPieceWeightG: v.approx_piece_weight_g,
      price: v.price,
      stockQuantity: v.stock_quantity,
      isActive: Boolean(v.is_active),
    })),
  });
});

router.patch('/admin/inventory/adjust', requireAuth, requireRole(['super_admin', 'manager']), (req: AuthenticatedRequest, res: Response) => {
  const { productId, variantId, newStock } = req.body;
  if (newStock === undefined || newStock < 0) {
    return res.status(400).json({ error: 'الكمية غير صالحة' });
  }

  if (variantId) {
    db.prepare('UPDATE product_variants SET stock_quantity = ? WHERE id = ?').run(Number(newStock), variantId);
  } else if (productId) {
    db.prepare('UPDATE products SET stock_quantity = ?, in_stock = CASE WHEN ? > 0 THEN 1 ELSE 0 END WHERE id = ?').run(
      Number(newStock),
      Number(newStock),
      productId
    );
  }

  logAuditAction(req.admin, 'adjust_stock', variantId ? 'variant' : 'product', variantId || productId, null, { newStock }, req.ip);
  broadcastRealtimeEvent('stock_adjusted', { productId, variantId, newStock });

  return res.json({ message: 'تم تحديث المخزون بنجاح' });
});

// ==========================================
// 12. UNIFIED PUBLIC API (Customer Store endpoints)
// Connecting to the EXACT SAME Database
// ==========================================

// GET /api/products (Customer Store)
router.get('/products', (_req: Request, res: Response) => {
  const products = db
    .prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
      ORDER BY p.sort_order ASC, p.created_at DESC
    `)
    .all() as Record<string, unknown>[];

  const variants = db
    .prepare('SELECT * FROM product_variants WHERE is_active = 1 ORDER BY sort_order ASC, weight_kg ASC, piece_count ASC')
    .all() as Record<string, unknown>[];

  const variantsByProduct: Record<string, unknown[]> = {};
  for (const v of variants) {
    const pId = String(v.product_id);
    if (!variantsByProduct[pId]) variantsByProduct[pId] = [];
    variantsByProduct[pId].push({
      id: v.id,
      productId: v.product_id,
      title: v.title,
      weightKg: v.weight_kg,
      pieceCount: v.piece_count,
      approxPieceWeightG: v.approx_piece_weight_g,
      price: v.price,
      stockQuantity: v.stock_quantity,
    });
  }

  return res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      categoryId: p.category_id,
      categoryName: p.category_name || '',
      pricingUnit: p.pricing_unit,
      price: p.base_price,
      stockQuantity: p.stock_quantity,
      inStock: Boolean(p.in_stock && Number(p.stock_quantity) > 0),
      imageUrl: p.image_url,
      badge: p.badge,
      variants: variantsByProduct[String(p.id)] || [],
    }))
  );
});

// GET /api/categories (Customer Store)
router.get('/categories', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC').all();
  return res.json(rows);
});

// GET /api/settings (Customer Store)
router.get('/settings', (_req: Request, res: Response) => {
  const s = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<string, unknown>;
  return res.json({
    storeName: s.store_name,
    tagline: s.tagline,
    phone: s.phone,
    whatsapp: s.whatsapp,
    instapayHandle: s.instapay_handle,
    instapayNumber: s.instapay_number,
    vodafoneCash: s.vodafone_cash,
    address: s.address,
    isOpen: Boolean(s.is_open),
    closedReason: s.closed_reason,
    deliveryFee: s.default_delivery_fee,
    freeDeliveryThreshold: s.free_delivery_threshold,
    minOrderAmount: s.min_order_amount,
    depositPercentage: s.deposit_percentage,
    minDepositAmount: s.min_deposit_amount,
    workingHours: s.working_hours,
    currency: s.currency,
  });
});

// POST /api/orders (Customer Order Placement with atomic stock deduction & price verification)
router.post('/orders', (req: Request, res: Response) => {
  const {
    customerName,
    customerPhone,
    customerAddress,
    city,
    district,
    items,
    couponCode,
    depositMethod,
    depositReference,
    notes,
  } = req.body;

  if (!customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'بيانات العميل والأصناف مطلوبة لإتمام الطلب' });
  }

  const orderId = `order-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const orderNumber = `#ALM-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    let subtotal = 0;
    const verifiedItems: {
      productId: string;
      variantId?: string;
      productName: string;
      variantTitle?: string;
      pricingUnit: string;
      weightKg?: number;
      pieceCount?: number;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }[] = [];

    // CRITICAL SECURITY RULE: Validate prices and stock strictly from server database!
    for (const item of items) {
      const prod = db.prepare('SELECT id, name, base_price, pricing_unit, stock_quantity, in_stock FROM products WHERE id = ?').get(item.productId) as
        | { id: string; name: string; base_price: number; pricing_unit: string; stock_quantity: number; in_stock: number }
        | undefined;

      if (!prod) {
        db.exec('ROLLBACK;');
        return res.status(400).json({ error: `الصنف المطلوب غير موجود (${item.productId})` });
      }

      let unitPrice = prod.base_price;
      let variantTitle: string | undefined;
      let weightKg: number | undefined;
      let pieceCount: number | undefined;
      const quantity = Math.max(0.25, Number(item.quantity || 1));

      if (item.variantId) {
        const v = db.prepare('SELECT id, title, price, weight_kg, piece_count, stock_quantity FROM product_variants WHERE id = ? AND product_id = ?').get(item.variantId, prod.id) as
          | { id: string; title: string; price: number; weight_kg: number; piece_count: number; stock_quantity: number }
          | undefined;

        if (!v) {
          db.exec('ROLLBACK;');
          return res.status(400).json({ error: `الخيار/الحجم المطلوب غير متوفر للصنف ${prod.name}` });
        }

        if (v.stock_quantity < quantity) {
          db.exec('ROLLBACK;');
          return res.status(400).json({ error: `الكمية المطلوبة غير متوفرة في المخزون للحجم ${v.title} من صنف ${prod.name}` });
        }

        unitPrice = v.price;
        variantTitle = v.title;
        weightKg = v.weight_kg;
        pieceCount = v.piece_count;

        // Deduct variant stock
        db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?').run(quantity, v.id);
      } else {
        if (prod.stock_quantity < quantity) {
          db.exec('ROLLBACK;');
          return res.status(400).json({ error: `الكمية المطلوبة غير متوفرة في المخزون لصنف ${prod.name}` });
        }
      }

      // Deduct product stock
      db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(quantity, prod.id);

      const totalPrice = unitPrice * quantity;
      subtotal += totalPrice;

      verifiedItems.push({
        productId: prod.id,
        variantId: item.variantId,
        productName: prod.name,
        variantTitle,
        pricingUnit: prod.pricing_unit,
        weightKg,
        pieceCount,
        unitPrice,
        quantity,
        totalPrice,
      });
    }

    // Validate Coupon if provided
    let discountAmount = 0;
    if (couponCode) {
      const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(couponCode.toUpperCase().trim()) as Record<string, unknown> | undefined;
      if (coupon && (!coupon.expiry_date || new Date(String(coupon.expiry_date)) >= new Date())) {
        if (subtotal >= Number(coupon.min_order_value || 0)) {
          if (coupon.discount_type === 'percentage') {
            discountAmount = (subtotal * Number(coupon.discount_value)) / 100;
            if (coupon.max_discount_value) {
              discountAmount = Math.min(discountAmount, Number(coupon.max_discount_value));
            }
          } else {
            discountAmount = Number(coupon.discount_value);
          }
          // Increment coupon usage
          db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(String(coupon.id));
        }
      }
    }

    // Store settings for delivery fee & deposit
    const settings = db.prepare('SELECT * FROM store_settings WHERE id = 1').get() as Record<string, unknown>;
    const fee = subtotal >= Number(settings.free_delivery_threshold || 400) ? 0 : Number(settings.default_delivery_fee || 15);
    const totalAmount = Math.max(0, subtotal - discountAmount + fee);

    // Calculate required deposit
    const depositPct = Number(settings.deposit_percentage || 20);
    const minDeposit = Number(settings.min_deposit_amount || 50);
    const calculatedDeposit = Math.max(minDeposit, Math.round((totalAmount * depositPct) / 100));
    const depositAmount = calculatedDeposit;
    const remainingAmount = Math.max(0, totalAmount - depositAmount);

    // Upsert Customer
    let customerId: string | null = null;
    const existingCust = db.prepare('SELECT id, total_orders, total_spent FROM customers WHERE phone = ?').get(customerPhone.trim()) as
      | { id: string; total_orders: number; total_spent: number }
      | undefined;

    if (existingCust) {
      customerId = existingCust.id;
      db.prepare(`
        UPDATE customers SET
          total_orders = total_orders + 1,
          total_spent = total_spent + ?,
          last_order_date = ?,
          name = ?,
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          district = COALESCE(?, district)
        WHERE id = ?
      `).run(totalAmount, now, customerName.trim(), customerAddress, city, district, customerId);
    } else {
      customerId = `cust-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      db.prepare(`
        INSERT INTO customers (id, name, phone, city, district, address, total_orders, total_spent, last_order_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'active', ?)
      `).run(customerId, customerName.trim(), customerPhone.trim(), city || 'القاهرة', district || '', customerAddress || '', totalAmount, now, now);
    }

    // Insert Order
    db.prepare(`
      INSERT INTO orders (
        id, order_number, customer_id, customer_name, customer_phone, customer_address,
        city, district, subtotal, discount_amount, coupon_code, delivery_fee, total_amount,
        deposit_amount, deposit_status, deposit_method, deposit_reference, deposit_notes,
        deposit_confirmed_at, deposit_confirmed_by, remaining_amount, status, notes,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, null, null, null, ?, 'pending', ?, ?, ?
      )
    `).run(
      orderId,
      orderNumber,
      customerId,
      customerName.trim(),
      customerPhone.trim(),
      customerAddress || '',
      city || 'القاهرة',
      district || '',
      subtotal,
      discountAmount,
      couponCode ? couponCode.toUpperCase().trim() : null,
      fee,
      totalAmount,
      depositAmount,
      depositMethod || 'instapay',
      depositReference || null,
      remainingAmount,
      notes || null,
      now,
      now
    );

    // Insert Order Items
    const insertItem = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, product_name, variant_title,
        pricing_unit, weight_kg, piece_count, unit_price, quantity, total_price,
        snapshot_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const vi of verifiedItems) {
      const itemId = `item-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      insertItem.run(
        itemId,
        orderId,
        vi.productId,
        vi.variantId || null,
        vi.productName,
        vi.variantTitle || null,
        vi.pricingUnit,
        vi.weightKg || null,
        vi.pieceCount || null,
        vi.unitPrice,
        vi.quantity,
        vi.totalPrice,
        JSON.stringify(vi),
        now
      );
    }

    db.exec('COMMIT;');

    const createdOrder = getOrderWithItems(orderId);

    // INSTANT REALTIME BROADCAST TO ALL ADMIN DASHBOARDS!
    broadcastRealtimeEvent('new_order', createdOrder);

    return res.status(201).json({
      success: true,
      message: 'تم استلام طلبك بنجاح وجاري مراجعة العربون وتجهيز الصيد الطازج',
      order: createdOrder,
    });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Order placement transaction error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب' });
  }
});
