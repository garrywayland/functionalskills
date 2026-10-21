import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn } from './helpers.mjs';

const rec = (draft, t) => ({ draft, plan: {}, checks: {}, step: 'write', t });

test('sync needs a sign-in and starts empty', async () => {
  const ctx = await startApp();
  assert.equal((await client(ctx.base).get('/api/sync')).status, 401);
  assert.equal((await client(ctx.base).post('/api/sync', { data: {} })).status, 401);
  const a = await signIn(ctx, 'a@example.com');
  const r = await a.get('/api/sync'); assert.equal(r.status, 200); assert.deepEqual(r.json.data, {});
  await ctx.close();
});

test('two devices end up with the same work, nothing lost, newest edit wins', async () => {
  const ctx = await startApp();
  const phone = await signIn(ctx, 'a@example.com'); const laptop = await signIn(ctx, 'a@example.com');
  const p = await phone.post('/api/sync', { data: { 'writing:w1:L1': rec('phone draft', 100), done: { L1: { r1: true } } } });
  assert.equal(p.status, 200);
  const l = await laptop.post('/api/sync', { data: { 'writing:w1:L1': rec('laptop draft, newer', 200), 'reading:r2:L1': { answers: { q1: { choice: 1 } }, pos: 1, t: 50 }, done: { L1: { r2: true } } } });
  assert.equal(l.json.data['writing:w1:L1'].draft, 'laptop draft, newer');
  assert.deepEqual(l.json.data.done, { L1: { r1: true, r2: true } });
  const again = await phone.post('/api/sync', { data: { 'writing:w1:L1': rec('phone draft', 100) } });
  assert.equal(again.json.data['writing:w1:L1'].draft, 'laptop draft, newer', 'an older copy never wins');
  assert.ok(again.json.data['reading:r2:L1'], 'the phone receives what the laptop did');
  await ctx.close();
});

test('only her own work is accepted, and unknown or odd data is dropped', async () => {
  const ctx = await startApp(); const a = await signIn(ctx, 'a@example.com');
  const r = await a.post('/api/sync', { data: { evil: { x: 1 }, 'writing:../x:L1': { draft: 'x' }, 'reading:r1:L1': 'string', level: 'L3', 'learn:a1': { comp: 3 } } });
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.json.data), ['learn:a1']);
  assert.equal((await a.post('/api/sync', { data: [] })).status, 400);
  assert.equal((await a.post('/api/sync', {})).status, 400);
  await ctx.close();
});

test('one learner can never see or change another\'s progress', async () => {
  const ctx = await startApp(); const a = await signIn(ctx, 'a@example.com'); const b = await signIn(ctx, 'b@example.com');
  await a.post('/api/sync', { data: { 'writing:w1:L1': rec('private', 1) } });
  assert.deepEqual((await b.get('/api/sync')).json.data, {});
  await b.post('/api/sync', { data: { 'writing:w1:L1': rec('mine', 9) } });
  assert.equal((await a.get('/api/sync')).json.data['writing:w1:L1'].draft, 'private');
  await ctx.close();
});

test('there is a size limit, and it is explained kindly', async () => {
  const ctx = await startApp({ MAX_SYNC_BYTES: '2000' }); const a = await signIn(ctx, 'a@example.com');
  const r = await a.post('/api/sync', { data: { 'writing:w1:L1': rec('x'.repeat(5000), 1) } });
  assert.equal(r.status, 413); assert.match(r.json.error, /too much|download a copy/i);
  await ctx.close();
});
