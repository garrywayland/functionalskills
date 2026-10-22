import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn } from './helpers.mjs';

test('health and security headers', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const r = await c.get('/api/health');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  await ctx.close();
});

test('sign in by email link, once only', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const r = await c.post('/api/auth/request', { email: '  Learner@Example.COM ' });
  assert.equal(r.status, 200);
  assert.equal(ctx.app.mailer.sent.length, 1);
  assert.equal(ctx.app.mailer.sent[0].to, 'learner@example.com');
  const token = r.json.devLink.split('/signin/')[1];
  assert.equal((await c.get('/api/me')).json.signedIn, false);
  const v = await c.post('/api/auth/verify', { token });
  assert.equal(v.status, 200); assert.equal(v.json.created, true);
  const set = v.headers.get('set-cookie');
  assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Lax/);
  const me = (await c.get('/api/me')).json;
  assert.equal(me.signedIn, true); assert.equal(me.user.email, 'learner@example.com'); assert.equal(me.plan.tier, 'free');
  const again = await client(ctx.base).post('/api/auth/verify', { token });
  assert.equal(again.status, 400, 'a link cannot be used twice');
  await ctx.close();
});

test('a second sign-in finds the same account', async () => {
  const ctx = await startApp();
  const a = await signIn(ctx, 'same@example.com'); const b = await signIn(ctx, 'SAME@example.com');
  assert.equal(ctx.app.store.users.size, 1);
  assert.equal(a.me.user.email, b.me.user.email);
  await ctx.close();
});

test('the sign-in link is only shown on screen in development mode', async () => {
  const ctx = await startApp({ DEV_MODE: '0' }); const c = client(ctx.base);
  const r = await c.post('/api/auth/request', { email: 'a@example.com' });
  assert.equal(r.status, 200); assert.equal(r.json.devLink, undefined);
  assert.equal(ctx.app.mailer.sent.length, 1);
  await ctx.close();
});

test('bad emails, expired and made-up tokens are refused plainly', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  for (const e of ['', 'nope', 'a@b', 'x'.repeat(300) + '@example.com', '<script>@x.com']) assert.equal((await c.post('/api/auth/request', { email: e })).status, 400, e);
  assert.equal((await c.post('/api/auth/verify', { token: 'x'.repeat(43) })).status, 400);
  assert.equal((await c.post('/api/auth/verify', { token: 'short' })).status, 400);
  const r = await c.post('/api/auth/request', { email: 'late@example.com' });
  const token = r.json.devLink.split('/signin/')[1];
  for (const rec of ctx.app.store.tokens.values()) rec.exp = Date.now() - 1000;
  const v = await c.post('/api/auth/verify', { token });
  assert.equal(v.status, 400); assert.match(v.json.error, /expired|used/);
  await ctx.close();
});

test('sign-in emails are rate limited per address', async () => {
  const ctx = await startApp({ AUTH_PER_EMAIL_PER_HOUR: '2' }); const c = client(ctx.base);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' })).status, 200);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' })).status, 200);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' })).status, 429);
  assert.equal((await c.post('/api/auth/request', { email: 'b@example.com' })).status, 200);
  await ctx.close();
});

test('state-changing calls need the site header and a same-site origin', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' }, { noHeader: true })).status, 403);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await c.post('/api/auth/request', { email: 'a@example.com' }, { headers: { Origin: ctx.base } })).status, 200);
  assert.equal((await c.call('POST', '/api/auth/request', 'email=a@example.com', { raw: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  await ctx.close();
});

test('a tampered or foreign cookie is just "signed out"', async () => {
  const ctx = await startApp();
  const a = await signIn(ctx, 'a@example.com');
  const name = Object.keys(a.jar)[0];
  const good = a.jar[name];
  const [payload, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'someone-else', v: 1, e: Date.now() + 1e9 })).toString('base64url') + '.' + sig;
  const c = client(ctx.base); c.jar[name] = forged;
  assert.equal((await c.get('/api/me')).json.signedIn, false);
  c.jar[name] = payload + '.AAAA';
  assert.equal((await c.get('/api/me')).json.signedIn, false);
  await ctx.close();
});

test('sign out, and sign out everywhere', async () => {
  const ctx = await startApp();
  const a = await signIn(ctx, 'a@example.com'); const b = await signIn(ctx, 'a@example.com');
  assert.equal((await a.post('/api/auth/logout')).status, 200);
  assert.equal((await a.get('/api/me')).json.signedIn, false);
  assert.equal((await b.get('/api/me')).json.signedIn, true, 'logging out one device leaves the other');
  assert.equal((await b.post('/api/auth/logout-all')).status, 200);
  const stale = client(ctx.base); stale.jar[Object.keys(b.jar)[0] || 'ns'] = 'x';
  const c = await signIn(ctx, 'a@example.com');
  assert.equal((await c.get('/api/me')).json.signedIn, true, 'a new sign-in works after sign out everywhere');
  await ctx.close();
});

test('the email is never written to the log', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  await c.post('/api/auth/request', { email: 'secret.person@example.com' });
  assert.ok(!ctx.logs.join('\n').includes('secret.person'));
  await ctx.close();
});

