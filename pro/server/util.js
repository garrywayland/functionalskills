import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomId = () => crypto.randomBytes(16).toString('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; let tooBig = false; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      // Keep the connection alive long enough to answer politely; give up only if wildly oversized.
      if (size > limit * 10) { req.destroy(); return; }
      if (size > limit) { tooBig = true; return; }
      chunks.push(c);
    });
    req.on('end', () => (tooBig ? reject(new HttpError(413, 'That is too much to send at once.')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

export function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* skip bad cookie */ } }
  });
  return out;
}

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const isoNow = () => new Date().toISOString();

export function normaliseEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return null;
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(e)) return null;
  return e;
}

export function maskEmail(email) {
  const [u, d] = String(email).split('@');
  return (u.slice(0, 2) + '***@' + d);
}

// Fixed-window counter in memory (per process). Good enough for a single small service; the real
// protections that matter across instances (monthly quota, daily cap) live in the store.
export class RateLimiter {
  constructor() { this.hits = new Map(); }
  allow(key, limit, windowMs, now = Date.now()) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= limit) { this.hits.set(key, list); return false; }
    list.push(now); this.hits.set(key, list);
    if (this.hits.size > 20000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < windowMs)) this.hits.delete(k);
    return true;
  }
}
