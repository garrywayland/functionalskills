// Shared helpers for the drafting tools.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { root } from './validate.mjs';
import { themeNames, allMissions } from './manifest.mjs';

export const MODEL = process.env.MODEL || 'claude-opus-5-5';
export const TOPICS = themeNames();
export const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function makeClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. See tools/README.md for how to set it without pasting it anywhere public.');
    process.exit(1);
  }
  return new Anthropic({ timeout: 15 * 60 * 1000 });
}

export { parseArgs } from './lib-args.mjs';

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
  return new Set(allMissions().map((x) => x.id));
}

// "rl-pandas" is the first, then "rl-pandas-2", "rl-pandas-3" and so on.
export function nextId(prefix) {
  const ids = existingIds();
  if (!ids.has(prefix)) return prefix;
  for (let n = 2; ; n++) if (!ids.has(`${prefix}-${n}`)) return `${prefix}-${n}`;
}
