#!/usr/bin/env node
// Adds a reviewed draft to the website's content. It will only run if you say you have read the draft.
//   node tools/merge.mjs drafts/rl-pandas-3.json --i-have-read-it
import fs from 'node:fs';
import path from 'node:path';
import { checkReadingFile, checkWritingFile, checkToolkit, checkReadingMission, checkWritingMission, readFormats, root } from './validate.mjs';
import { parseArgs, read, existingIds } from './lib.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const file = positional[0];
if (!file || !fs.existsSync(file)) { console.error('Usage: node tools/merge.mjs drafts/<id>.json --i-have-read-it'); process.exit(1); }
if (!flags['i-have-read-it']) {
  console.error('Read the draft first: every question, every answer and every text. Then run this again with --i-have-read-it.');
  process.exit(1);
}
const { kind, mission } = JSON.parse(fs.readFileSync(file, 'utf8'));
const reviewFile = file.replace(/\.json$/, '.review.json');
if (!flags['skip-review']) {
  if (!fs.existsSync(reviewFile)) { console.error('There is no review yet. Run tools/review.mjs first (or add --skip-review if you really mean it).'); process.exit(1); }
  const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
  if (review.verdict !== 'pass') { console.error('The review found problems that must be fixed first. See ' + reviewFile); process.exit(1); }
}

const errs = []; const notes = [];
if (kind === 'reading-long') checkReadingMission(mission, 'draft', errs, notes); else checkWritingMission(mission, readFormats(), errs);
if (existingIds().has(mission.id)) errs.push(`${mission.id} is already in the content.`);
if (errs.length) { console.error('Not merged:'); errs.forEach((e) => console.error('  -', e)); process.exit(1); }

const target = path.join(root, 'content', kind === 'reading-long' ? 'reading-long.json' : 'writing.json');
const data = JSON.parse(fs.readFileSync(target, 'utf8'));
// Keep missions of the same topic together.
let at = data.missions.length;
for (let i = data.missions.length - 1; i >= 0; i--) if (data.missions[i].topic === mission.topic) { at = i + 1; break; }
data.missions.splice(at, 0, mission);
fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');

const all = []; const n2 = [];
checkReadingFile(path.join(root, 'content', 'reading.json'), all, n2);
checkReadingFile(path.join(root, 'content', 'reading-long.json'), all, n2);
checkWritingFile(path.join(root, 'content', 'writing.json'), all, n2);
checkToolkit(path.join(root, 'content', 'toolkit.json'), all, n2);
if (all.length) { console.error('Problems after merging:'); all.forEach((e) => console.error('  -', e)); process.exit(1); }
console.log(`Added ${mission.id} to ${path.relative(root, target)}. All content checks pass.`);
console.log('Next: look at it on the site, then commit and push.');
