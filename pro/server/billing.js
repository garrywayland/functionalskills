// Payments with Stripe, using Stripe's own hosted pages, so card details never touch this server.
//  - Checkout: we create a Checkout Session and send the learner to Stripe.
//  - Webhook: Stripe tells us when a payment worked or a subscription changed. We check the signature.
//  - Access is stored as an end date on the user, so a lapsed plan simply runs out.
import crypto from 'node:crypto';
import { HttpError, safeEqual } from './util.js';
import { withPart, partsOf, isPlus } from './entitlements.js';

export function verifyStripeSignature(rawBody, header, secret, now = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  // Stripe may send several v1 values (while a secret is being rotated); any one matching is fine.
  const given = String(header).split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  return given.some((g) => safeEqual(g, expected));
}

// Stripe moved the subscription's period end in the 2025-03-31 ("basil") API: it used to be on the subscription,
// now it is on each item. The messages we receive follow the API version of the webhook, so read either shape.
export function periodEndMs(sub) {
  const ends = ((sub && sub.items && sub.items.data) || []).map((i) => i && i.current_period_end).filter(Number.isFinite);
  const end = ends.length ? Math.max(...ends) : sub && sub.current_period_end;
  return Number.isFinite(end) ? end * 1000 : null;
}

// The subscription an invoice belongs to (also moved in the basil API), and the end of the period it paid for.
export function invoiceSubscription(inv) {
  return (inv && (inv.subscription || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription))) || null;
}
export function invoicePeriodEndMs(inv) {
  const ends = ((inv && inv.lines && inv.lines.data) || []).map((l) => l && l.period && l.period.end).filter(Number.isFinite);
  return ends.length ? Math.max(...ends) * 1000 : null;
}
const invoiceUid = (inv) => (inv && inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.metadata && inv.parent.subscription_details.metadata.uid)
  || (inv && inv.subscription_details && inv.subscription_details.metadata && inv.subscription_details.metadata.uid) || null;

