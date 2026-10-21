// Who has the paid plan. The plan is stored on the user as { until, source, status }.
// Access lasts until `until` (a date), so a cancelled subscription simply runs out; nothing needs "switching off".
export function isPlus(user, now = Date.now()) {
  return Boolean(user && user.plan && user.plan.until && Date.parse(user.plan.until) > now);
}

export function planSummary(user, now = Date.now()) {
  if (!isPlus(user, now)) return { tier: 'free', until: user && user.plan ? user.plan.until || null : null, source: null, status: user && user.plan ? user.plan.status || null : null };
  return { tier: 'plus', until: user.plan.until, source: user.plan.source || null, status: user.plan.status || 'active', renews: Boolean(user.plan.renews) };
}

// Adds days to whatever is left, so paying early or redeeming a code never loses time.
export function extend(user, days, source, extra = {}, now = Date.now()) {
  const current = isPlus(user, now) ? Date.parse(user.plan.until) : now;
  const until = new Date(current + days * 86400_000).toISOString();
  return { ...(user.plan || {}), until, source, status: 'active', ...extra };
}
