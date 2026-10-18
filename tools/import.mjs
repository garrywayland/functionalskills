#!/usr/bin/env node
// Imports a pack of missions (for example written by another AI) into the site, as UNCHECKED drafts.
//   node tools/import.mjs path/to/football-1.json                 check it, then add it as a draft
//   node tools/import.mjs path/to/football-1.json --check-only    only check it, change nothing
//   node tools/import.mjs path/to/football-1.json --add-theme "Football" --blurb "Matches, fans and clubs."
//   node tools/import.mjs --approve football-1                    after a person has read it: remove the draft label
//   node tools/import.mjs --remove football-1                     take a pack out again
// Drafts are hidden from the learner. Teacher view (a link in the page footer) shows them with an "Unchecked" label.
import fs from 'node:fs';
import path from 'node:path';
import { checkPack, root } from './validate.mjs';
import { loadManifest, saveManifest, contentDir, readJson, themes, allMissions } from './manifest.mjs';
import { parseArgs } from './lib-args.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const slugOf = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fail = (lines) => { console.error([].concat(lines).join('\n')); process.exit(1); };
const packPath = (name) => path.join(contentDir(), 'packs', name + '.json');

function parseLoose(text) {
  try { return JSON.parse(text); } catch (e) { /* the AI may have wrapped it in a code fence or added a sentence */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

if (flags.approve || flags.remove) {
  const name = String(flags.approve || flags.remove);
  const man = loadManifest(); const rel = `packs/${name}.json`;
  if (!man.packs.includes(rel)) fail(`There is no pack called "${name}". Packs now: ${man.packs.map((p) => path.basename(p, '.json')).join(', ') || '(none)'}`);
  if (flags.remove) {
    man.packs = man.packs.filter((p) => p !== rel); saveManifest(man); fs.rmSync(packPath(name), { force: true });
    console.log(`Removed ${name}.`); process.exit(0);
  }
  const data = readJson(packPath(name));
  for (const m of [...(data.reading || []), ...(data.writing || [])]) delete m.status;
  fs.writeFileSync(packPath(name), JSON.stringify(data, null, 2) + '\n');
  console.log(`Approved ${name}: its missions are now visible to the learner. Commit and push to publish.`); process.exit(0);
}

const file = positional[0];
if (!file || !fs.existsSync(file)) fail('Usage: node tools/import.mjs <pack file> [--check-only] [--add-theme "Name" --blurb "One line."]\n       node tools/import.mjs --approve <pack name>');
let data;
try { data = parseLoose(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`That file is not valid JSON (${e.message}). Ask the AI to send only the JSON.`); }
const name = slugOf(flags.name || data.pack || path.basename(file, '.json'));
if (!name) fail('The pack needs a name: add a "pack" field, or use --name football-1.');

if (flags['add-theme']) {
  const nm = String(flags['add-theme']);
  const file2 = path.join(contentDir(), loadManifest().themes);
  const t = readJson(file2);
  if (!t.themes.some((x) => x.name === nm)) {
    if (typeof flags.blurb !== 'string') fail('A new theme needs a one-line description: add --blurb "Matches, fans and clubs."');
    t.themes.push({ id: slugOf(nm), name: nm, blurb: flags.blurb });
    if (!flags['check-only']) fs.writeFileSync(file2, JSON.stringify(t, null, 2) + '\n');
    console.log(`Theme added: ${nm}`);
  }
}

const man = loadManifest();
const rel = `packs/${name}.json`;
if (man.packs.includes(rel) && !flags.replace) fail(`A pack called "${name}" is already imported. Use --replace to overwrite it, or --name to call this one something else.`);
// ids already used by everything except the pack we are replacing
const taken = new Set(allMissions().filter((x) => x.file !== rel).map((x) => x.id));
const tmp = path.join(contentDir(), 'packs', `.check-${process.pid}.json`);
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, JSON.stringify(data));
const errs = []; const notes = [];
const names = flags['add-theme'] && !themes().some((x) => x.name === flags['add-theme']) ? [...themes().map((x) => x.name), flags['add-theme']] : themes().map((x) => x.name);
try { checkPack(tmp, errs, notes, { themeNames: names, taken }); } finally { fs.rmSync(tmp, { force: true }); }
if (errs.length) fail(['Not imported. Please fix these and try again:', ...errs.map((e) => '  - ' + e.replace(path.basename(tmp), name))]);
notes.forEach((n) => console.log('ok  ', n.replace(path.basename(tmp), name)));
if (flags['check-only']) { console.log('\nAll checks passed. Nothing was changed (--check-only).'); process.exit(0); }

const draft = !flags.reviewed;
for (const m of [...(data.reading || []), ...(data.writing || [])]) { if (draft) m.status = 'draft'; else delete m.status; }
data.pack = name;
fs.writeFileSync(packPath(name), JSON.stringify(data, null, 2) + '\n');
if (!man.packs.includes(rel)) { man.packs.push(rel); saveManifest(man); }
console.log(`\nImported ${name}${draft ? ' as an unchecked draft (hidden from the learner)' : ''}.`);
console.log(draft ? `Next: switch on teacher view in the page footer to read it. When happy: node tools/import.mjs --approve ${name}` : 'Next: commit and push.');
