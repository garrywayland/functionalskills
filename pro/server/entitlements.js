// Who has the paid plan.
//
// A plan is { until, source, status, renews, parts }. `parts` keeps each way of having Plus separately
// (a one-off pass, a subscription, time you gave someone), and `until` is the latest of them. Keeping them
// apart means a later subscription update can never wipe out a pass or a gift of time, and the other way round.
// Access lasts until `until`, so a lapsed plan simply runs out; nothing has to be "switched off".
const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);

export function isPlus(user, now = Date.now()) {
  return Boolean(user && user.plan && user.plan.until && Date.parse(user.plan.until) > now);
}

export function partsOf(plan) {
  if (!plan) return {};
  if (plan.parts) return { ...plan.parts };
  return plan.until ? { legacy: plan.until } : {};   // plans saved before parts existed
}

// Sets one part to a date and recomputes `until` as the latest part.
export function withPart(plan, name, iso, extra = {}) {
  const parts = { ...partsOf(plan), [name]: iso };
  const until = new Date(Math.max(0, ...Object.values(parts).map(ms))).toISOString();
  return { ...(plan || {}), ...extra, parts, until };
}

export function planSummary(user, now = Date.now()) {
  const p = user && user.plan;
  if (!isPlus(user, now)) return { tier: 'free', until: p ? p.until || null : null, source: null, status: p ? p.status || null : null };
  return { tier: 'plus', until: p.until, source: p.source || null, status: p.status || 'active', renews: Boolean(p.renews) };
}

// Gives days on top of whatever is left (a promo code, or a grant from you), so nothing is ever lost.
export function extend(user, days, source, extra = {}, now = Date.now()) {
  const base = isPlus(user, now) ? Date.parse(user.plan.until) : now;
  return withPart(user.plan, 'grant', new Date(base + days * 86400_000).toISOString(), { source, status: 'active', ...extra });
}

// Ends all access now (used by the admin tool).
export function revoke(plan, now = Date.now()) {
  const iso = new Date(now).toISOString();
  const parts = Object.fromEntries(Object.keys(partsOf(plan)).map((k) => [k, iso]));
  return { ...(plan || {}), parts, until: iso, status: 'revoked', renews: false };
}
