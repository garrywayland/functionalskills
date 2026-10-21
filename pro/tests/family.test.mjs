import test from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signIn, makePlus, fakeServer } from './helpers.mjs';

const today = new Date().toISOString().slice(0, 10);
const log = (id, kind, title) => ({ id, kind, title, topic: 'Pandas', level: 'L1', date: today });

async function learnerWithWork(ctx, email = 'kid@example.com') {
  const kid = await signIn(ctx, email);
  await kid.post('/api/sync', { data: {
    done: { L1: { 'r-pandas': true, 'w-pandas-4': true, 'tool-commas': true } },
    log: [log('r-pandas', 'Reading', 'Panda Week'), log('w-pandas-4', 'Writing', 'Is a day at the zoo worth it?'), log('tool-commas', 'Toolkit', 'Commas practice')],
    'writing:w-pandas-4:L1': { draft: 'My private zoo opinion post.', plan: {}, t: 5 },
  } });
  return kid;
}

test('a parent links with a one-time code and sees progress, not writing', async () => {
  const ctx = await startApp();
  const kid = await learnerWithWork(ctx); const mum = await signIn(ctx, 'mum@example.com');
  const inv = await kid.post('/api/family/invite'); assert.equal(inv.status, 200); assert.match(inv.json.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal((await mum.post('/api/family/accept', { code: 'AAAAA-BBBBB' })).status, 400);
  const ok = await mum.post('/api/family/accept', { code: inv.json.code.toLowerCase() });
  assert.equal(ok.status, 200); assert.equal(ok.json.linked, true);
  assert.equal((await signIn(ctx, 'dad@example.com').then((d) => d.post('/api/family/accept', { code: inv.json.code }))).status, 400, 'a code works once');
  const list = (await mum.get('/api/family')).json;
  assert.equal(list.asParent.length, 1); assert.equal(list.asParent[0].learner, 'ki***@example.com'); assert.equal(list.asParent[0].lastActive, today);
  const s = (await mum.get(`/api/family/${list.asParent[0].id}/summary`)).json;
  assert.equal(s.readOnly, true); assert.equal(s.summary.byLevel.L1.reading, 1); assert.equal(s.summary.byLevel.L1.writing, 1); assert.equal(s.summary.byLevel.L1.practice, 1);
  assert.equal(s.summary.themes.Pandas, 2); assert.equal(s.summary.activeDaysLast28, 1); assert.equal(s.summary.recent.length, 3);
  assert.equal(s.summary.writing, undefined, 'her writing is private unless she shares it');
  assert.ok(!JSON.stringify(s).includes('private zoo opinion'));
  const kidList = (await kid.get('/api/family')).json; assert.equal(kidList.asLearner[0].with, 'mum@example.com'); assert.equal(kidList.asLearner[0].shareWriting, false);
  await ctx.close();
});

test('the learner can share her writing, and stop sharing, at any time', async () => {
  const ctx = await startApp();
  const kid = await learnerWithWork(ctx); const mum = await signIn(ctx, 'mum@example.com');
  await mum.post('/api/family/accept', { code: (await kid.post('/api/family/invite')).json.code });
  const link = (await kid.get('/api/family')).json.asLearner[0].id;
  assert.equal((await mum.patch(`/api/family/${link}`, { shareWriting: true })).status, 404, 'the parent cannot grant herself access');
  assert.equal((await kid.patch(`/api/family/${link}`, { shareWriting: true })).status, 200);
  let s = (await mum.get(`/api/family/${link}/summary`)).json.summary;
  assert.equal(s.writing.length, 1); assert.equal(s.writing[0].title, 'Is a day at the zoo worth it?'); assert.match(s.writing[0].text, /private zoo opinion/);
  await kid.patch(`/api/family/${link}`, { shareWriting: false });
  assert.equal((await mum.get(`/api/family/${link}/summary`)).json.summary.writing, undefined);
  await ctx.close();
});

test('either side can end the link, and then nothing is visible', async () => {
  const ctx = await startApp();
  const kid = await learnerWithWork(ctx); const mum = await signIn(ctx, 'mum@example.com'); const nosy = await signIn(ctx, 'nosy@example.com');
  await mum.post('/api/family/accept', { code: (await kid.post('/api/family/invite')).json.code });
  const link = (await kid.get('/api/family')).json.asLearner[0].id;
  assert.equal((await nosy.get(`/api/family/${link}/summary`)).status, 404, 'a stranger cannot read it');
  assert.equal((await nosy.del(`/api/family/${link}`)).status, 404, 'or remove it');
  assert.equal((await kid.get(`/api/family/${link}/summary`)).status, 404, 'the learner uses her own pages, not the parent view');
  assert.equal((await kid.del(`/api/family/${link}`)).status, 200);
  assert.equal((await mum.get(`/api/family/${link}/summary`)).status, 404);
  assert.deepEqual((await mum.get('/api/family')).json.asParent, []);
  await ctx.close();
});

test('codes expire, your own code is refused, and there is a limit on how many people', async () => {
  const ctx = await startApp();
  const kid = await signIn(ctx, 'kid@example.com');
  const own = (await kid.post('/api/family/invite')).json.code;
  assert.equal((await kid.post('/api/family/accept', { code: own })).status, 400);
  const mum = await signIn(ctx, 'mum@example.com');
  for (const i of ctx.app.store.invites.values()) i.exp = Date.now() - 1;
  assert.equal((await mum.post('/api/family/accept', { code: own })).status, 400, 'an old code');
  for (let i = 0; i < 4; i++) { const p = await signIn(ctx, `p${i}@example.com`); await p.post('/api/family/accept', { code: (await kid.post('/api/family/invite')).json.code }); }
  assert.equal((await kid.post('/api/family/invite')).status, 400, 'at most four people');
  assert.equal((await client(ctx.base).post('/api/family/invite')).status, 401);
  await ctx.close();
});

test('guessing codes is rate limited', async () => {
  const ctx = await startApp(); const mum = await signIn(ctx, 'mum@example.com');
  let last = 0; for (let i = 0; i < 12; i++) last = (await mum.post('/api/family/accept', { code: 'ABCDE-FGHJK' })).status;
  assert.equal(last, 429);
  await ctx.close();
});

test('deleting an account ends its links', async () => {
  const ctx = await startApp();
  const kid = await learnerWithWork(ctx); const mum = await signIn(ctx, 'mum@example.com');
  await mum.post('/api/family/accept', { code: (await kid.post('/api/family/invite')).json.code });
  assert.equal((await kid.del('/api/me', { confirm: 'DELETE' })).status, 200);
  assert.deepEqual((await mum.get('/api/family')).json.asParent, []);
  await ctx.close();
});
