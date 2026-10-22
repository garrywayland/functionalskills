import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startApp, client, signIn, makePlus } from './helpers.mjs';

const longMission = JSON.parse(fs.readFileSync(new URL('../content/reading-long.json', import.meta.url), 'utf8')).missions[0];
const aLockedParagraph = longMission.texts[1].body.find((b) => b.p).p.slice(0, 60);

test('signed-out visitors get the free lessons in full and locked stubs for the rest', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const r = await c.get('/api/content'); assert.equal(r.status, 200);
  const b = r.json;
  assert.equal(b.entitled, false);
  const locked = b.reading.missions.filter((m) => m.locked);
  const open = b.reading.missions.filter((m) => !m.locked);
  assert.ok(open.length >= 1 && locked.length >= 1);
  for (const m of locked) { assert.equal(m.texts, undefined); assert.equal(m.questions, undefined); assert.ok(m.meta.texts >= 1); }
  for (const m of open) { assert.ok(m.texts.length && m.questions.length); }
  assert.ok(b.writing.missions.some((m) => m.locked) && b.writing.missions.some((m) => !m.locked));
  const lockedWriting = b.writing.missions.find((m) => m.locked);
  assert.equal(lockedWriting.indicative, undefined); assert.equal(lockedWriting.bullets, undefined);
  assert.ok(b.writing.lengthGuide && b.writing.markGuide, 'shared writing settings are sent');
  assert.ok(b.toolkit.formats.length >= 10, 'the toolkit is free');
  assert.ok(b.learn.fix.length >= 1 && b.learn.fix[0].items.length);
  const lockedTask = b.learn.mark.find((t) => t.locked);
  assert.ok(lockedTask && lockedTask.samples.every((s) => Object.keys(s).join() === 'id'), 'locked marking tasks send no sample answers');
  assert.ok(b.learn.mark.some((t) => !t.locked && t.samples[0].answer));
  await ctx.close();
});

test('locked text and answers are nowhere in what a free visitor receives', async () => {
  const ctx = await startApp(); const c = client(ctx.base);
  const r = await c.get('/api/content');
  assert.ok(!r.text.includes(aLockedParagraph), 'a paragraph of a locked mission must not be in the response');
  const lockedIds = r.json.reading.missions.filter((m) => m.locked).map((m) => m.id);
  const full = ctx.app.content.bundle({ entitled: true });
  for (const id of lockedIds) {
    const m = full.reading.missions.find((x) => x.id === id);
    assert.ok(!r.text.includes(m.questions[0].prompt), id + ' question leaked');
  }
  await ctx.close();
});

test('a Plus account gets everything, and the bundle is the same shape', async () => {
  const ctx = await startApp();
  const a = await signIn(ctx, 'plus@example.com'); await makePlus(ctx, 'plus@example.com');
  const r = await a.get('/api/content');
  assert.equal(r.json.entitled, true);
  assert.ok(r.json.reading.missions.every((m) => !m.locked) && r.json.writing.missions.every((m) => !m.locked) && r.json.learn.mark.every((t) => !t.locked));
  const anon = (await client(ctx.base).get('/api/content')).json;
  assert.deepEqual(Object.keys(r.json).sort(), Object.keys(anon).sort());
  assert.equal(r.json.reading.missions.length, anon.reading.missions.length);
  await ctx.close();
});

test('an expired plan goes back to free', async () => {
  const ctx = await startApp();
  const a = await signIn(ctx, 'lapsed@example.com'); const u = await makePlus(ctx, 'lapsed@example.com', -1);
  assert.equal((await a.get('/api/me')).json.plan.tier, 'free');
  assert.ok((await a.get('/api/content')).json.reading.missions.some((m) => m.locked));
  await ctx.close();
});

test('unchecked drafts are hidden, except from an admin who asks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-content-'));
  fs.cpSync(new URL('../content', import.meta.url), dir, { recursive: true });
  const f = path.join(dir, 'reading.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.missions[0].status = 'draft'; const draftId = j.missions[0].id; fs.writeFileSync(f, JSON.stringify(j));
  const ctx = await startApp({ CONTENT_DIR: dir, ADMIN_EMAILS: 'boss@example.com' });
  const anon = await client(ctx.base).get('/api/content');
  assert.ok(!anon.json.reading.missions.some((m) => m.id === draftId));
  const plus = await signIn(ctx, 'plus@example.com'); await makePlus(ctx, 'plus@example.com');
  assert.ok(!(await plus.get('/api/content?drafts=1')).json.reading.missions.some((m) => m.id === draftId), 'a paying learner never sees drafts');
  const boss = await signIn(ctx, 'boss@example.com');
  assert.ok(!(await boss.get('/api/content')).json.reading.missions.some((m) => m.id === draftId));
  assert.ok((await boss.get('/api/content?drafts=1')).json.reading.missions.some((m) => m.id === draftId));
  await ctx.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('promo codes: redeem, stack, run out, expire', async () => {
  const ctx = await startApp();
  const { sha256 } = await import('../server/util.js');
  await ctx.app.store.putCode(sha256('PILOT2026'), { days: 30, maxUses: 2, uses: 0, label: 'Pilot' });
  await ctx.app.store.putCode(sha256('OLDCODE1'), { days: 30, maxUses: 5, uses: 0, exp: new Date(Date.now() - 1000).toISOString() });
  const a = await signIn(ctx, 'a@example.com'); const b = await signIn(ctx, 'b@example.com'); const c = await signIn(ctx, 'c@example.com');
  assert.equal((await a.post('/api/redeem', { code: 'nope' })).status, 400);
  const r = await a.post('/api/redeem', { code: 'pilot-2026' });
  assert.equal(r.status, 200); assert.equal(r.json.plan.tier, 'plus'); assert.equal(r.json.plan.source, 'code');
  const first = Date.parse(r.json.plan.until);
  assert.equal((await b.post('/api/redeem', { code: 'PILOT2026' })).status, 200);
  assert.equal((await c.post('/api/redeem', { code: 'PILOT2026' })).status, 400, 'a code that has run out');
  assert.equal((await a.post('/api/redeem', { code: 'OLDCODE1' })).status, 400, 'an expired code');
  assert.ok(Date.parse((await a.get('/api/me')).json.plan.until) >= first);
  assert.equal((await client(ctx.base).post('/api/redeem', { code: 'PILOT2026' })).status, 401);
  await ctx.close();
});

test('promo code guessing is limited by address as well as by account', async () => {
  const ctx = await startApp({ TRUST_PROXY: '1', AUTH_PER_IP_PER_HOUR: '500', API_PER_IP_PER_MINUTE: '5000' });
  let blocked = 0;
  for (let i = 0; i < 40; i++) {
    const c = await signIn(ctx, `guesser${i}@example.com`);
    const r = await c.post('/api/redeem', { code: 'GUESS-' + i + 'ABCD' }, { headers: { 'X-Forwarded-For': '198.51.100.7' } });
    if (r.status === 429) blocked++;
  }
  assert.ok(blocked >= 5, 'many accounts from one address are cut off (' + blocked + ' blocked)');
  await ctx.close();
});
