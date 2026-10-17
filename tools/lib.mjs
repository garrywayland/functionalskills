// Shared helpers for the drafting tools.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { root } from './validate.mjs';

export const MODEL = process.env.MODEL || 'claude-opus-5-5';
export const TOPICS = ['Pandas', 'Israel', 'Public transport', 'UK geography'];
export const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function makeClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. See tools/README.md for how to set it without pasting it anywhere public.');
    process.exit(1);
  }
  return new Anthropic({ timeout: 15 * 60 * 1000 });
}

// Reads  --name value  pairs. Flags with no value (like --i-have-read-it) become true.
export function parseArgs(argv) {
  const positional = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = true;
      else { flags[a.slice(2)] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

// Finds the JSON object in a reply, whether or not it is in a ```json fence.
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

export const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
export const read = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8'));
export const readText = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
export const draftsDir = () => { const d = path.join(root, 'drafts'); fs.mkdirSync(d, { recursive: true }); return d; };

export function existingIds() {
  const ids = new Set();
  for (const f of ['reading.json', 'reading-long.json', 'writing.json']) for (const m of read('content', f).missions) ids.add(m.id);
  return ids;
}

// "rl-pandas" is the first, then "rl-pandas-2", "rl-pandas-3" and so on.
export function nextId(prefix) {
  const ids = existingIds();
  if (!ids.has(prefix)) return prefix;
  for (let n = 2; ; n++) if (!ids.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
}
