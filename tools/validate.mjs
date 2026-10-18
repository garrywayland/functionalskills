#!/usr/bin/env node
// Checks every content file for structure mistakes. No network, no API key.
//   node tools/validate.mjs            check all of content/
//   node tools/validate.mjs file.json  check one file of missions (reading-long layout or writing layout)
// Exits with code 1 if anything is wrong, so it can also run as a check before publishing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const root = process.env.NEXTSTOP_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const require = createRequire(import.meta.url);
const R = require('../js/rules.js');   // the rules live in js/rules.js so the Make-a-pack page can use them too
export const { TEXT_RANGES, SECTION_MARKS, TEXT_RANGES_L2, SECTION_MARKS_L2, SECTION_BOUNDS, textWords, checkReadingMission } = R;
export const checkWritingMission = (m, formats, errs) => R.checkWritingMission(m, formats, errs, 'writing.json');

export function checkReadingFile(file, errs, notes) {
  const data = read(file);
  const name = path.basename(file);
  const ids = new Set();
  for (const m of data.missions) {
    if (ids.has(m.id)) errs.push(`${name} ${m.id}: duplicate mission id`);
    ids.add(m.id);
    checkReadingMission(m, name, errs, notes);
  }
}

export function readFormats() {
  return new Set(read(path.join(root, 'content', 'toolkit.json')).formats.map((f) => f.id));
}

export function checkWritingFile(file, errs, notes) {
  const data = read(file);
  const formats = readFormats();
  const ids = new Set();
  for (const m of data.missions) {
    if (ids.has(m.id)) errs.push(`writing.json ${m.id}: duplicate id`);
    ids.add(m.id);
    checkWritingMission(m, formats, errs);
  }
  notes.push(`writing.json: ${data.missions.length} missions`);
}

export function checkToolkit(file, errs, notes) {
  const data = read(file);
  let total = 0;
  for (const x of [...data.formats, ...data.spag]) {
    const qs = x.questions;
    if (!Array.isArray(qs) || qs.length < 10) { errs.push(`toolkit.json ${x.id}: needs at least 10 practice questions`); continue; }
    total += qs.length;
    const seen = new Set(); const pos = [0, 0, 0, 0];
    qs.forEach((q, i) => {
      const w = `toolkit.json ${x.id} question ${i + 1}`;
      if (!q.prompt || !q.why) errs.push(`${w}: needs a prompt and a why`);
      if (seen.has(q.prompt)) errs.push(`${w}: repeats a prompt in the same skill`);
      seen.add(q.prompt);
      if (!Array.isArray(q.options) || q.options.length !== 4) { errs.push(`${w}: needs exactly four options`); return; }
      if (new Set(q.options).size !== 4) errs.push(`${w}: two options are the same`);
      if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)) errs.push(`${w}: answer index out of range`);
      else pos[q.answer]++;
    });
    if (Math.max(...pos) > Math.ceil(qs.length * 0.4)) errs.push(`toolkit.json ${x.id}: too many correct answers in one position (${pos.join('/')})`);
  }
  notes.push(`toolkit.json: ${data.formats.length} formats, ${data.spag.length} SPaG points, ${total} practice questions`);
}