export function makeBilling({ cfg, store, log }) {
  const enabled = Boolean(cfg.stripeKey);

  async function stripe(method, pathname, form) {
    const res = await fetch(cfg.stripeBase + pathname, {
      method,
      headers: { Authorization: 'Bearer ' + cfg.stripeKey, 'Stripe-Version': cfg.stripeApiVersion, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { log('stripe error', { status: res.status, path: pathname, type: json?.error?.type }); throw new HttpError(502, 'Payments are not available just now. Please try again in a minute.'); }
    return json;
  }

  return {
    enabled,

    plans() {
      return {
        enabled,
        plans: [
          cfg.priceMonthly && { id: 'monthly', label: cfg.priceMonthlyLabel || 'Monthly', renews: true },
          cfg.pricePass && { id: 'pass', label: cfg.pricePassLabel || `${cfg.passDays}-day pass`, renews: false, days: cfg.passDays },
        ].filter(Boolean),
      };
    },

    async checkout(user, plan) {
      if (!enabled) throw new HttpError(503, 'Payments are not switched on yet.');
      const price = plan === 'monthly' ? cfg.priceMonthly : plan === 'pass' ? cfg.pricePass : null;
      if (!price) throw new HttpError(400, 'That plan is not available.');
      const sub = partsOf(user.plan).sub;
      if (plan === 'monthly' && user.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(user.plan && user.plan.status) && sub && Date.parse(sub) > Date.now()) {
        throw new HttpError(409, 'You already have a monthly plan. You can change or cancel it from your account.', 'already_subscribed');
      }
      const form = {
        mode: plan === 'monthly' ? 'subscription' : 'payment',
        'line_items[0][price]': price, 'line_items[0][quantity]': '1',
        success_url: `${cfg.baseUrl}/?paid=1#/account`, cancel_url: `${cfg.baseUrl}/#/plans`,
        client_reference_id: user.id, 'metadata[uid]': user.id, 'metadata[plan]': plan,
        allow_promotion_codes: 'true',
      };
      if (user.stripeCustomerId) form.customer = user.stripeCustomerId; else form.customer_email = user.email;
      if (plan === 'monthly') form['subscription_data[metadata][uid]'] = user.id;
      const s = await stripe('POST', '/v1/checkout/sessions', form);
      if (!s.url) throw new HttpError(502, 'Payments are not available just now.');
      return { url: s.url };
    },

    async portal(user) {
      if (!enabled) throw new HttpError(503, 'Payments are not switched on yet.');
      if (!user.stripeCustomerId) throw new HttpError(400, 'There is no subscription to manage yet.');
      const s = await stripe('POST', '/v1/billing_portal/sessions', { customer: user.stripeCustomerId, return_url: `${cfg.baseUrl}/#/account` });
      return { url: s.url };
    },

    async cancelSubscription(user) {
      if (!enabled || !user.stripeSubscriptionId) return;
      try { await stripe('DELETE', '/v1/subscriptions/' + encodeURIComponent(user.stripeSubscriptionId)); } catch { /* the account is still deleted */ }
    },

    // Called with the raw request body and the Stripe-Signature header.
    async webhook(rawBody, signature, now = Date.now()) {
      if (!verifyStripeSignature(rawBody, signature, cfg.stripeWebhookSecret, now)) throw new HttpError(400, 'Bad signature.');
      let event;
      try { event = JSON.parse(rawBody); } catch { throw new HttpError(400, 'Bad payload.'); }
      if (!event || !event.id || !event.type) throw new HttpError(400, 'Bad payload.');
      if (!(await store.firstTimeEvent(event.id))) return { duplicate: true };
      const obj = event.data && event.data.object ? event.data.object : {};

      async function userFor(uid, customer) {
        if (uid) { const u = await store.getUser(uid); if (u) return u; }
        if (customer) return store.getUserByStripeCustomer(customer);
        return null;
      }

      // Stripe can deliver events out of order. A subscription event older than the last one we applied is ignored.
      const stale = (user) => Number.isFinite(event.created) && Number.isFinite(user.plan && user.plan.subEventAt) && event.created < user.plan.subEventAt;
      const stamp = () => (Number.isFinite(event.created) ? { subEventAt: event.created } : {});
      const iso = (t) => new Date(t).toISOString();
      const grace = cfg.graceDays * 86400_000;

      if (event.type === 'checkout.session.completed') {
        const user = await userFor(obj.client_reference_id || obj.metadata?.uid, obj.customer);
        if (!user) { log('webhook: no user for checkout'); return { ignored: true }; }
        if (obj.payment_status && obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return { ignored: true };
        const patch = { stripeCustomerId: obj.customer || user.stripeCustomerId };
        if (obj.mode === 'subscription') {
          patch.stripeSubscriptionId = obj.subscription || user.stripeSubscriptionId;
          // The subscription and invoice events that follow carry the real renewal date; this covers the gap.
          patch.plan = withPart(user.plan, 'sub', iso(now + 35 * 86400_000), { source: 'stripe', status: 'active', renews: true });
        } else {
          const passFrom = Math.max(now, Date.parse(partsOf(user.plan).pass) || 0);
          patch.plan = withPart(user.plan, 'pass', iso(passFrom + cfg.passDays * 86400_000), { source: 'stripe-pass', status: 'active' });
        }
        await store.updateUser(user.id, patch);
        return { granted: true };
      }

      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const user = await userFor(obj.metadata?.uid, obj.customer);
        if (!user) return { ignored: true };
        if (stale(user)) return { ignored: true, stale: true };
        if (['incomplete', 'paused'].includes(obj.status)) return { ignored: true };
        const live = ['active', 'trialing', 'past_due'].includes(obj.status);
        const end = periodEndMs(obj);
        const subUntil = live ? (end ? end + grace : now + 35 * 86400_000) : now;
        const plan = withPart(user.plan, 'sub', iso(subUntil), { source: 'stripe', status: obj.status, renews: live && !obj.cancel_at_period_end, ...stamp() });
        await store.updateUser(user.id, { plan, stripeCustomerId: obj.customer || user.stripeCustomerId, stripeSubscriptionId: live ? obj.id : null });
        return { updated: true };
      }

      if (event.type === 'customer.subscription.deleted') {
        const user = await userFor(obj.metadata?.uid, obj.customer);
        if (!user) return { ignored: true };
        if (stale(user)) return { ignored: true, stale: true };
        // Stripe sends this when the subscription has really ended (at the end of the paid period, or if cancelled straight away).
        const plan = withPart(user.plan, 'sub', iso(now), { status: 'canceled', renews: false, ...stamp() });
        await store.updateUser(user.id, { plan, stripeSubscriptionId: null });
        return { ended: true };
      }

      // A paid invoice is the clearest "she paid for another period" signal, so renewals are driven by it too.
      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        if (!invoiceSubscription(obj)) return { ignored: true };            // a one-off payment, handled at checkout
        const user = await userFor(invoiceUid(obj), obj.customer);
        if (!user) return { ignored: true };
        const end = invoicePeriodEndMs(obj);
        if (!end) return { ignored: true };
        const current = Date.parse(partsOf(user.plan).sub) || 0;
        const plan = withPart(user.plan, 'sub', iso(Math.max(current, end + grace)), { source: 'stripe', status: 'active', renews: user.plan && user.plan.renews !== false });
        await store.updateUser(user.id, { plan, stripeCustomerId: obj.customer || user.stripeCustomerId });
        return { renewed: true };
      }

      if (event.type === 'invoice.payment_failed') {
        const user = await userFor(invoiceUid(obj), obj.customer);
        if (user && user.plan && isPlus(user, now)) await store.updateUser(user.id, { plan: { ...user.plan, status: 'past_due' } });
        return { flagged: true };
      }
      return { ignored: true };
    },
  };
}
