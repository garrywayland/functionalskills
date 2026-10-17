#!/usr/bin/env node
// Checks every content file for structure mistakes. No network, no API key.
//   node tools/validate.mjs            check all of content/
//   node tools/validate.mjs file.json  check one file of missions (reading-long layout or writing layout)
// Exits with code 1 if anything is wrong, so it can also run as a check before publishing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = process.env.NEXTSTOP_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Word-count ranges for the three texts in a longer Level 1 reading mission (Pearson guidance to centres).
export const TEXT_RANGES = { A: [80, 100], B: [300, 320], C: [200, 220] };
// Marks per section of a longer mission: Q1-3 (Text A), Q4-9 (Text B), Q10-14 (Text C), Q15 (B and C).
export const SECTION_MARKS = [5, 12, 10, 3];

const stripMarks = (t) => String(t).replace(/\*\*/g, '');
const countWords = (t) => stripMarks(t).split(/\s+/).filter(Boolean).length;

export function textWords(text) {
  let n = countWords(text.title);
  for (const b of text.body) {
    for (const k of ['p', 'h', 'box', 'callout']) if (typeof b[k] === 'string') n += countWords(b[k]);
    for (const k of ['ul', 'ol']) if (Array.isArray(b[k])) n += b[k].reduce((a, x) => a + countWords(x), 0);
  }
  return n;
}

function checkQuestion(where, q, textIds, errs) {
  const need = (cond, msg) => { if (!cond) errs.push(`${where} ${q.id}: ${msg}`); };
  need(q.id && q.prompt, 'missing id or prompt');
  need(['choice', 'tfns', 'factopinion', 'multi', 'open'].includes(q.type), `unknown type ${q.type}`);
  need(Array.isArray(q.levels) && q.levels.length, 'missing levels');
  if (q.text && q.text !== 'both') {
    for (const r of String(q.text).split(',')) need(textIds.includes(r), `refers to missing text ${r}`);
  }
  if (q.type === 'choice') {
    need(Array.isArray(q.options) && q.options.length >= 2, 'needs options');
    need(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.options || []).length, 'answer index out of range');
    need(q.why, 'missing why');
  }
  if (q.type === 'tfns') { need(['true', 'false', 'notstated'].includes(q.answer), 'bad answer'); need(q.why, 'missing why'); }
  if (q.type === 'factopinion') { need(['fact', 'opinion'].includes(q.answer), 'bad answer'); need(q.why, 'missing why'); }
  if (q.type === 'multi') {
    need(Array.isArray(q.answer) && q.answer.length >= 2, 'answer must list indexes');
    need((q.answer || []).every((a) => Number.isInteger(a) && a >= 0 && a < (q.options || []).length), 'answer index out of range');
    need(new Set(q.answer).size === (q.answer || []).length, 'repeated answer index');
    need(q.marks === (q.answer || []).length, 'marks should equal the number of answers');
    need(q.why, 'missing why');
  }
  if (q.type === 'open') {
    need(q.model && Array.isArray(q.check) && q.check.length, 'needs model and check');
  }
}

export function checkReadingMission(m, name, errs, notes) {
  const where = `${name} ${m.id}`;
  const textIds = m.texts.map((t) => t.id);
  m.questions.forEach((q) => checkQuestion(where, q, textIds, errs));
  const qids = m.questions.map((q) => q.id);
  if (new Set(qids).size !== qids.length) errs.push(`${where}: duplicate question id`);
  if (m.length === 'long') {
    if (textIds.join('') !== 'ABC') errs.push(`${where}: long missions need texts A, B and C`);
    for (const t of m.texts) {
      const n = textWords(t); const r = TEXT_RANGES[t.id];
      if (r && (n < r[0] || n > r[1])) errs.push(`${where}: Text ${t.id} has ${n} words (needs ${r[0]} to ${r[1]})`);
    }
    const num = (q) => parseInt(String(q.label || '').split('(')[0], 10);
    const sum = (lo, hi) => m.questions.filter((q) => num(q) >= lo && num(q) <= hi).reduce((a, q) => a + (q.marks || 0), 0);
    const got = [sum(1, 3), sum(4, 9), sum(10, 14), sum(15, 15)];
    if (got.join() !== SECTION_MARKS.join()) errs.push(`${where}: section marks ${got.join('/')} (needs ${SECTION_MARKS.join('/')})`);
    const numbers = new Set(m.questions.map(num));
    if (numbers.size !== 15) errs.push(`${where}: has ${numbers.size} numbered questions (needs 15)`);
    if (!m.questions.every((q) => q.label && q.marks)) errs.push(`${where}: every question needs a label and marks`);
    notes.push(`${where}: ${m.texts.map((t) => textWords(t)).join('/')} words, ${m.questions.reduce((a, q) => a + (q.marks || 0), 0)} marks`);
  } else {
    notes.push(`${where}: ${m.questions.length} questions`);
  }
}

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

export function checkWritingMission(m, formats, errs) {
  const where = `writing.json ${m.id}`;
  if (!formats.has(m.format)) errs.push(`${where}: format "${m.format}" is not in toolkit.json`);
  const want = m.task === 1 ? 3 : 2;
  const sets = [m.bullets, ...Object.values(m.levels || {}).map((l) => l.bullets).filter(Boolean)];
  for (const b of sets) if (!Array.isArray(b) || b.length !== want) errs.push(`${where}: Task ${m.task} needs ${want} bullet points, has ${b ? b.length : 0}`);
  for (const k of ['context', 'audience', 'purpose', 'instruction']) if (!m[k]) errs.push(`${where}: missing ${k}`);
  if (![1, 2].includes(m.task)) errs.push(`${where}: task must be 1 or 2`);
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
  for (const x of [...data.formats, ...data.spag]) {
    const p = x.practice;
    if (!p || !(p.answer >= 0 && p.answer < p.options.length)) errs.push(`toolkit.json ${x.id}: practice answer out of range`);
  }
  notes.push(`toolkit.json: ${data.formats.length} formats, ${data.spag.length} SPaG points`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = []; const notes = [];
  const arg = process.argv[2];
  if (arg) {
    const data = read(arg);
    if (data.missions?.[0]?.bullets) checkWritingFile(arg, errs, notes); else checkReadingFile(arg, errs, notes);
  } else {
    const c = (f) => path.join(root, 'content', f);
    checkReadingFile(c('reading.json'), errs, notes);
    checkReadingFile(c('reading-long.json'), errs, notes);
    checkWritingFile(c('writing.json'), errs, notes);
    checkToolkit(c('toolkit.json'), errs, notes);
  }
  notes.forEach((n) => console.log('ok  ', n));
  if (errs.length) { console.error('\nProblems:'); errs.forEach((e) => console.error('  -', e)); process.exit(1); }
  console.log('\nAll checks passed.');
}
