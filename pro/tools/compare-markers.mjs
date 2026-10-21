#!/usr/bin/env node
// How close is each AI to the marks we wrote for the sample answers?
//   node tools/compare-markers.mjs --providers vertex,anthropic [--level L1] [--limit 18] [--out results.json]
// Uses only the 18 invented sample answers in content/learn.json. No learner writing is involved.
// Needs: for anthropic, ANTHROPIC_API_KEY; for vertex, a signed-in Google Cloud (run it in Cloud Shell) and VERTEX_PROJECT.
// It makes real calls and costs a little money. Start with --limit 3.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.js';
import { makeProvider, makeMarker } from '../server/marking/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {}; for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const contentDir = process.env.CONTENT_DIR || path.join(here, '..', 'content');
const learn = JSON.parse(fs.readFileSync(path.join(contentDir, 'learn.json'), 'utf8'));
const writing = JSON.parse(fs.readFileSync(path.join(contentDir, 'writing.json'), 'utf8'));
const toolkit = JSON.parse(fs.readFileSync(path.join(contentDir, 'toolkit.json'), 'utf8'));
const providers = String(args.providers || 'fake').split(',').map((s) => s.trim()).filter(Boolean);

export function buildCases({ level, limit } = {}) {
  const cases = [];
  for (const t of learn.mark) {
    if (level && t.level !== level) continue;
    const raw = writing.missions.find((m) => m.id === t.missionId);
    const m = { ...raw, ...((raw.levels && raw.levels[t.level]) || {}) };
    const format = toolkit.formats.find((f) => f.id === m.format);
    for (const s of t.samples) {
      cases.push({
        id: `${t.id}/${s.id}`, ours: { comp: s.composition, spag: s.spag },
        req: { level: t.level, task: m.task, format: format ? format.name : m.format, context: m.context, audience: m.audience, purpose: m.purpose, instruction: m.instruction, bullets: m.bullets, ...(m.info ? { info: m.info } : {}), answer: s.answer },
      });
    }
  }
  return limit ? cases.slice(0, Number(limit)) : cases;
}

export function summarise(rows) {
  const n = rows.length || 1;
  const within = (k, d) => rows.filter((r) => Math.abs(r[k + 'Diff']) <= d).length / n;
  return {
    n: rows.length,
    meanAbsComp: rows.reduce((a, r) => a + Math.abs(r.compDiff), 0) / n, meanAbsSpag: rows.reduce((a, r) => a + Math.abs(r.spagDiff), 0) / n,
    compWithin1: within('comp', 1), spagWithin1: within('spag', 1), compBias: rows.reduce((a, r) => a + r.compDiff, 0) / n, spagBias: rows.reduce((a, r) => a + r.spagDiff, 0) / n,
    tokens: { in: rows.reduce((a, r) => a + (r.usage?.in || 0), 0), out: rows.reduce((a, r) => a + (r.usage?.out || 0), 0) },
    declined: rows.filter((r) => r.declined).length, failed: rows.filter((r) => r.failed).length,
  };
}

export async function run({ providers, level, limit, provider: injected }) {
  const cases = buildCases({ level, limit });
  const report = { cases: cases.length, providers: {} };
  for (const name of providers) {
    const provider = injected && injected[name] ? injected[name] : makeProvider(loadConfig({ ...process.env, MARKING_PROVIDER: name }));
    const marker = makeMarker(provider);
    const rows = [];
    for (const c of cases) {
      try {
        const r = await marker.mark(c.req);
        if (!r.ok) { rows.push({ id: c.id, declined: true, compDiff: 0, spagDiff: 0 }); continue; }
        rows.push({ id: c.id, ours: c.ours, theirs: { comp: r.feedback.composition.mark, spag: r.feedback.spag.mark }, compDiff: r.feedback.composition.mark - c.ours.comp, spagDiff: r.feedback.spag.mark - c.ours.spag, usage: r.usage });
      } catch (e) { rows.push({ id: c.id, failed: true, error: e.message, compDiff: 0, spagDiff: 0 }); }
    }
    report.providers[name] = { model: provider.model, summary: summarise(rows.filter((r) => !r.failed && !r.declined)), declined: rows.filter((r) => r.declined).length, failed: rows.filter((r) => r.failed).length, rows };
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await run({ providers, level: args.level, limit: args.limit });
  const pct = (x) => Math.round(x * 100) + '%';
  console.log(`\nSample answers marked: ${report.cases}\n`);
  for (const [name, p] of Object.entries(report.providers)) {
    const s = p.summary;
    console.log(`${name} (${p.model})  marked ${s.n}, declined ${p.declined}, failed ${p.failed}`);
    console.log(`  Composition: off by ${s.meanAbsComp.toFixed(2)} marks on average, within 1 mark ${pct(s.compWithin1)}, leans ${s.compBias >= 0 ? '+' : ''}${s.compBias.toFixed(2)}`);
    console.log(`  SPaG:        off by ${s.meanAbsSpag.toFixed(2)} marks on average, within 1 mark ${pct(s.spagWithin1)}, leans ${s.spagBias >= 0 ? '+' : ''}${s.spagBias.toFixed(2)}`);
    console.log(`  Tokens used: ${s.tokens.in} in, ${s.tokens.out} out (multiply by the current price to get the cost per mark)\n`);
  }
  if (args.out) { fs.writeFileSync(args.out, JSON.stringify(report, null, 2)); console.log('Full results saved to ' + args.out); }
}