export function checkLearn(file, errs, notes) {
  const data = read(file);
  const words = (t) => t.trim().split(/\s+/).length;
  const bands = { 9: [[1, 3], [4, 6], [7, 9]], 6: [[1, 2], [3, 4], [5, 6]] };
  let samples = 0; const ids = new Set();
  for (const t of data.mark) {
    for (const s of t.samples) {
      samples++;
      const w = `learn.json ${t.id}/${s.id}`;
      if (ids.has(s.id)) errs.push(`${w}: duplicate sample id`);
      ids.add(s.id);
      if (!Number.isInteger(s.composition) || s.composition < 0 || s.composition > 9) errs.push(`${w}: composition mark out of range`);
      if (!Number.isInteger(s.spag) || s.spag < 0 || s.spag > 6) errs.push(`${w}: SPaG mark out of range`);
      const quotes = [...s.worked.map((x) => x.quote), ...s.spag_notes.map((x) => x.quote)];
      for (const q of quotes) if (!s.answer.includes(q)) errs.push(`${w}: quote not found in the answer: "${q}"`);
      for (const n of s.spag_notes) if (n.quote === n.fix) errs.push(`${w}: a SPaG note whose fix is the same as the quote`);
      if (!s.worked.length || !s.target?.what || !s.why_composition || !s.why_spag) errs.push(`${w}: missing feedback text`);
      const len = words(s.answer);
      if (len < 25 || len > 260) errs.push(`${w}: odd length (${len} words)`);
    }
    const marks = t.samples.map((s) => s.composition);
    if (new Set(marks).size < marks.length) errs.push(`learn.json ${t.id}: samples should be at clearly different levels`);
  }
  let items = 0;
  for (const f of data.fix) {
    for (const i of f.items) { items++; if (i.wrong === i.fixed) errs.push(`learn.json ${f.id}: an item with nothing to fix: "${i.wrong}"`); if (!i.why) errs.push(`learn.json ${f.id}: item without a reason`); for (const a of i.also || []) if (a === i.fixed || a === i.wrong) errs.push(`learn.json ${f.id}: an alternative that repeats the answer or the mistake: "${a}"`); }
  }
  notes.push(`learn.json: ${data.mark.length} marking tasks, ${samples} samples, ${data.fix.length} fix-it sets, ${items} sentences`);
}

// An imported pack file. `taken` is the set of ids already used elsewhere. Themes are checked by name.
export function checkPack(file, errs, notes, { themeNames, taken = new Set() } = {}) {
  R.checkPackData(read(file), path.basename(file), errs, notes, { themeNames, taken, formats: readFormats() });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = []; const notes = [];
  const arg = process.argv[2];
  if (arg) {
    const data = read(arg);
    if (data.missions?.[0]?.bullets) checkWritingFile(arg, errs, notes); else checkReadingFile(arg, errs, notes);
  } else {
    const c = (f) => path.join(root, 'content', f);
    const man = read(c('index.json'));
    const names = read(c(man.themes)).themes.map((t) => t.name);
    const taken = new Set();
    for (const f of man.reading) {
      checkReadingFile(c(f), errs, notes);
      for (const m of read(c(f)).missions) { if (taken.has(m.id)) errs.push(`${f} ${m.id}: id used twice across files`); taken.add(m.id); if (!names.includes(m.topic)) errs.push(`${f} ${m.id}: topic "${m.topic}" is not in themes.json`); }
    }
    for (const f of man.writing) {
      checkWritingFile(c(f), errs, notes);
      for (const m of read(c(f)).missions) { if (taken.has(m.id)) errs.push(`${f} ${m.id}: id used twice across files`); taken.add(m.id); if (!names.includes(m.topic)) errs.push(`${f} ${m.id}: topic "${m.topic}" is not in themes.json`); }
    }
    for (const f of man.packs) {
      checkPack(c(f), errs, notes, { themeNames: names, taken });
      const p = read(c(f)); for (const m of [...(p.reading || []), ...(p.writing || [])]) taken.add(m.id);
    }
    checkToolkit(c(man.toolkit), errs, notes);
    checkLearn(c(man.learn), errs, notes);
    const ids = new Set(); for (const t of read(c(man.themes)).themes) { if (ids.has(t.id)) errs.push(`themes.json: duplicate id ${t.id}`); ids.add(t.id); if (!/^[a-z0-9-]+$/.test(t.id) || !t.name || !t.blurb) errs.push(`themes.json ${t.id}: needs a lowercase-and-hyphens id, a name and a blurb`); }
  }
  notes.forEach((n) => console.log('ok  ', n));
  if (errs.length) { console.error('\nProblems:'); errs.forEach((e) => console.error('  -', e)); process.exit(1); }
  console.log('\nAll checks passed.');
}