test('the website is served, and nothing outside it', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const home = await c.get('/'); assert.equal(home.status, 200); assert.match(home.text, /<title>/);
  for (const bad of ['/../package.json', '/..%2f..%2fpackage.json', '/js/../../server/index.js', '/server/index.js', '/js/app.js.map', '/.env']) {
    const r = await c.get(bad); assert.ok([404, 400].includes(r.status), bad + ' -> ' + r.status);
  }
  assert.equal((await c.get('/api/nope')).status, 404);
  await ctx.close();
});

test('a sign-in link can be looked at without using it up, and says whose account it is for', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const r = await c.post('/api/auth/request', { email: 'ga.rry@example.com' });
  const token = r.json.devLink.split('/signin/')[1];
  const p1 = await c.post('/api/auth/peek', { token }); assert.equal(p1.status, 200); assert.equal(p1.json.email, 'ga***@example.com');
  assert.ok(!p1.text.includes('ga.rry'), 'the full address is never sent');
  const p2 = await c.post('/api/auth/peek', { token }); assert.equal(p2.status, 200, 'looking twice does not use it up');
  assert.equal((await c.get('/api/me')).json.signedIn, false, 'and looking does not sign anyone in');
  assert.equal((await c.post('/api/auth/verify', { token })).status, 200);
  assert.equal((await c.post('/api/auth/peek', { token })).status, 400, 'once used, it is gone');
  assert.equal((await c.post('/api/auth/peek', { token: 'x'.repeat(43) })).status, 400);
  assert.equal((await c.post('/api/auth/peek', { token: 'short' })).status, 400);
  assert.equal((await c.post('/api/auth/peek', { token }, { noHeader: true })).status, 403);
  await ctx.close();
});

test('the account details include an id the page can use to tell whose work is on a device', async () => {
  const ctx = await startApp(); const a = await signIn(ctx, 'a@example.com'); const b = await signIn(ctx, 'b@example.com');
  const ia = (await a.get('/api/me')).json.user.id; const ib = (await b.get('/api/me')).json.user.id;
  assert.match(ia, /^[0-9a-f]{32}$/); assert.notEqual(ia, ib);
  assert.equal((await client(ctx.base).get('/api/me')).json.user, undefined);
  await ctx.close();
});

test('the cookie name can be set (it has to be __session behind Firebase Hosting)', async () => {
  const ctx = await startApp({ SESSION_COOKIE: '__session' }); const a = await signIn(ctx, 'a@example.com');
  assert.deepEqual(Object.keys(a.jar), ['__session']);
  assert.equal((await a.get('/api/me')).json.signedIn, true);
  await ctx.close();
});

test('behind Google\'s proxies the visitor address is counted in from the right, and only an admin can look at it', async () => {
  const ctx = await startApp({ TRUST_PROXY: '1', TRUSTED_PROXY_HOPS: '2', ADMIN_EMAILS: 'boss@example.com' });
  const boss = await signIn(ctx, 'boss@example.com'); const other = await signIn(ctx, 'other@example.com');
  assert.equal((await other.get('/api/admin/diagnostics')).status, 404, 'a learner gets "not found"');
  assert.equal((await client(ctx.base).get('/api/admin/diagnostics')).status, 401);
  const d = await boss.get('/api/admin/diagnostics', { headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9, 130.211.0.1' } });
  assert.equal(d.json.yourAddressAsSeen, '203.0.113.9', 'two hops in from the right, so a forged address on the left is ignored');
  assert.equal(d.json.trustedProxyHops, 2); assert.equal(d.json.sessionCookie, 'ns');
  await ctx.close();
  const ctx2 = await startApp({ TRUST_PROXY: '1', ADMIN_EMAILS: 'boss@example.com' }); const b2 = await signIn(ctx2, 'boss@example.com');
  const d2 = await b2.get('/api/admin/diagnostics', { headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9' } });
  assert.equal(d2.json.yourAddressAsSeen, '203.0.113.9', 'straight to Cloud Run it is the last address');
  await ctx2.close();
});
