import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn, fakeServer, stripeSignature, stripeEvent, STRIPE_SECRET } from './helpers.mjs';
import { verifyStripeSignature } from '../server/billing.js';

async function withStripe(env = {}) {
  const fake = await fakeServer((req, res, body) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.includes('checkout/sessions')) return res.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/pay/cs_1' }));
    if (req.url.includes('billing_portal')) return res.end(JSON.stringify({ url: 'https://billing.stripe.test/p/1' }));
    return res.end(JSON.stringify({ id: 'sub_1', status: 'canceled' }));
  });
  const ctx = await startApp({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_BASE_URL: fake.url, STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_PASS: 'price_p', PASS_DAYS: '90', ...env });
  const close = ctx.close; ctx.close = async () => { await close(); await fake.close(); };
  return { ctx, fake };
}
const post = async (c, event, sig) => c.call('POST', '/api/stripe/webhook', event, { raw: true, noHeader: true, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig ?? stripeSignature(event) } });

test('signature check: right secret, wrong secret, stale, tampered, rotated', () => {
  const raw = '{"id":"e"}'; const now = Date.now();
  assert.equal(verifyStripeSignature(raw, stripeSignature(raw), STRIPE_SECRET, now), true);
  assert.equal(verifyStripeSignature(raw, stripeSignature(raw, 'other'), STRIPE_SECRET, now), false);
  assert.equal(verifyStripeSignature(raw, stripeSignature(raw, STRIPE_SECRET, Math.floor(now / 1000) - 3600), STRIPE_SECRET, now), false);
  assert.equal(verifyStripeSignature(raw + ' ', stripeSignature(raw), STRIPE_SECRET, now), false);
  assert.equal(verifyStripeSignature(raw, '', STRIPE_SECRET, now), false);
  const good = stripeSignature(raw);
  assert.equal(verifyStripeSignature(raw, good + ',v1=deadbeef', STRIPE_SECRET, now), true, 'any one of several signatures may match');
});

test('payments are off until Stripe is set up, and the page can tell', async () => {
  const ctx = await startApp(); const a = await signIn(ctx, 'a@example.com');
  assert.equal((await a.get('/api/me')).json.features.payments, false);
  assert.equal((await a.post('/api/billing/checkout', { plan: 'monthly' })).status, 503);
  assert.deepEqual((await a.get('/api/billing/plans')).json.plans, []);
  await ctx.close();
});

test('checkout sends the learner to Stripe with their id, never card details', async () => {
  const { ctx, fake } = await withStripe({ PRICE_MONTHLY_LABEL: '£6.99 a month' });
  const a = await signIn(ctx, 'pay@example.com');
  assert.equal((await client(ctx.base).post('/api/billing/checkout', { plan: 'monthly' })).status, 401);
  const r = await a.post('/api/billing/checkout', { plan: 'monthly' });
  assert.equal(r.status, 200); assert.match(r.json.url, /checkout\.stripe\.test/);
  const form = new URLSearchParams(fake.calls.at(-1).body);
  assert.equal(form.get('mode'), 'subscription'); assert.equal(form.get('line_items[0][price]'), 'price_m');
  assert.equal(form.get('customer_email'), 'pay@example.com'); assert.ok(form.get('client_reference_id'));
  assert.equal(fake.calls.at(-1).headers.authorization, 'Bearer sk_test_x');
  assert.equal((await a.post('/api/billing/checkout', { plan: 'pass' })).status, 200);
  assert.equal(new URLSearchParams(fake.calls.at(-1).body).get('mode'), 'payment');
  assert.equal((await a.post('/api/billing/checkout', { plan: 'gold' })).status, 400);
  const plans = (await a.get('/api/billing/plans')).json; assert.equal(plans.enabled, true); assert.equal(plans.plans[0].label, '£6.99 a month');
  assert.equal((await a.post('/api/billing/portal')).status, 400, 'no customer yet');
  await ctx.close();
});

test('webhook: bad or missing signature is refused and changes nothing', async () => {
  const { ctx } = await withStripe(); const a = await signIn(ctx, 'a@example.com'); const u = await ctx.app.store.getUserByEmail('a@example.com');
  const c = client(ctx.base);
  const ev = stripeEvent('checkout.session.completed', { mode: 'payment', payment_status: 'paid', client_reference_id: u.id, metadata: { plan: 'pass' }, customer: 'cus_1' });
  assert.equal((await post(c, ev, 't=1,v1=bad')).status, 400);
  assert.equal((await post(c, ev, stripeSignature(ev, 'wrong'))).status, 400);
  assert.equal((await post(c, ev, '')).status, 400);
  assert.equal((await a.get('/api/me')).json.plan.tier, 'free');
  await ctx.close();
});

