import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCases, summarise, run } from '../tools/compare-markers.mjs';

test('every sample answer becomes a marking request that the service accepts', async () => {
  const { MarkRequest } = await import('../server/marking/prompts.js');
  const cases = buildCases();
  assert.equal(cases.length, 18);
  for (const c of cases) assert.ok(MarkRequest.safeParse(c.req).success, c.id);
});

test('the comparison reports how far each AI is from our marks', async () => {
  const perfect = { kind: 'perfect', model: 'perfect', async mark(req) { const c = buildCases().find((x) => x.req.answer === req.answer); return { parsed: { composition_mark: c.ours.comp, spag_mark: c.ours.spag, worked: [{ what: 'a', quote: 'b' }, { what: 'c', quote: 'd' }], try_next: { what: 'e', example: 'f' } }, usage: { in: 10, out: 5 } }; } };
  const high = { kind: 'high', model: 'high', async mark(req) { const r = await perfect.mark(req); r.parsed.composition_mark += 2; return r; } };
  const report = await run({ providers: ['perfect', 'high'], provider: { perfect, high }, limit: 6 });
  assert.equal(report.providers.perfect.summary.meanAbsComp, 0); assert.equal(report.providers.perfect.summary.compWithin1, 1);
  assert.ok(report.providers.high.summary.meanAbsComp > 1); assert.ok(report.providers.high.summary.compBias > 1); assert.ok(report.providers.high.summary.compWithin1 < 0.5);
  assert.equal(summarise([]).n, 0);
});

test('the built-in stand-in marker runs end to end', async () => {
  const report = await run({ providers: ['fake'], limit: 4 });
  assert.equal(report.providers.fake.failed, 0); assert.equal(report.providers.fake.summary.n, 4);
});
