#!/usr/bin/env node
// Drafts a new mission with Claude, checks it with tools/validate.mjs, and fixes mistakes by asking again.
// The result goes to drafts/ for a person to read. Nothing is added to the website here.
//
//   node tools/draft.mjs reading-long --topic "Public transport" --theme "a new night bus" --feature "text box"
//   node tools/draft.mjs writing --topic Pandas --task 2 --format review
import fs from 'node:fs';
import path from 'node:path';
import { checkReadingMission, checkWritingMission, readFormats, TEXT_RANGES, SECTION_MARKS } from './validate.mjs';
import { MODEL, TOPICS, slug, makeClient, parseArgs, extractJson, textOf, read, readText, draftsDir, nextId } from './lib.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const kind = positional[0];
if (!['reading-long', 'writing'].includes(kind) || !TOPICS.includes(flags.topic)) {
  console.error(`Usage:
  node tools/draft.mjs reading-long --topic "<topic>" [--theme "<idea>"] [--feature "<text box | bold words | speech bubble | bullet points | numbered list | menu | subheadings>"]
  node tools/draft.mjs writing --topic "<topic>" --task <1|2> --format <format id> [--theme "<idea>"]
Topics: ${TOPICS.join(', ')}`);
  process.exit(1);
}

const RULES = `Hard rules for every piece of content:
- Write original text. Never reproduce or closely imitate any Pearson paper, mark scheme or other published text.
- Use made-up organisations, people and UK towns. A real-world fact is allowed only if you are certain it is correct and it will not go out of date.
- Topics: Pandas means GIANT pandas only (never red pandas). Israel: travel, nature, landscape, transport, food and everyday life, kept neutral, with no politics, conflict or security content. Public transport. UK geography, especially social geography.
- Plain British English for Level 1 learners aged about 17. No personal data of any real person.
- In text meant for the learner, never use the words "exam", "test" or "fail".`;

function readingPrompt() {
  const example = read('content', 'reading-long.json').missions[0];
  return `${RULES}

You are drafting one LONGER Level 1 reading mission for a practice website, laid out like the real Level 1 reading paper:
- Three texts linked by one theme, in three DIFFERENT formats (for example: leaflet, web page, article, blog, email, review, forum post, report, letter, notice).
- Text A: ${TEXT_RANGES.A[0]} to ${TEXT_RANGES.A[1]} words. Text B: ${TEXT_RANGES.B[0]} to ${TEXT_RANGES.B[1]} words. Text C: ${TEXT_RANGES.C[0]} to ${TEXT_RANGES.C[1]} words. Count the title and every heading, list item and box too.
- Exactly 15 numbered questions (1(a) and 1(b) are one question, 2(a) and 2(b) are one question), worth ${SECTION_MARKS.join(', ')} marks across Text A (Q1 to 3), Text B (Q4 to 9), Text C (Q10 to 14) and the B-and-C comparison (Q15). 30 marks in total.
- Question pattern, as in the example: 1(a) find a piece of information, 1(b) name the layout feature, 2(a) and 2(b) word meanings, 3 main purpose; then for B: a 3-mark retrieval question, a 2-mark explanation, a punctuation question, a 2-mark question, a "choose TWO facts" question, a 2-mark specialist-words question; then for C: a 2-mark question, a "best sums up the view" question, a 3-mark advice question, a language question (informal, formal, persuasive or opinion words), and a 2-mark "who is it for, with a clue" question; then Q15, a 3-mark comparison of B and C.
- Each Text A uses ONE layout feature that Q1(b) asks about. ${flags.feature ? `Use this one: ${flags.feature}.` : 'Choose a feature that the existing missions use less often.'} Blocks allowed in text bodies: {"p": "..."}, {"h": "..."}, {"ul": [...]}, {"ol": [...]}, {"box": "..."} (text box), {"callout": "..."} (speech bubble). Put **double asterisks** around bold words.
- Question types: "choice" (options array, answer = 0-based index, why), "multi" ("choose TWO": options, answer = array of indexes, marks = 2, why) and "open" (model answer, check list). Every question needs "id", "levels": ["L1"], "type", "text" ("A", "B", "C" or "B,C"), "label", "marks" and "prompt". Put the correct choice in different positions across the questions.
- Every fact and opinion question must be checkable from the text alone.

Return ONE JSON object in a \`\`\`json fence and nothing else. It must have the same shape as this example (the example's wording is NOT to be reused):

${JSON.stringify(example, null, 1)}

${flags.theme ? `Theme to use: ${flags.theme}` : 'Choose a fresh theme for this topic that the example does not use.'}
Topic: ${flags.topic}`;
}

