// The content rules, shared by the checking tool (tools/validate.mjs, Node) and the "Make a pack" page (browser).
// One file, so a pack that passes on the page passes on the command line, and the other way round.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NextStopRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

// Longer missions follow the official layouts.
// Level 1: Q1-3 (Text A), Q4-9 (Text B), Q10-14 (Text C), Q15 (B and C); 30 marks.
// Level 2: Q1-4, Q5-8, Q9-11, Q12-15 (more than one text); 35 marks. Level 2 text lengths are
// taken from the official sample paper and two practice papers (about 285 to 420 words, getting longer).
const TEXT_RANGES = { A: [80, 100], B: [300, 320], C: [200, 220] };
const SECTION_MARKS = [5, 12, 10, 3];
const TEXT_RANGES_L2 = { A: [280, 330], B: [345, 400], C: [370, 420] };
const SECTION_MARKS_L2 = [7, 9, 7, 12];
const SECTION_BOUNDS = { L1: [[1, 3], [4, 9], [10, 14], [15, 15]], L2: [[1, 4], [5, 8], [9, 11], [12, 15]] };

const stripMarks = (t) => String(t).replace(/\*\*/g, '');
const countWords = (t) => stripMarks(t).split(/\s+/).filter(Boolean).length;

function textWords(text) {
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
  need(['choice', 'tfns', 'factopinion', 'multi', 'match', 'open'].includes(q.type), `unknown type ${q.type}`);
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
  if (q.type === 'match') {
    need(Array.isArray(q.items) && q.items.length >= 2 && Number.isInteger(q.paragraphs), 'needs items and paragraphs');
    need((q.items || []).every((it) => it.label && Number.isInteger(it.answer) && it.answer >= 1 && it.answer <= q.paragraphs), 'item answer out of range');
    need((q.items || []).some((it) => !it.given), 'needs at least one item for the learner to place');
    need(new Set((q.items || []).map((it) => it.answer)).size === (q.items || []).length, 'two items share a paragraph');
    need(q.why, 'missing why');
  }
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

function checkReadingMission(m, name, errs, notes) {
  const where = `${name} ${m.id}`;
  const textIds = m.texts.map((t) => t.id);
  m.questions.forEach((q) => checkQuestion(where, q, textIds, errs));
  const qids = m.questions.map((q) => q.id);
  if (new Set(qids).size !== qids.length) errs.push(`${where}: duplicate question id`);
  if (m.length === 'long') {
    const lvl = (m.levels || []).includes('L2') ? 'L2' : 'L1';
    const ranges = lvl === 'L2' ? TEXT_RANGES_L2 : TEXT_RANGES;
    const wantMarks = lvl === 'L2' ? SECTION_MARKS_L2 : SECTION_MARKS;
    if (textIds.join('') !== 'ABC') errs.push(`${where}: long missions need texts A, B and C`);
    for (const t of m.texts) {
      const n = textWords(t); const r = ranges[t.id];
      if (r && (n < r[0] || n > r[1])) errs.push(`${where}: Text ${t.id} has ${n} words (needs ${r[0]} to ${r[1]})`);
    }
    const num = (q) => parseInt(String(q.label || '').split('(')[0], 10);
    const sum = (lo, hi) => m.questions.filter((q) => num(q) >= lo && num(q) <= hi).reduce((a, q) => a + (q.marks || 0), 0);
    const got = SECTION_BOUNDS[lvl].map(([lo, hi]) => sum(lo, hi));
    if (got.join() !== wantMarks.join()) errs.push(`${where}: section marks ${got.join('/')} (needs ${wantMarks.join('/')})`);
    const numbers = new Set(m.questions.map(num));
    if (numbers.size !== 15) errs.push(`${where}: has ${numbers.size} numbered questions (needs 15)`);
    if (!m.questions.every((q) => q.label && q.marks)) errs.push(`${where}: every question needs a label and marks`);
    notes.push(`${where} (${lvl}): ${m.texts.map((t) => textWords(t)).join('/')} words, ${m.questions.reduce((a, q) => a + (q.marks || 0), 0)} marks`);
  } else {
    notes.push(`${where}: ${m.questions.length} questions`);
  }
}

function checkWritingMission(m, formats, errs, name) {
  const where = `${name || 'writing.json'} ${m.id}`;
  if (!formats.has(m.format)) errs.push(`${where}: format "${m.format}" is not one of the formats the site knows (${[...formats].join(', ')})`);
  const want = m.task === 1 ? 3 : 2;
  const sets = [m.bullets, ...Object.values(m.levels || {}).map((l) => l.bullets).filter(Boolean)];
  for (const b of sets) if (!Array.isArray(b) || b.length !== want) errs.push(`${where}: Task ${m.task} needs ${want} bullet points, has ${b ? b.length : 0}`);
  for (const k of ['context', 'audience', 'purpose', 'instruction']) if (!m[k]) errs.push(`${where}: missing ${k}`);
  if (!Array.isArray(m.indicative) || m.indicative.length !== (m.bullets || []).length) errs.push(`${where}: needs one indicative-content entry for each bullet point`);
  if (![1, 2].includes(m.task)) errs.push(`${where}: task must be 1 or 2`);
}

// A pack: { "pack": "football-1", "reading": [missions], "writing": [missions] }.
// opts: { themeNames (checked by name, optional), taken (ids already used), formats (Set of format ids) }
function checkPackData(data, name, errs, notes, opts) {
  opts = opts || {};
  const themeNames = opts.themeNames; const formats = opts.formats || new Set();
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errs.push(`${name}: needs to be one JSON object with "reading" and/or "writing" lists`); return; }
  if (!data.reading && !data.writing) errs.push(`${name}: needs a "reading" list, a "writing" list, or both`);
  if (data.reading && !Array.isArray(data.reading)) errs.push(`${name}: "reading" must be a list`);
  if (data.writing && !Array.isArray(data.writing)) errs.push(`${name}: "writing" must be a list`);
  const ids = new Set(opts.taken || []);
  const each = (list, kind, check) => {
    if (!Array.isArray(list)) return;
    for (const m of list) {
      if (!m || typeof m !== 'object') { errs.push(`${name}: a ${kind} mission is not an object`); continue; }
      if (!m.id) { errs.push(`${name}: a ${kind} mission has no id`); continue; }
      if (ids.has(m.id)) errs.push(`${name} ${m.id}: this id is already used`);
      ids.add(m.id);
      if (themeNames && !themeNames.includes(m.topic)) errs.push(`${name} ${m.id}: topic "${m.topic}" is not a known theme (${themeNames.join(', ')})`);
      if (!m.topic) errs.push(`${name} ${m.id}: missing topic`);
      if (m.status !== undefined && m.status !== 'draft') errs.push(`${name} ${m.id}: status can only be "draft" or left out`);
      if (!m.title) errs.push(`${name} ${m.id}: missing title`);
      check(m);
    }
  };
  each(data.reading, 'reading', (m) => {
    if (!Array.isArray(m.texts) || !m.texts.length || !Array.isArray(m.questions) || !m.questions.length) { errs.push(`${name} ${m.id}: needs texts and questions`); return; }
    if (m.texts.some((t) => !t || !t.id || !Array.isArray(t.body))) { errs.push(`${name} ${m.id}: every text needs an id and a body list`); return; }
    checkReadingMission(m, name, errs, notes);
  });
  each(data.writing, 'writing', (m) => checkWritingMission(m, formats, errs, name));
  notes.push(`${name}: ${(data.reading || []).length} reading and ${(data.writing || []).length} writing missions`);
}

  return { TEXT_RANGES, SECTION_MARKS, TEXT_RANGES_L2, SECTION_MARKS_L2, SECTION_BOUNDS, textWords, checkReadingMission, checkWritingMission, checkPackData };
});