test('a one-off pass gives 90 days, repeated delivery does nothing, a second pass stacks', async () => {
  const { ctx } = await withStripe(); const a = await signIn(ctx, 'a@example.com'); const u = await ctx.app.store.getUserByEmail('a@example.com');
  const c = client(ctx.base);
  const ev = stripeEvent('checkout.session.completed', { mode: 'payment', payment_status: 'paid', client_reference_id: u.id, customer: 'cus_1' }, 'evt_one');
  assert.equal((await post(c, ev)).status, 200);
  const me = (await a.get('/api/me')).json; assert.equal(me.plan.tier, 'plus'); assert.equal(me.plan.source, 'stripe-pass');
  const days = (Date.parse(me.plan.until) - Date.now()) / 86400_000; assert.ok(days > 89 && days <= 90);
  assert.equal((await post(c, ev)).json.duplicate, true);
  assert.equal((await a.get('/api/me')).json.plan.until, me.plan.until, 'a repeat changes nothing');
  await post(c, stripeEvent('checkout.session.completed', { mode: 'payment', payment_status: 'paid', client_reference_id: u.id }, 'evt_two'));
  const d2 = (Date.parse((await a.get('/api/me')).json.plan.until) - Date.now()) / 86400_000; assert.ok(d2 > 179);
  await ctx.close();
});

test('an unpaid checkout grants nothing', async () => {
  const { ctx } = await withStripe(); const a = await signIn(ctx, 'a@example.com'); const u = await ctx.app.store.getUserByEmail('a@example.com');
  await post(client(ctx.base), stripeEvent('checkout.session.completed', { mode: 'payment', payment_status: 'unpaid', client_reference_id: u.id }));
  assert.equal((await a.get('/api/me')).json.plan.tier, 'free');
  await ctx.close();
});

test('subscription lifecycle: starts, renews, fails to pay, cancels', async () => {
  const { ctx } = await withStripe({ GRACE_DAYS: '3' }); const a = await signIn(ctx, 'sub@example.com'); const u = await ctx.app.store.getUserByEmail('sub@example.com');
  const c = client(ctx.base);
  await post(c, stripeEvent('checkout.session.completed', { mode: 'subscription', payment_status: 'paid', client_reference_id: u.id, customer: 'cus_9', subscription: 'sub_9' }));
  let me = (await a.get('/api/me')).json; assert.equal(me.plan.tier, 'plus'); assert.equal(me.canManageBilling, true);
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  await post(c, stripeEvent('customer.subscription.updated', { id: 'sub_9', customer: 'cus_9', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false, metadata: { uid: u.id } }));
  me = (await a.get('/api/me')).json; assert.equal(me.plan.renews, true);
  assert.equal(Date.parse(me.plan.until), periodEnd * 1000 + 3 * 86400_000, 'paid to the end of the period plus a short grace');
  await post(c, stripeEvent('invoice.payment_failed', { customer: 'cus_9', subscription: 'sub_9' }));
  assert.equal((await a.get('/api/me')).json.plan.status, 'past_due'); assert.equal((await a.get('/api/me')).json.plan.tier, 'plus', 'still has access during the grace period');
  await post(c, stripeEvent('customer.subscription.updated', { id: 'sub_9', customer: 'cus_9', status: 'active', current_period_end: periodEnd, cancel_at_period_end: true }));
  assert.equal((await a.get('/api/me')).json.plan.renews, false, 'cancelling at the end of the period stops renewal but keeps access');
  assert.equal((await a.get('/api/me')).json.plan.tier, 'plus');
  await post(c, stripeEvent('customer.subscription.deleted', { id: 'sub_9', customer: 'cus_9', status: 'canceled' }));
  assert.equal((await a.get('/api/me')).json.plan.tier, 'free');
  await ctx.close();
});

test('the billing portal link is available once there is a customer', async () => {
  const { ctx } = await withStripe(); const a = await signIn(ctx, 'a@example.com'); const u = await ctx.app.store.getUserByEmail('a@example.com');
  await ctx.app.store.updateUser(u.id, { stripeCustomerId: 'cus_5' });
  const r = await a.post('/api/billing/portal'); assert.equal(r.status, 200); assert.match(r.json.url, /billing\.stripe\.test/);
  await ctx.close();
});