function writingPrompt() {
  const formats = [...readFormats()].join(', ');
  const task = Number(flags.task) === 2 ? 2 : 1;
  const example = read('content', 'writing.json').missions.find((m) => m.task === task);
  return `${RULES}

You are drafting one WRITING task for a practice website, in the style of Pearson Edexcel Functional Skills English writing.
- Task ${task}: ${task === 1 ? 'the longer task, with exactly THREE bullet points' : 'the shorter task, with exactly TWO bullet points'}.
- "format" must be exactly one of: ${formats}${flags.format ? `. Use: ${flags.format}` : ''}.
- Give a context, an audience, a purpose, an instruction and the bullet points. The bullet points tell the writer what to cover. Keep the task realistic and doable in about ${task === 1 ? '35' : '25'} minutes.
- Optional "info" (a short list of facts the writer may use) is allowed when the task needs it.
- Optional "levels": {"L2": {"bullets": [...]}} lets Level 2 have slightly more demanding bullet points.

Return ONE JSON object in a \`\`\`json fence and nothing else, in the same shape as this example (do not reuse its wording):

${JSON.stringify(example, null, 1)}

${flags.theme ? `Theme to use: ${flags.theme}` : 'Choose a fresh scenario for this topic that the example does not use.'}
Topic: ${flags.topic}`;
}

function check(mission) {
  const errs = []; const notes = [];
  if (kind === 'reading-long') checkReadingMission(mission, 'draft', errs, notes);
  else checkWritingMission(mission, readFormats(), errs);
  return { errs, notes };
}

function fixUp(mission) {
  if (kind === 'reading-long') {
    mission.id = nextId(`rl-${slug(flags.topic)}`);
    mission.topic = flags.topic; mission.length = 'long'; mission.minutes = 35; mission.levels = ['L1'];
    for (const t of mission.texts) t.levels = ['L1'];
    for (const q of mission.questions) q.levels = ['L1'];
  } else {
    mission.id = nextId(`w-${slug(flags.topic)}-t${Number(flags.task) === 2 ? 2 : 1}`);
    mission.topic = flags.topic; mission.task = Number(flags.task) === 2 ? 2 : 1;
  }
  return mission;
}

const client = makeClient();
const messages = [{ role: 'user', content: kind === 'reading-long' ? readingPrompt() : writingPrompt() }];
let mission = null; let lastErrs = [];

for (let round = 1; round <= 4; round++) {
  console.log(round === 1 ? `Drafting with ${MODEL} (this can take a few minutes)...` : `Asking for fixes (round ${round - 1} of 3)...`);
  const stream = client.messages.stream({
    model: MODEL, max_tokens: 32000, system: 'You write careful, original practice material for adult learners. Reply with the JSON object only.',
    output_config: { effort: 'high' }, messages,
  });
  const reply = await stream.finalMessage();
  if (reply.stop_reason === 'refusal') { console.error('The model declined this request. Try a different theme.'); process.exit(1); }
  if (reply.stop_reason === 'max_tokens') { console.error('The reply was cut off. Try again, or choose a simpler theme.'); process.exit(1); }
  messages.push({ role: 'assistant', content: reply.content });
  let problems;
  try { mission = fixUp(extractJson(textOf(reply))); problems = check(mission).errs; }
  catch (e) { problems = [`The reply was not valid JSON (${e.message}). Return the full JSON object again.`]; mission = null; }
  lastErrs = problems;
  if (!problems.length) break;
  console.log('Problems found:'); problems.forEach((p) => console.log('  -', p));
  if (round < 4) messages.push({ role: 'user', content: `The automatic checks found these problems:\n${problems.map((p) => '- ' + p).join('\n')}\n\nFix them and return the complete corrected JSON object again, in a json fence. Keep everything else the same unless it must change.` });
}

if (!mission || lastErrs.length) { console.error('\nCould not produce a draft that passes the checks. Nothing was saved.'); process.exit(1); }

const file = path.join(draftsDir(), `${mission.id}.json`);
fs.writeFileSync(file, JSON.stringify({ kind, mission }, null, 2) + '\n');
console.log(`\nSaved ${path.relative(process.cwd(), file)}. It passes the automatic checks.`);
console.log('\nNext:');
console.log(`  1. node tools/review.mjs ${path.relative(process.cwd(), file)}   (a separate AI check of the answer keys, facts and level)`);
console.log('  2. Read the draft yourself.');
console.log(`  3. node tools/merge.mjs ${path.relative(process.cwd(), file)} --i-have-read-it`);

process.exit(0);
