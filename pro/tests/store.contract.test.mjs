// The same behaviour is required of every data store. Memory and file always run.
// Firestore runs too if FIRESTORE_EMULATOR_HOST is set (see pro/README.md, "Testing the database").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../server/store/memory.js';
import { FileStore } from '../server/store/file.js';

const stores = [['memory', async () => new MemoryStore()], ['file', async () => new FileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ns-store-')))]];
if (process.env.FIRESTORE_EMULATOR_HOST) stores.push(['firestore', async () => { const { FirestoreStore } = await import('../server/store/firestore.js'); return new FirestoreStore({ projectId: 'demo-nextstop' }); }]);

for (const [name, open] of stores) {
  test(`${name}: users are unique by email and can be updated and deleted`, async () => {
    const s = await open();
    const a = await s.createUser(`${name}-a@example.com`); const again = await s.createUser(`${name}-a@example.com`);
    assert.equal(a.id, again.id);
    assert.equal((await s.getUserByEmail(`${name}-a@example.com`)).id, a.id);
    await s.updateUser(a.id, { plan: { until: '2030-01-01T00:00:00.000Z' }, stripeCustomerId: 'cus_' + name });
    assert.equal((await s.getUser(a.id)).plan.until, '2030-01-01T00:00:00.000Z');
    assert.equal((await s.getUserByStripeCustomer('cus_' + name)).id, a.id);
    assert.equal(await s.getUserByStripeCustomer('nope'), null);
    await s.putSync(a.id, { data: { x: 1 }, updatedAt: 'now' });
    await s.incr(`marks:${a.id}:2026-10`);
    await s.deleteUser(a.id);
    assert.equal(await s.getUser(a.id), null); assert.equal(await s.getUserByEmail(`${name}-a@example.com`), null);
    assert.equal(await s.getSync(a.id), null); assert.equal(await s.getCount(`marks:${a.id}:2026-10`), 0);
    await s.close();
  });

  test(`${name}: a sign-in token can be taken exactly once`, async () => {
    const s = await open();
    await s.putToken('h-' + name, { email: 'a@example.com', exp: Date.now() + 1000 });
    assert.equal((await s.peekToken('h-' + name)).email, 'a@example.com'); assert.equal((await s.peekToken('h-' + name)).email, 'a@example.com', 'looking does not use it up'); assert.equal(await s.peekToken('nope'), null);
    const [x, y] = await Promise.all([s.takeToken('h-' + name), s.takeToken('h-' + name)]);
    assert.equal([x, y].filter(Boolean).length, 1);
    assert.equal(await s.takeToken('h-' + name), null);
    await s.close();
  });

  test(`${name}: synced progress round-trips, including large ones and shrinking`, async () => {
    const s = await open();
    const big = { 'writing:w:L1': { draft: 'é'.repeat(900_000), t: 1 } };
    await s.putSync('u1', { data: big, updatedAt: 'a' });
    assert.deepEqual((await s.getSync('u1')).data, big);
    await s.putSync('u1', { data: { small: 1 }, updatedAt: 'b' });
    const r = await s.getSync('u1'); assert.deepEqual(r.data, { small: 1 }); assert.equal(r.updatedAt, 'b');
    assert.equal(await s.getSync('nobody'), null);
    await s.close();
  });

  test(`${name}: counters add up, including going back down`, async () => {
    const s = await open();
    assert.equal(await s.incr('k1'), 1); assert.equal(await s.incr('k1'), 2); assert.equal(await s.incr('k1', -1), 1); assert.equal(await s.getCount('k1'), 1);
    const all = await Promise.all(Array.from({ length: 10 }, () => s.incr('k2')));
    assert.deepEqual([...all].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await s.close();
  });

  test(`${name}: family links and invites`, async () => {
    const s = await open();
    await s.putInvite('inv', { learnerId: 'L', exp: 1 });
    assert.equal((await s.takeInvite('inv')).learnerId, 'L'); assert.equal(await s.takeInvite('inv'), null);
    await s.createLink({ id: 'l1', learnerId: 'L', parentId: 'P', createdAt: 'x', shareWriting: false });
    assert.equal((await s.listLinks('learner', 'L')).length, 1); assert.equal((await s.listLinks('parent', 'P')).length, 1); assert.equal((await s.listLinks('parent', 'L')).length, 0);
    await s.updateLink('l1', { shareWriting: true }); assert.equal((await s.getLink('l1')).shareWriting, true);
    await s.putInvite('inv2', { learnerId: 'L', exp: 1 });
    await s.deleteLinksFor('L');
    assert.equal(await s.getLink('l1'), null); assert.equal(await s.takeInvite('inv2'), null);
    await s.close();
  });

  test(`${name}: promo codes and payment events are used once`, async () => {
    const s = await open();
    await s.putCode('c1', { days: 30, maxUses: 2, uses: 0 });
    assert.ok(await s.useCode('c1')); assert.ok(await s.useCode('c1')); assert.equal(await s.useCode('c1'), null); assert.equal(await s.useCode('nope'), null);
    await s.putCode('c2', { days: 30, maxUses: 0, uses: 0, exp: new Date(Date.now() - 1000).toISOString() });
    assert.equal(await s.useCode('c2'), null);
    assert.equal(await s.firstTimeEvent('evt_1'), true); assert.equal(await s.firstTimeEvent('evt_1'), false);
    await s.close();
  });
}

test('the file store keeps everything across a restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-store-'));
  const a = new FileStore(dir); const u = await a.createUser('keep@example.com');
  await a.putSync(u.id, { data: { k: 1 }, updatedAt: 't' }); await a.putCode('c', { days: 1, maxUses: 1, uses: 0 }); await a.close();
  const b = new FileStore(dir);
  assert.equal((await b.getUserByEmail('keep@example.com')).id, u.id); assert.deepEqual((await b.getSync(u.id)).data, { k: 1 }); assert.ok(await b.getCode('c'));
  await b.close();
});
