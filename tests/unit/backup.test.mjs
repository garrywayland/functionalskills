// Unit tests for js/backup.js.   node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const B = createRequire(import.meta.url)('../../js/backup.js');

const file = (data) => JSON.stringify({ app: 'next-stop', version: 1, saved: '2026-10-18', data });

test('make keeps only her work, not menus or the teacher switch or half-pasted text', () => {
  const out = B.make({ level: 'L2', done: { L1: { a: true } }, menus: { x: 1 }, drafts: true, 'make:paste': 'zzz', 'make:form': {}, 'reading:r1:L1': { answers: {} }, 'drill:spag:commas': { order: [0], pos: 0, answers: {} }, 'learn:a1': { comp: 3 }, 'learn-fix:fix-commas': { pos: 1 }, junk: 5 }, '2026-10-18');
  assert.deepEqual(Object.keys(out.data).sort(), ['done', 'drill:spag:commas', 'learn-fix:fix-commas', 'learn:a1', 'level', 'reading:r1:L1']);
  assert.equal(out.app, 'next-stop');
});

test('parse refuses anything that is not a saved-work file, and never throws', () => {
  for (const bad of ['', '   ', 'not json', '[]', '{}', '{"app":"other","version":1,"data":{}}', '{"app":"next-stop","version":99,"data":{}}', '{"app":"next-stop","version":1,"data":[]}']) {
    const r = B.parse(bad); assert.equal(r.ok, false, bad); assert.ok(r.error);
  }
  assert.equal(B.parse(file({})).ok, true);
});

test('parse drops unknown keys and wrong shapes, and counts them', () => {
  const r = B.parse(file({ evil: { a: 1 }, 'reading:r1:L1': 'a string', 'reading:r2:L1': { answers: {} }, level: 'L3', log: [{ id: 1 }], 'writing:../x:L1': { draft: 'x' } }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data), ['reading:r2:L1']);
  assert.equal(r.skipped, 5);
});

test('a missing thing is simply added', () => {
  const m = B.merge({}, { 'reading:r1:L1': { answers: { q1: { choice: 1 } }, pos: 2, t: 5 }, done: { L1: { r1: true } }, log: [{ id: 'r1', kind: 'Reading', date: '2026-10-01', level: 'L1' }] });
  assert.equal(Object.keys(m.changes).length, 3);
  assert.equal(m.report.added.records, 1); assert.equal(m.report.added.done, 1); assert.equal(m.report.added.steps, 1);
});

test('same mission on both sides: the newest wins and gaps are filled from the other', () => {
  const mine = { answers: { q1: { choice: 0 }, q2: { text: 'only here' } }, pos: 1, t: 100 };
  const theirs = { answers: { q1: { choice: 2, checked: true }, q3: { choice: 1 } }, pos: 4, t: 200 };
  const r = B.merge({ 'reading:r1:L1': mine }, { 'reading:r1:L1': theirs }).changes['reading:r1:L1'];
  assert.equal(r.answers.q1.choice, 2, 'newer copy wins where both have an answer');
  assert.equal(r.answers.q2.text, 'only here', 'my answer the file does not have is kept');
  assert.equal(r.answers.q3.choice, 1, 'their answer I did not have is added');
  assert.equal(r.pos, 4); assert.equal(r.t, 200);
  const older = B.merge({ 'reading:r1:L1': theirs }, { 'reading:r1:L1': mine }).changes['reading:r1:L1'];
  assert.equal(older.answers.q1.choice, 2, 'an older file never overwrites newer work here');
  assert.equal(older.answers.q2.text, 'only here');
});

test('writing: an empty draft never wipes a real one, a real one fills an empty one', () => {
  const full = { draft: 'my words', plan: { opening: 'idea' }, t: 10 };
  const blank = { draft: '', plan: {}, t: 99 };
  assert.equal(B.merge({ 'writing:w1:L1': full }, { 'writing:w1:L1': blank }).changes['writing:w1:L1'], undefined, 'nothing to change');
  assert.equal(B.merge({ 'writing:w1:L1': blank }, { 'writing:w1:L1': full }).changes['writing:w1:L1'].draft, 'my words');
});

test('done and log are unions, and a log entry is not added twice', () => {
  const e = (id, date) => ({ id, kind: 'Reading', date, level: 'L1' });
  const m = B.merge({ done: { L1: { a: true } }, log: [e('a', '2026-10-02')] }, { done: { L1: { b: true }, L2: { c: true } }, log: [e('a', '2026-10-02'), e('b', '2026-10-01')] });
  assert.deepEqual(m.changes.done, { L1: { a: true, b: true }, L2: { c: true } });
  assert.deepEqual(m.changes.log.map((x) => x.id), ['b', 'a'], 'sorted by date, no duplicate');
  assert.equal(m.report.added.steps, 1); assert.equal(m.report.added.done, 2);
});

test('packs are added by id and never duplicated', () => {
  const pack = (id) => ({ id, theme: { id: 't', name: 'T', blurb: 'b' }, pack: { reading: [], writing: [] } });
  const m = B.merge({ mypacks: [pack('p1')] }, { mypacks: [pack('p1'), pack('p2')] });
  assert.deepEqual(m.changes.mypacks.map((p) => p.id), ['p1', 'p2']);
  assert.equal(m.report.added.packs, 1);
  assert.equal(B.merge({ mypacks: [pack('p1')] }, { mypacks: [pack('p1')] }).changes.mypacks, undefined);
});

test('practice, marking and fix-it keep whichever is further on, and fill gaps', () => {
  const d1 = { order: [0, 1], pos: 1, answers: { 0: { choice: 1, checked: true } } };
  const d2 = { order: [0, 1], pos: 2, answers: { 0: { choice: 1, checked: true }, 1: { choice: 0, checked: true } } };
  assert.equal(B.merge({ 'drill:spag:commas': d1 }, { 'drill:spag:commas': d2 }).changes['drill:spag:commas'].pos, 2);
  assert.equal(B.merge({ 'drill:spag:commas': d2 }, { 'drill:spag:commas': d1 }).changes['drill:spag:commas'], undefined);
  const l1 = { comp: 5, spag: null, revealed: false }, l2 = { comp: 4, spag: 3, revealed: true };
  const lm = B.merge({ 'learn:a1': l1 }, { 'learn:a1': l2 }).changes['learn:a1'];
  assert.equal(lm.revealed, true); assert.equal(lm.spag, 3);
  const f1 = { pos: 5, ended: false, items: [] }, f2 = { pos: 0, ended: true, items: [] };
  assert.equal(B.merge({ 'learn-fix:x': f1 }, { 'learn-fix:x': f2 }).changes['learn-fix:x'].ended, true);
});

test('level in the file never changes the level here', () => {
  assert.equal(B.merge({ level: 'L1' }, { level: 'L2' }).changes.level, undefined);
  assert.equal(B.merge({}, { level: 'L2' }).changes.level, 'L2');
});

test('merging the same file twice changes nothing the second time', () => {
  const inc = { 'reading:r1:L1': { answers: { q1: { choice: 1 } }, pos: 2, t: 5 }, done: { L1: { r1: true } }, log: [{ id: 'r1', kind: 'Reading', date: '2026-10-01', level: 'L1' }], 'learn:a1': { comp: 4 } };
  const first = B.merge({}, inc).changes;
  const second = B.merge(first, inc);
  assert.deepEqual(second.changes, {});
});
