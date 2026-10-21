import http from 'node:http';
import crypto from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/index.js';

export const STRIPE_SECRET = 'whsec_test_secret';

export async function startApp(env = {}, deps = {}) {
  const logs = [];
  const cfg = loadConfig({ DEV_MODE: '1', MARKING_PROVIDER: 'fake', STRIPE_WEBHOOK_SECRET: STRIPE_SECRET, ...env });
  const app = await createApp(cfg, { log: (l) => logs.push(l), ...deps });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  cfg.baseUrl = base;
  const close = () => new Promise((r) => { server.closeAllConnections(); server.close(async () => { await app.close(); r(); }); });
  return { app, cfg, base, logs, close, server };
}

// A tiny browser: keeps cookies, sends the header the site sends.
export function client(base) {
  const jar = {};
  async function call(method, path, body, { headers = {}, raw = false, noHeader = false } = {}) {
    const h = { ...headers };
    if (!noHeader && method !== 'GET') h['X-NS'] = '1';
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const name = kv.slice(0, i); const val = kv.slice(i + 1);
      if (/Max-Age=0/i.test(c) || val === '') delete jar[name]; else jar[name] = val;
    }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { jar, get: (p, o) => call('GET', p, undefined, o), post: (p, b, o) => call('POST', p, b ?? {}, o), patch: (p, b) => call('PATCH', p, b), del: (p, b) => call('DELETE', p, b ?? {}), call };
}

// Signs in as an email address and returns a client that has the session cookie.
export async function signIn(ctx, email) {
  const c = client(ctx.base);
  const r = await c.post('/api/auth/request', { email });
  if (r.status !== 200) throw new Error('request failed ' + r.status + ' ' + r.text);
  const token = r.json.devLink.split('/signin/')[1];
  const v = await c.post('/api/auth/verify', { token });
  if (v.status !== 200) throw new Error('verify failed ' + v.status + ' ' + v.text);
  const me = await c.get('/api/me');
  return Object.assign(c, { me: me.json, uid: null });
}

export async function makePlus(ctx, email, days = 30) {
  const u = await ctx.app.store.getUserByEmail(email);
  const until = new Date(Date.now() + days * 86400_000).toISOString();
  await ctx.app.store.updateUser(u.id, { plan: { until, source: 'admin', status: 'active' } });
  return u;
}

export function stripeSignature(raw, secret = STRIPE_SECRET, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function stripeEvent(type, object, id = 'evt_' + crypto.randomBytes(6).toString('hex')) {
  return JSON.stringify({ id, type, data: { object } });
}

export async function fakeServer(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { calls.push({ method: req.method, url: req.url, headers: req.headers, body }); handler(req, res, body, calls); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
