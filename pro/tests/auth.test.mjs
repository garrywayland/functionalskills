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
