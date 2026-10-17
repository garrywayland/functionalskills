#!/usr/bin/env node
// A SEPARATE check of a drafted mission, by a fresh model call that has not seen the drafter's work.
//   1. It answers every closed question using only the texts, with the answer key hidden. Any
//      disagreement with the key is reported.
//   2. It then reviews the whole mission: facts, level, originality, tone and consistency.
// It never edits the draft. A person still reads it before it is added.
//
//   node tools/review.mjs drafts/rl-pandas-3.json
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL, makeClient, parseArgs, readText } from './lib.mjs';

const { positional } = parseArgs(process.argv.slice(2));
const file = positional[0];
if (!file || !fs.existsSync(file)) { console.error('Usage: node tools/review.mjs drafts/<id>.json'); process.exit(1); }
const { kind, mission } = JSON.parse(fs.readFileSync(file, 'utf8'));
const client = makeClient();

const BlindSchema = z.object({ answers: z.array(z.object({ id: z.string(), chosen: z.array(z.number().int()) })) });
const ReviewSchema = z.object({
  issues: z.array(z.object({ severity: z.enum(['must', 'should', 'note']), where: z.string(), problem: z.string(), suggestion: z.string() })),
  facts_to_check: z.array(z.object({ claim: z.string(), confidence: z.enum(['certain', 'likely', 'unsure']) })),
  level_ok: z.boolean(),
  level_comment: z.string(),
  originality_comment: z.string(),
});

const issues = [];
const closed = kind === 'reading-long' ? mission.questions.filter((q) => q.type === 'choice' || q.type === 'multi') : [];

// ---- Step 1: answer the closed questions blind ----
if (closed.length) {
  console.log(`Step 1 of 2: answering ${closed.length} closed questions without the key...`);
  const blind = {
    texts: mission.texts.map((t) => ({ id: t.id, title: t.title, body: t.body })),
    questions: closed.map((q) => ({ id: q.id, label: q.label, text: q.text, type: q.type, prompt: q.prompt, options: q.options })),
  };
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 16000,
    system: 'You answer reading questions using ONLY the texts given. Do not use outside knowledge.',
    messages: [{ role: 'user', content: `For each question give the 0-based index of the option you choose in "chosen". For "multi" questions choose exactly two options. Use only the texts.\n\n${JSON.stringify(blind, null, 1)}` }],
    output_config: { effort: 'high', format: zodOutputFormat(BlindSchema) },
  });
  if (!res.parsed_output) { console.error('Step 1 did not finish. Try again.'); process.exit(1); }
  const got = new Map(res.parsed_output.answers.map((a) => [a.id, [...a.chosen].sort((x, y) => x - y)]));
  for (const q of closed) {
    const key = (Array.isArray(q.answer) ? [...q.answer] : [q.answer]).sort((x, y) => x - y);
    const mine = got.get(q.id);
    if (!mine) issues.push({ severity: 'must', where: `question ${q.label}`, problem: 'The independent reader did not answer this question.', suggestion: 'Check the question is clear.' });
    else if (mine.join() !== key.join()) issues.push({ severity: 'must', where: `question ${q.label}`, problem: `An independent reader chose option(s) ${mine.join(', ')} but the key says ${key.join(', ')}.`, suggestion: 'Re-read the text. Either the key is wrong, or the question or options are unclear.' });
  }
  console.log(`  ${closed.length - issues.length} of ${closed.length} agree with the key.`);
}

// ---- Step 2: review everything ----
console.log(`Step ${closed.length ? '2 of 2' : '1 of 1'}: reviewing the whole mission...`);
const notes = readText('docs', 'exam-notes.md');
const rules = [
  'Check each of these and report problems:',
  '- FACTS: list every real-world factual claim in the texts and say how sure you are it is correct (certain, likely, unsure). Fictional organisations, people and UK towns are fine; real facts must be certain and not time-sensitive.',
  '- CONSISTENCY: the texts must not contradict each other or themselves, and each question must be answerable from the text it names.',
  '- QUESTIONS: for every "open" question, is the model answer supported by the text, and is each tick-list item something a learner can check? Are wrong options plausible but clearly wrong? Is each "why" correct?',
  '- LEVEL: are the texts straightforward and readable at Level 1 (short sentences, familiar words, a few specialist words), and are the questions the right difficulty? Set level_ok accordingly.',
  '- TOPIC RULES: Pandas means giant pandas only (never red pandas). Israel is neutral: travel, nature, food and everyday life only, no politics, conflict or security. Organisations and UK places are made up.',
  '- WORDS: learner-facing text must not contain "exam", "test" or "fail".',
  '- ORIGINALITY: does anything look copied or closely imitated from a published text or paper? Comment in originality_comment.',
  '- TONE: calm, respectful, free of stereotypes.',
  'Use severity "must" for anything that would teach or mark something wrongly, "should" for improvements, "note" for small things.',
].join('\n');
const res2 = await client.messages.parse({
  model: MODEL, max_tokens: 16000,
  system: 'You are a careful, sceptical reviewer of Functional Skills English practice material.',
  messages: [{ role: 'user', content: `${rules}\n\nBackground on the real paper:\n${notes}\n\nThe ${kind} draft to review:\n${JSON.stringify(mission, null, 1)}` }],
  output_config: { effort: 'high', format: zodOutputFormat(ReviewSchema) },
});
if (!res2.parsed_output) { console.error('The review did not finish. Try again.'); process.exit(1); }
const r = res2.parsed_output;
issues.push(...r.issues);
for (const f of r.facts_to_check) {
  if (f.confidence === 'unsure') issues.push({ severity: 'must', where: 'fact', problem: `Not sure this is true: ${f.claim}`, suggestion: 'Check it, or change or remove it.' });
  else if (f.confidence === 'likely') issues.push({ severity: 'should', where: 'fact', problem: `Probably true, but check: ${f.claim}`, suggestion: 'Confirm from a reliable source.' });
}
if (!r.level_ok) issues.push({ severity: 'must', where: 'level', problem: r.level_comment, suggestion: 'Simplify the texts or questions.' });

const verdict = issues.some((i) => i.severity === 'must') ? 'fix' : 'pass';
const out = file.replace(/\.json$/, '.review.json');
fs.writeFileSync(out, JSON.stringify({ verdict, model: MODEL, date: new Date().toISOString().slice(0, 10), issues, facts_to_check: r.facts_to_check, level_comment: r.level_comment, originality_comment: r.originality_comment }, null, 2) + '\n');

console.log(`\nVerdict: ${verdict.toUpperCase()}`);
for (const sev of ['must', 'should', 'note']) {
  const list = issues.filter((i) => i.severity === sev);
  if (!list.length) continue;
  console.log(`\n${sev.toUpperCase()} (${list.length})`);
  list.forEach((i) => console.log(`  - [${i.where}] ${i.problem}\n      Try: ${i.suggestion}`));
}
console.log(`\nLevel: ${r.level_comment}\nOriginality: ${r.originality_comment}`);
console.log(`\nSaved ${path.relative(process.cwd(), out)}.`);
if (verdict === 'fix') console.log('Fix the MUST items (edit the draft, or draft again), then review again.');
else console.log('No MUST items. Read the draft yourself before merging it.');

process.exit(0);
