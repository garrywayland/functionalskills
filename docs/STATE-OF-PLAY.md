# Next Stop: state of play (handover)

Updated 2026-10-18. Paste the "starter prompt" at the bottom into a new chat to continue.

## What this is
A static practice site for Pearson Edexcel Functional Skills English (Level 1 and Level 2, Reading and Writing) for one learner, a capable 17-year-old who finds revision stressful. Live on GitHub Pages from `main` root (repo `garrywayland/functionalskills`). Plain HTML, CSS, vanilla JS, no build step. Content is in `/content/*.json`.

## Hard rules (never break)
- No personal data anywhere in the public repo.
- The learner's writing never leaves the browser except by explicit "Send for marking" (copy and paste into an AI chat of their choice).
- No free-tier or third-party AI services. No analytics, trackers or external fonts. localStorage only, always in try/catch. The Content-Security-Policy forbids inline styles, so no `style=` attributes in JS.
- Do not copy Pearson texts or mark schemes. Write original material calibrated against official materials (notes in `docs/exam-notes.md`). All people, organisations and towns in texts are made up.
- Design: missions, calm, no red crosses, no "exam/test/fail" wording, the learner chooses when to see marks, progress shown as missions done. Soft, tentative feedback ("one way to write it", "I would write it differently in two places").
- Giant pandas only, never red pandas. Pandas are a visible but quiet background (`img/panda-pattern.svg`, `--panda-opacity` in `css/style.css`).
- The owner is a beginner: give step-by-step instructions, keep answers short. Use Sonnet 5.5 for the session and for marking.
- Answer boxes have spell-check, autocorrect, auto-capitals and Grammarly turned off (`plain()` helper in `js/app.js`). Keep that for any new answer box.
- Everything she types or picks must survive a reload (see "Tests").
- Before finishing any task: click through every mission at both levels, check phone width and keyboard use, confirm no personal data and no new external requests.

## What exists now
| Area | State |
| --- | --- |
| Front page | "What are you into?": theme cards (a theme shows only when it has visible missions at the chosen level), "Pick one for me", My progress, and two any-theme cards (Learn by marking, Practise a skill). `#/theme/<id>` lists that theme's reading, writing and marking tasks. Nav pages Reading and Writing still list everything in folded menus by theme. |
| Themes and import | `content/index.json` lists the content files; `content/themes.json` lists 16 themes (4 have content: Pandas, Israel, Public transport, UK geography). Packs of missions written by another AI are imported with `node tools/import.mjs` as hidden "draft" missions; the footer link "Teacher view" shows them labelled "Unchecked"; `--approve` makes them live, `--remove` takes them out. Steps and a prompt for the other AI are in `docs/IMPORTING.md`; a working example is `docs/import/example-pack.json`. |
| Make a pack (`#/make`) | No server. She or you type a theme (any theme, e.g. a football club); the page writes a ready-made prompt to paste into an AI chat; she pastes the reply back; the page checks it with the same rules as `validate.mjs` (shared file `js/rules.js`, used by both the page and the Node tool) and saves it in that browser only (`localStorage` key `nextstop:mypacks`). Saved themes appear on the front page, missions are labelled "Your own", ids are namespaced `my-<theme>-<stamp>-<id>`. Packs can be downloaded (valid for `tools/import.mjs`) or deleted. The prompt tells the AI to invent all people, clubs and places and to state no facts about real ones. A damaged saved pack shows a calm error instead of breaking the site. Test: `tests/browser/make-test.js`. |
| Reading | 16 missions: 4 short, 12 long (3 texts, 15 questions, official-style layout, Level 1 and Level 2). Question types: choice, tfns, factopinion, multi, match, open (self-check model answer). |
| Writing | 24 tasks (Task 1 longer, Task 2 shorter). Steps: Task, Plan, Write, Send. On Plan and Write the task stays in view: split screen on wide screens (sticky task panel beside the work), and on phones a "Show the task" button slides the task up as a sheet (Close, button or Escape hides it). Marking is by copy and paste into an AI chat with the task, indicative content and our plain-English band summary. |
| Toolkit | 11 writing formats and 9 SPaG points, 10 practice questions each (200 in all), one question at a time in shuffled order. |
| Learn | Mark sample work: 6 tasks (Level 1: 4, Level 2: 2), 18 sample answers at three standards. She picks composition and SPaG marks, then sees ours with reasons, quotes and one target. Fix it: 5 sets of 8 sentences, one sentence at a time with Check (soft feedback: "I would write it differently in N places", her own words lightly shaded, retry as often as she likes) and Next question (skip). No answer shows until the end page ("The answers": her version, one way to write it, why). Some sentences accept alternative answers (`also`), and an extra comma is accepted outside the commas set. Source for `learn.json` is `tools/learn-src/` (edit, then `python3 tools/learn-src/build.py`). |
| Saving and coming back | Everything she types or picks is saved on the device as she goes (a note under answer boxes says so, and warns if the browser blocks storage). Front page shows "Pick up where you left off" (up to 3 unfinished reading or writing missions, newest first). "Finish later" links on reading questions and writing steps. `#/work` (My work, linked from the front page and Progress) lists her plans, drafts and written reading answers with Copy buttons. The reading Done page has "Look back at my answers". Multiple choice options (reading and toolkit) are lettered A to D. |
| Save and restore my work | On the Progress page (also when the record is empty, so a new device can restore): "Save my work to a file" downloads one JSON (`next-stop-my-work-<date>.json`: answers, drafts, plans, practice, marking, fix-it, done list, progress log, made packs; no name, not menus or teacher switch). "Restore from a file" previews what would be added, then merges: nothing is deleted; where both sides have the same mission the most recently changed copy wins and gaps are filled from the other; done lists, log entries and packs are unions; level is never changed. Bad or foreign files are refused and change nothing. Logic is in `js/backup.js` (pure, unit-tested). |
| Progress | Done missions with dates, exportable as printed page, CSV or copied text. Optional name typed at export time, never stored. Learn items count as practice sets. |
| Marking service | `server/` (Node, Cloud Run, key in Secret Manager). Tested only against a fake Anthropic server. NOT deployed. Off while `js/config.js` has `markingEndpoint: ''`. Steps in `server/README.md`. Needs the owner's go-ahead and an API key. |
| Tools | `tools/validate.mjs` (all content checks), `import.mjs` + `manifest.mjs` (packs), `draft.mjs` / `review.mjs` / `merge.mjs` (AI-assisted drafting, needs API key), `export-questions.py` (builds the review pack in `docs/question-review/`: PDF, CSV with reviewer columns, Markdown for an AI chat), `learn-src/`, `content-src/` (original content-building scripts, reference only). |

