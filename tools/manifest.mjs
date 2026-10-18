// Reads content/index.json so every tool agrees on which files make up the site.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './validate.mjs';

export const contentDir = () => path.join(root, 'content');
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const manifestPath = () => path.join(contentDir(), 'index.json');
export const loadManifest = () => readJson(manifestPath());
export const saveManifest = (m) => fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + '\n');
export const themes = () => readJson(path.join(contentDir(), loadManifest().themes)).themes;
export const themeNames = () => themes().map((t) => t.name);

// Every mission that is on the site now: [{ id, kind: 'reading' | 'writing', file, mission }]
export function allMissions() {
  const m = loadManifest(); const out = [];
  for (const f of m.reading) for (const x of readJson(path.join(contentDir(), f)).missions) out.push({ id: x.id, kind: 'reading', file: f, mission: x });
  for (const f of m.writing) for (const x of readJson(path.join(contentDir(), f)).missions) out.push({ id: x.id, kind: 'writing', file: f, mission: x });
  for (const f of m.packs) {
    const p = readJson(path.join(contentDir(), f));
    for (const x of p.reading || []) out.push({ id: x.id, kind: 'reading', file: f, mission: x });
    for (const x of p.writing || []) out.push({ id: x.id, kind: 'writing', file: f, mission: x });
  }
  return out;
}
