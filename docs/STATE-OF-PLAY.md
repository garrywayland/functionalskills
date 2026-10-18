# Next Stop: state of play (handover)

Written 2026-10-18. Paste the "starter prompt" at the bottom into a new chat to continue.

## What this is
A static practice site for Pearson Edexcel Functional Skills English (Level 1 and Level 2, Reading and Writing) for one learner, a capable 17-year-old who finds revision stressful. Live on GitHub Pages from `main` root (repo `garrywayland/functionalskills`). Plain HTML, CSS, vanilla JS, no build step. Content is in `/content/*.json`.

## Hard rules (never break)
- No personal data anywhere in the public repo.
- The learner's writing never leaves the browser except by explicit "Send for marking" (copy and paste into an AI chat of their choice).
- No free-tier or third-party AI services. No analytics, trackers or external fonts. localStorage only, always in try/catch.
- Do not copy Pearson texts or mark schemes. Write original material calibrated against official materials (notes in `docs/exam-notes.md`).
- Design: missions, calm, no red crosses, no "exam/test/fail" wording, the learner chooses when to see marks, progress shown as missions done.
- Giant pandas only, never red pandas. Pandas appear only as a faint background.
- The owner is a beginner: give step-by-step instructions. Use Sonnet 5.5 for the session and for marking.
- Before finishing any task: click through every mission at both levels, check phone width and keyboard use, confirm no personal data and no new external requests.

## What exists now
| Area | State |
| --- | --- |
| Home | Pick a theme first (cards, shown only when a theme has missions at the chosen level), then a theme page lists its reading, writing and marking tasks. "Pick one for me" and My progress sit underneath, with two any-theme cards (Learn by marking, Practise a skill). Reading and Writing nav pages still show everything in folded menus by theme. |
| Themes and import | `content/index.json` lists the content files; `content/themes.json` lists themes (16 defined, 4 with content). Packs of AI-written missions are imported with `node tools/import.mjs` as hidden "draft" missions; Teacher view (footer link) shows them as "Unchecked"; `--approve` makes them live. Full steps and a prompt for the other AI in `docs/IMPORTING.md`; a working example is `docs/import/example-pack.json`. |
| Reading | 16 missions: 4 short, 12 long (3 texts, 15 or so questions, official-style layout). Level 1 and Level 2. Question types: choice, tfns, factopinion, multi, match, open (self-check model answer). |
| Writing | 24 tasks (Task 1 longer, Task 2 shorter), each with plan, write and send steps. Marking is by copy-and-paste into an AI chat, with the task, indicative content and our plain-English band summary included. |
| Toolkit | 11 writing formats and 9 SPaG points (7 at Level 1), 10 practice questions each (200 in all). |
| Learn (new) | Mark sample work: 6 tasks, 18 sample answers at three standards (Level 1: 4 tasks, Level 2: 2 tasks). The learner gives composition and SPaG marks, then sees ours with reasons, quotes and one target. Fix it: 5 sets of 8 sentences. |
| Progress | Done missions with dates, exportable as printed page, CSV or copied text. Optional name typed at export time, never stored. Learn items count as practice sets. |
| Marking service | `server/` (Node, Cloud Run, key in Secret Manager). Tested only against a fake Anthropic server. NOT deployed. Switched off while `js/config.js` has `markingEndpoint: ''`. Deployment steps in `server/README.md`. |
| Tools | `tools/validate.mjs` (content checks; run `node tools/validate.mjs`), `draft.mjs`, `review.mjs`, `merge.mjs` (AI-assisted drafting of new missions, needs an API key), `export-questions.py` (builds the review pack), `learn-src/` (source for learn.json; edit then run `python3 tools/learn-src/build.py`), `content-src/` (original content-building scripts, reference only). |
| Tests | `node tools/validate.mjs`; `cd tools && npm test` (5); `cd server && npm test` (12; the oversized-body test was flaky once); browser click-throughs in `tests/browser/` (serve the repo with `python3 -m http.server 8766`, then `node tests/browser/learn-test.js <folder>`; others: e2e, progress-test, menus-test, l2-test, drill-test; they need Playwright at `/opt/node-tools/node_modules/playwright`). |

## Known gaps and honest caveats
- Marks on Learn samples and the Level 1/2 band summaries are our judgement, not Pearson's. They need review by a teacher.
- Writing marking by AI has never been run live. Some AI marks should be reviewed by a teacher.
- Reading closed answers were hand-checked; open-answer model answers less so. Use the question review pack.
- Level 2 reading has fewer missions than Level 1.
- Learn has no reading "you are the assessor" items yet, and Level 2 has only two marking tasks.
- Not done: stimulus-based (picture) writing tasks; photograph questions in Level 1 reading; aligning Level 1 long reading order with the official papers.
- `tests/browser/menus-test.js` still expects the Writing menu on the Reading page (from line 19) and needs updating; the other browser tests pass. `e2e.js` takes several minutes.

## Next steps, in suggested order
0. Generate theme packs with another AI (`docs/IMPORTING.md`), import, review in Teacher view, approve.
1. Review the question pack (`docs/question-review/`) with a teacher or an AI chat; fix what they find in `/content`.
2. More Level 2 reading missions and Level 2 marking samples.
3. Reading "assess it" items for the Learn section.
4. Decide on live AI marking (deploy `server/`, then set `js/config.js`). Needs the owner's go-ahead and an API key.

## Starter prompt for a new chat
> I'm continuing a project called Next Stop, a static practice site for Edexcel Functional Skills English for one learner. The repo is garrywayland/functionalskills. Please read `docs/STATE-OF-PLAY.md`, `docs/content-guide.md` and `docs/exam-notes.md` first, and obey the hard rules in the state of play. I'm a beginner, so give step-by-step instructions and keep answers short. Use Sonnet 5.5. My first job for this chat is: [say what you want].