## Tests
- `node --test tests/unit/backup.test.mjs` (save/merge logic, 11), `node tools/validate.mjs` (content), `cd tools && npm test` (7), `cd server && npm test` (12; one oversized-body test was flaky once).
- Browser tests in `tests/browser/` need Playwright at `/opt/node-tools/node_modules/playwright` and the repo served with `python3 -m http.server 8766` (restart it at the start of each command; it stops between sessions).
  - `learn-test.js <folder>`: home, Learn, fix-it soft marking, phone width, keyboard.
  - `themes-test.js`: theme pages, plus a temporary copy of the site to test import, draft hiding, Teacher view and approve.
  - `make-test.js`: prompt, bad and good pastes, saving, using, downloading and deleting a made pack, parity with the shared rules.
  - `backup-test.js`: save to a file, restore on a fresh device, merge both ways, refuse bad files, phone and keyboard.
  - `persist-test.js`: every answer type survives a reload (reading, writing, toolkit, Learn).
  - `progress-test.js`, `drill-test.js`, `l2-test.js`; `e2e.js` clicks through every mission and takes more than 5 minutes (run it in the background). `menus-test.js` still expects the Writing menu on the Reading page (from line 19) and needs updating.

## Known gaps and honest caveats
- Marks on Learn samples and the band summaries are our judgement, not Pearson's. A teacher should review them (use the question review pack).
- Writing marking by AI has never run live. Some AI marks should be reviewed by a teacher.
- Open-answer model answers in reading are less checked than the closed answers.
- Level 2 has fewer reading missions and only 2 marking tasks. No reading "you are the assessor" items yet.
- Not done: stimulus-based (picture) writing tasks; photograph questions in Level 1 reading; aligning Level 1 long reading order with the official papers; importing extra toolkit questions or Learn samples (import and Make a pack cover reading and writing missions only); a way to make a saved pack permanent for everyone from the page (today: download, then `tools/import.mjs`).
- Fix-it feedback only compares her text with ours; it does not understand grammar, so unusual correct answers show as "different" and she judges them herself.
- All progress is stored in the browser only; clearing data or switching device loses it (Progress export is the backup).
- A phone gets the task as a slide-up sheet, not a fixed panel. Not yet tried on a real phone.

## Next steps, suggested order
1. Generate theme packs with another AI, either on the Make a pack page or via `docs/IMPORTING.md`; for the shared site import, read in Teacher view, approve.
2. Have a teacher or an AI chat review `docs/question-review/` and fix what they find in `/content`.
3. More Level 2 reading missions and Level 2 marking samples; reading "assess it" items for Learn.
4. Later: live AI marking (deploy `server/`, set `js/config.js`) and in-site question generation, using the same pack format and draft/approve step.

## Starter prompt for a new chat
> I'm continuing a project called Next Stop, a static practice site for Edexcel Functional Skills English for one learner. The repo is garrywayland/functionalskills. Please read `docs/STATE-OF-PLAY.md`, `docs/content-guide.md` and `docs/exam-notes.md` first, and obey the hard rules in the state of play. I'm a beginner, so give step-by-step instructions and keep answers short. Use Sonnet 5.5. My first job for this chat is: [say what you want].
