// The Next Stop Plus service: one Node process that serves the website and its API.
// Learner writing is never logged. Passwords do not exist. Card details never arrive here.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadConfig, checkConfig } from './config.js';
import { HttpError, readBody, parseCookies, RateLimiter, monthKey, dayKey, normaliseEmail, sha256 } from './util.js';
import { openStore } from './store/index.js';
import { makeMailer } from './mailer.js';
import { makeAuth } from './auth.js';
import { isPlus, planSummary, extend } from './entitlements.js';
import { loadContent } from './content.js';
import { makeBilling } from './billing.js';
import { makeSync } from './sync.js';
import { makeFamily } from './family.js';
import { makeProvider, makeMarker, MarkRequest } from './marking/index.js';
import { taskRequest } from './marking/task.js';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export async function createApp(cfg, deps = {}) {
  const logFn = deps.log || ((line) => console.log(line));
  const log = (msg, extra = {}) => logFn(JSON.stringify({ msg, ...extra }));
  const store = deps.store || (await openStore(cfg));
  const mailer = deps.mailer || makeMailer(cfg, log);
  const limiter = new RateLimiter();
  const auth = makeAuth({ cfg, store, mailer, limiter });
  const content = loadContent(cfg.contentDir || path.join(here, '..', 'content'));
  const billing = makeBilling({ cfg, store, log });
  const sync = makeSync({ cfg, store });
  const family = makeFamily({ store, content, limiter });
  const marker = makeMarker(deps.provider !== undefined ? deps.provider : makeProvider(cfg, deps, log));
  const webDir = cfg.webDir || path.join(here, '..', 'web');

  const isAdmin = (u) => Boolean(u && cfg.adminEmails.includes(u.email));

  function clientIp(req) {
    if (cfg.trustProxy) {
      // Addresses are added on the right by Google's own servers, so count in from the right (the left can be faked).
      // Straight to Cloud Run that is 1 hop. Through Firebase Hosting or a load balancer it may be more:
      // check /api/admin/diagnostics once deployed.
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[Math.max(0, xff.length - cfg.trustedProxyHops)];
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function baseHeaders(extra = {}) {
    const h = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', 'Content-Security-Policy': CSP, ...extra,
    };
    if (cfg.production) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    return h;
  }

  function sendJson(req, res, status, body, extraHeaders = {}) {
    const raw = Buffer.from(JSON.stringify(body));
    const headers = baseHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
    if (raw.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
      const z = zlib.gzipSync(raw); res.writeHead(status, headers); return res.end(z);
    }
    res.writeHead(status, headers); res.end(raw);
  }

  async function userOf(req) { return auth.userFromCookies(parseCookies(req.headers.cookie)); }
  async function requireUser(req) {
    const u = await userOf(req);
    if (!u) throw new HttpError(401, 'Please sign in first.', 'signin_required');
    return u;
  }

  function checkSameOrigin(req) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (req.headers['x-ns'] !== '1') throw new HttpError(403, 'That request was not allowed.');
    const origin = req.headers.origin;
    if (origin) {
      let host; try { host = new URL(origin).host; } catch { host = ''; }
      if (host !== req.headers.host) throw new HttpError(403, 'That request was not allowed.');
    }
  }

  async function jsonBody(req) {
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
    const raw = (await readBody(req, cfg.maxBodyBytes)).toString('utf8');
    try { const j = JSON.parse(raw || '{}'); if (j && typeof j === 'object') return j; } catch { /* fall through */ }
    throw new HttpError(400, 'That did not look right. Please try again.');
  }

  async function quotaFor(user) {
    const used = await store.getCount(`marks:${user.id}:${monthKey()}`);
    return { used, limit: cfg.quotaMonthlyMarks };
  }

  async function mePayload(user) {
    if (!user) return { signedIn: false, features: { marking: marker.available, payments: billing.enabled }, brand: cfg.brand, planName: cfg.planName };
    return {
      signedIn: true, user: { id: user.id, email: user.email, createdAt: user.createdAt }, admin: isAdmin(user),
      plan: planSummary(user), quota: await quotaFor(user), canManageBilling: Boolean(user.stripeCustomerId),
      features: { marking: marker.available, payments: billing.enabled }, brand: cfg.brand, planName: cfg.planName,
    };
  }

  // ---------- the API ----------
  async function api(req, res, url, ip) {
    const route = req.method + ' ' + url.pathname;
    const seg = url.pathname.split('/').filter(Boolean);   // ['api', ...]

    if (route === 'GET /api/health') return sendJson(req, res, 200, { ok: true });

    if (route === 'POST /api/stripe/webhook') {
      const raw = (await readBody(req, 500_000)).toString('utf8');
      const out = await billing.webhook(raw, req.headers['stripe-signature']);
      return sendJson(req, res, 200, { ok: true, ...out });
    }

    checkSameOrigin(req);

    if (route === 'POST /api/auth/request') {
      const b = await jsonBody(req);
      const { link } = await auth.requestLink(b.email, ip);
      return sendJson(req, res, 200, { ok: true, ...(cfg.devMode ? { devLink: link } : {}) });
    }
    if (route === 'POST /api/auth/peek') {
      const b = await jsonBody(req);
      return sendJson(req, res, 200, { ok: true, ...(await auth.peek(b.token, ip)) });
    }
    if (route === 'POST /api/auth/verify') {
      const b = await jsonBody(req);
      const { user, created, cookie } = await auth.verify(b.token, ip);
      return sendJson(req, res, 200, { ok: true, created, me: await mePayload(user) }, { 'Set-Cookie': cookie });
    }
    if (route === 'POST /api/auth/logout') return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
    if (route === 'POST /api/auth/logout-all') {
      const u = await requireUser(req); await auth.revokeAll(u);
      return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
    }

    if (route === 'GET /api/me') return sendJson(req, res, 200, await mePayload(await userOf(req)));

    if (route === 'GET /api/content') {
      const u = await userOf(req);
      return sendJson(req, res, 200, content.bundle({ entitled: isPlus(u) || isAdmin(u), drafts: isAdmin(u) && url.searchParams.get('drafts') === '1' }));
    }

    if (route === 'GET /api/billing/plans') return sendJson(req, res, 200, billing.plans());
    if (route === 'POST /api/billing/checkout') {
      const u = await requireUser(req); const b = await jsonBody(req);
      return sendJson(req, res, 200, await billing.checkout(u, b.plan));
    }
    if (route === 'POST /api/billing/portal') { const u = await requireUser(req); return sendJson(req, res, 200, await billing.portal(u)); }

    if (route === 'POST /api/redeem') {
      const u = await requireUser(req); const b = await jsonBody(req);
      if (!limiter.allow('redeem:' + u.id, 10, 3600_000) || !limiter.allow('redeem-ip:' + ip, 30, 3600_000)) throw new HttpError(429, 'Too many tries. Please wait a little.');
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rec = code.length >= 6 ? await store.useCode(sha256(code)) : null;
      if (!rec) throw new HttpError(400, 'That code did not work. Check it and try again.');
      const plan = extend(u, rec.days, 'code', { renews: false, label: rec.label || null });
      await store.updateUser(u.id, { plan });
      return sendJson(req, res, 200, { ok: true, plan: planSummary({ ...u, plan }) });
    }

    if (route === 'GET /api/sync') { const u = await requireUser(req); return sendJson(req, res, 200, await sync.get(u.id)); }
    if (route === 'POST /api/sync') {
      const u = await requireUser(req);
      const raw = (await readBody(req, cfg.maxSyncBytes)).toString('utf8');
      let b; try { b = JSON.parse(raw); } catch { throw new HttpError(400, 'That did not look right.'); }
      return sendJson(req, res, 200, await sync.merge(u.id, b && b.data));
    }

    if (route === 'POST /api/mark') {
      const u = await requireUser(req);
      if (!isPlus(u)) throw new HttpError(402, `Feedback on your writing is part of ${cfg.planName}.`, 'plus_required');
      if (!marker.available) throw new HttpError(503, 'Marking is not switched on yet. You can use Copy instead.');
      // She sends which task, which level and her answer. The task itself comes from our own copy of the lesson.
      const body = z.object({ mission: z.string().min(1).max(100), level: z.enum(['L1', 'L2']), answer: z.string().trim().min(1).max(6000) }).strict().safeParse(await jsonBody(req));
      if (!body.success) throw new HttpError(400, 'Something was missing or too long. Please check your answer and try again.');
      const task = taskRequest(content, body.data.mission, body.data.level, body.data.answer);
      if (!task || (content.mission('writing', body.data.mission).status === 'draft' && !isAdmin(u))) throw new HttpError(404, 'We could not find that task. Feedback is only available on our own tasks; use Copy for your own.');
      const parsed = MarkRequest.safeParse(task);
      if (!parsed.success) throw new HttpError(400, 'Something was missing or too long. Please check your answer and try again.');
      if (!limiter.allow('mark:' + u.id, cfg.marksPerUserPerHour, 3600_000)) throw new HttpError(429, 'That is a lot of marking in one hour. Please wait a little, or use Copy.');
      const dayKeyName = 'global:marks:' + dayKey(); const monthKeyName = `marks:${u.id}:${monthKey()}`;
      if ((await store.incr(dayKeyName)) > cfg.marksDailyCap) { await store.incr(dayKeyName, -1); throw new HttpError(429, 'Marking has reached its limit for today. Please try again tomorrow, or use Copy.', 'daily_cap'); }
      const used = await store.incr(monthKeyName);
      const refund = async () => { await store.incr(dayKeyName, -1); await store.incr(monthKeyName, -1); };
      if (used > cfg.quotaMonthlyMarks) { await refund(); throw new HttpError(429, `You have used all ${cfg.quotaMonthlyMarks} feedbacks for this month. They come back next month, or use Copy to send your writing anywhere you like.`, 'quota'); }
      let result;
      try { result = await marker.mark(parsed.data); } catch (e) { await refund(); throw e; }
      if (!result.ok) { await refund(); return sendJson(req, res, 200, { ok: false, reason: result.reason }); }
      log('marked', { provider: marker.kind, in: result.usage?.in, out: result.usage?.out });
      return sendJson(req, res, 200, { ok: true, feedback: result.feedback, quota: { used, limit: cfg.quotaMonthlyMarks } });
    }

    if (route === 'GET /api/admin/diagnostics') {
      const u = await requireUser(req);
      if (!isAdmin(u)) throw new HttpError(404, 'Not found.');
      // For checking a new deployment: is the visitor's real address being read correctly?
      return sendJson(req, res, 200, { ok: true, yourAddressAsSeen: ip, xForwardedFor: req.headers['x-forwarded-for'] || null, trustProxy: cfg.trustProxy, trustedProxyHops: cfg.trustedProxyHops, sessionCookie: auth.cookieName, baseUrl: cfg.baseUrl, store: store.kind, marking: marker.kind, payments: billing.enabled, stripeApiVersion: cfg.stripeApiVersion });
    }

    if (route === 'POST /api/family/invite') { const u = await requireUser(req); return sendJson(req, res, 200, await family.invite(u)); }
    if (route === 'POST /api/family/accept') { const u = await requireUser(req); const b = await jsonBody(req); return sendJson(req, res, 200, await family.accept(u, b.code)); }
    if (route === 'GET /api/family') { const u = await requireUser(req); return sendJson(req, res, 200, await family.list(u)); }
    if (seg[1] === 'family' && seg[2] && seg.length === 3 && req.method === 'PATCH') { const u = await requireUser(req); const b = await jsonBody(req); return sendJson(req, res, 200, await family.setShareWriting(u, seg[2], b.shareWriting)); }
    if (seg[1] === 'family' && seg[2] && seg.length === 3 && req.method === 'DELETE') { const u = await requireUser(req); return sendJson(req, res, 200, await family.remove(u, seg[2])); }
    if (seg[1] === 'family' && seg[2] && seg[3] === 'summary' && req.method === 'GET') { const u = await requireUser(req); return sendJson(req, res, 200, await family.summary(u, seg[2])); }

    if (route === 'GET /api/me/export') {
      const u = await requireUser(req);
      const s = await store.getSync(u.id);
      const asLearner = await store.listLinks('learner', u.id); const asParent = await store.listLinks('parent', u.id);
      const body = { exportedAt: new Date().toISOString(), account: { email: u.email, createdAt: u.createdAt, plan: planSummary(u) },
        markingUsageThisMonth: (await quotaFor(u)).used, progress: s ? s.data : {},
        sharing: { sharedWith: asLearner.length, linkedAsParent: asParent.length } };
      return sendJson(req, res, 200, body, { 'Content-Disposition': 'attachment; filename="my-data.json"' });
    }
    if (route === 'DELETE /api/me') {
      const u = await requireUser(req); const b = await jsonBody(req);
      if (b.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
      await billing.cancelSubscription(u);
      await store.deleteLinksFor(u.id); await store.deleteUser(u.id);
      return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
    }

    throw new HttpError(404, 'Not found.');
  }

  // ---------- the website ----------
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Use GET.');
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    if (p === '/privacy') p = '/privacy.html'; if (p === '/terms') p = '/terms.html';
    const full = path.normalize(path.join(webDir, p));
    if (!full.startsWith(webDir + path.sep) && full !== webDir) throw new HttpError(404, 'Not found.');
    const ext = path.extname(full).toLowerCase();
    if (!MIME[ext] || !fs.existsSync(full) || !fs.statSync(full).isFile()) throw new HttpError(404, 'Not found.');
    const body = fs.readFileSync(full);
    res.writeHead(200, baseHeaders({ 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' }));
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const handler = async function handler(req, res) {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const ip = clientIp(req);
    let status = 500;
    try {
      if (!limiter.allow('ip:' + ip, cfg.apiPerIpPerMinute, 60_000)) throw new HttpError(429, 'Too many requests. Please slow down a little.');
      if (url.pathname.startsWith('/api/')) {
        const origWrite = res.writeHead.bind(res);
        res.writeHead = (s, ...rest) => { status = s; return origWrite(s, ...rest); };
        return await api(req, res, url, ip);
      }
      serveStatic(req, res, url); status = 200;
    } catch (e) {
      status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) log('unexpected error', { type: e?.constructor?.name });
      if (res.headersSent) return res.end();
      if (url.pathname.startsWith('/api/')) return sendJson(req, res, status, { ok: false, error: e instanceof HttpError ? e.message : 'Something went wrong.', ...(e.code ? { code: e.code } : {}) });
      res.writeHead(status, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })); return res.end(status === 404 ? 'Not found.' : 'Something went wrong.');
    } finally {
      // Only the method, path, status and time are logged. Never writing, emails or tokens.
      log('request', { method: req.method, path: url.pathname.replace(/\/[0-9a-f]{32}/g, '/:id'), status, ms: Date.now() - started });
    }
  };

  return { handler, store, mailer, content, marker, billing, close: () => store.close() };
}

// ---------- start up ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig();
  const problems = checkConfig(cfg);
  if (problems.length) { console.error('Not starting:\n- ' + problems.join('\n- ')); process.exit(1); }
  const app = await createApp(cfg);
  const server = http.createServer(app.handler);
  server.listen(cfg.port, '0.0.0.0', () => console.log(JSON.stringify({ msg: 'listening', port: cfg.port, store: app.store.kind, mailer: app.mailer.kind, marking: app.marker.kind, payments: app.billing.enabled, dev: cfg.devMode })));
  setInterval(() => app.store.purgeTokens && app.store.purgeTokens().catch(() => {}), 3600_000).unref();
  process.on('SIGTERM', () => server.close(() => app.close().then(() => process.exit(0))));
}
