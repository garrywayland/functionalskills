import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn, makePlus, fakeServer } from './helpers.mjs';

test('export gives her everything we hold', async () => {
  const ctx = await startApp(); const a = await signIn(ctx, 'a@example.com');
  await a.post('/api/sync', { data: { 'writing:w1:L1': { draft: 'my words', t: 1 }, done: { L1: { r1: true } } } });
  const r = await a.get('/api/me/export');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.json.account.email, 'a@example.com'); assert.equal(r.json.progress['writing:w1:L1'].draft, 'my words');
  assert.equal((await client(ctx.base).get('/api/me/export')).status, 401);
  await ctx.close();
});

test('deleting an account removes the account, progress and sessions, and cancels a subscription', async () => {
  const fake = await fakeServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
  const ctx = await startApp({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_BASE_URL: fake.url });
  const a = await signIn(ctx, 'a@example.com'); const u = await ctx.app.store.getUserByEmail('a@example.com');
  await ctx.app.store.updateUser(u.id, { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
  await a.post('/api/sync', { data: { 'writing:w1:L1': { draft: 'x', t: 1 } } });
  assert.equal((await a.del('/api/me', {})).status, 400, 'needs the word DELETE');
  assert.equal((await a.del('/api/me', { confirm: 'delete' })).status, 400);
  assert.equal((await a.del('/api/me', { confirm: 'DELETE' })).status, 200);
  assert.ok(fake.calls.some((c) => c.method === 'DELETE' && c.url.includes('/v1/subscriptions/sub_1')), 'the subscription was cancelled');
  assert.equal(await ctx.app.store.getUserByEmail('a@example.com'), null);
  assert.equal(await ctx.app.store.getSync(u.id), null);
  assert.equal((await a.get('/api/me')).json.signedIn, false);
  const again = await signIn(ctx, 'a@example.com');
  assert.deepEqual((await again.get('/api/sync')).json.data, {}, 'a new account with the same email starts empty');
  await ctx.close(); await fake.close();
});

test('the account page data: plan, allowance and what is switched on', async () => {
  const ctx = await startApp({ QUOTA_MONTHLY_MARKS: '12' }); const a = await signIn(ctx, 'a@example.com'); await makePlus(ctx, 'a@example.com', 10);
  const me = (await a.get('/api/me')).json;
  assert.equal(me.plan.tier, 'plus'); assert.deepEqual(me.quota, { used: 0, limit: 12 }); assert.equal(me.features.marking, true); assert.equal(me.brand, 'Next Stop'); assert.equal(me.planName, 'Plus');
  assert.equal(me.admin, false);
  const anon = (await client(ctx.base).get('/api/me')).json; assert.equal(anon.signedIn, false); assert.equal(anon.features.marking, true);
  await ctx.close();
});
