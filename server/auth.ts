import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'almallah_super_secure_server_key_2026_jwt_secret';

export interface AdminPayload {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'manager' | 'operator';
  avatarUrl?: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: AdminPayload;
}

// Password Hashing with PBKDF2
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function verifyPassword(passwordAttempt: string, storedHash: string, salt: string): boolean {
  const attemptHash = hashPassword(passwordAttempt, salt);
  return crypto.timingSafeEqual(Buffer.from(attemptHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// JWT Token Signing (HMAC-SHA256)
export function signToken(payload: AdminPayload, expiresInHours = 24): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): (AdminPayload & { exp: number }) | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return data;
  } catch {
    return null;
  }
}

// Rate Limiting (Brute force protection)
interface RateLimitRecord {
  failedAttempts: number;
  blockedUntil: number;
}
const rateLimits = new Map<string, RateLimitRecord>();

export function checkRateLimit(key: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = rateLimits.get(key);
  if (!record) return { allowed: true };

  if (record.blockedUntil > now) {
    const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Reset if block expired
  if (record.blockedUntil > 0 && record.blockedUntil <= now) {
    rateLimits.delete(key);
  }
  return { allowed: true };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = rateLimits.get(key) || { failedAttempts: 0, blockedUntil: 0 };
  record.failedAttempts += 1;

  if (record.failedAttempts >= 5) {
    // Block for 15 minutes
    record.blockedUntil = now + 15 * 60 * 1000;
  }
  rateLimits.set(key, record);
}

export function clearRateLimit(key: string): void {
  rateLimits.delete(key);
}

// Authentication Middleware
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب تسجيل الدخول للوصول إلى هذا المورد' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة أو الرمز غير صالح. يرجى إعادة تسجيل الدخول' });
  }

  // Verify admin still exists in database
  const adminRow = db.prepare('SELECT id, name, email, role, avatar_url FROM admins WHERE id = ?').get(payload.id) as {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar_url: string;
  } | undefined;

  if (!adminRow) {
    return res.status(401).json({ error: 'المستخدم الإداري غير موجود أو تم حذفه' });
  }

  req.admin = {
    id: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    role: adminRow.role as 'super_admin' | 'manager' | 'operator',
    avatarUrl: adminRow.avatar_url,
  };

  next();
}

// Role Authorization Middleware
export function requireRole(allowedRoles: Array<'super_admin' | 'manager' | 'operator'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        error: `ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء (${req.admin.role}). مطلوب: ${allowedRoles.join(' أو ')}`,
      });
    }

    next();
  };
}

// Audit Logging
export function logAuditAction(
  admin: AdminPayload | undefined,
  action: string,
  entityType: string,
  entityId: string,
  oldValues?: unknown,
  newValues?: unknown,
  ipAddress?: string
) {
  try {
    const id = `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, admin_email, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      admin?.id || 'system',
      admin?.name || 'النظام',
      admin?.email || 'system@almallah.com',
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress || 'unknown',
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}
