import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlus, partsOf, withPart, extend, revoke, planSummary } from '../server/entitlements.js';

const day = 86400_000; const now = Date.parse('2026-10-22T12:00:00Z');
const at = (d) => new Date(now + d * day).toISOString();

test('until is the latest of the parts, and parts are independent', () => {
  let p = withPart(null, 'pass', at(10), { source: 'stripe-pass' });
  p = withPart(p, 'sub', at(30), { source: 'stripe' });
  assert.equal(p.until, at(30));
  p = withPart(p, 'sub', at(0));                     // subscription ends: the pass still has 10 days
  assert.equal(p.until, at(10));
  assert.equal(isPlus({ plan: p }, now), true); assert.equal(isPlus({ plan: p }, now + 11 * day), false);
});

test('a gift of time stacks on what is left and survives subscription changes', () => {
  const user = { plan: withPart(null, 'sub', at(20), { source: 'stripe', status: 'active' }) };
  const gifted = extend(user, 30, 'code', {}, now);
  assert.equal(gifted.until, at(50));
  const later = withPart(gifted, 'sub', at(25));      // a renewal arrives
  assert.equal(later.until, at(50), 'the gift is not overwritten by the subscription');
  assert.equal(extend({ plan: null }, 10, 'admin', {}, now).until, at(10), 'with nothing left it starts from now');
});

test('plans saved before parts existed still work', () => {
  const old = { until: at(5), source: 'admin', status: 'active' };
  assert.deepEqual(partsOf(old), { legacy: at(5) });
  assert.equal(withPart(old, 'sub', at(2)).until, at(5));
  assert.equal(isPlus({ plan: old }, now), true);
  assert.deepEqual(partsOf(null), {});
});

test('revoking ends everything at once and says so', () => {
  const p = withPart(withPart(null, 'pass', at(40)), 'sub', at(40));
  const r = revoke(p, now);
  assert.equal(isPlus({ plan: r }, now + 1), false); assert.equal(r.status, 'revoked');
  assert.equal(planSummary({ plan: r }, now + 1).tier, 'free');
});
