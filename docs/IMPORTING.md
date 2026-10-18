# Importing new questions

How new themes and missions get onto the site. No coding needed: you give another AI the prompt below, then either paste its answer to Claude Code ("import this") or run one command.

## The idea
- A **theme** is a topic on the front page (Pandas, Football, Music...). The list is in `content/themes.json`. A theme only appears once it has at least one mission at the chosen level.
- A **pack** is one JSON file holding reading and writing missions. Packs live in `content/packs/` and are listed in `content/index.json`.
- Everything imported arrives as an **unchecked draft**. Drafts are hidden from the learner. **Teacher view** (link in the page footer) shows them with an "Unchecked" label. When a person has read a pack, approve it and it goes live.

## Step by step
1. Give the AI the **prompt** below (and, if you can, attach `docs/import/example-pack.json`).
2. Save its JSON answer as a file, for example `football-1.json`. (Pasting it straight to Claude Code works too.)
3. Check it without changing anything: `node tools/import.mjs football-1.json --check-only`. If there are problems, it lists them in plain words. Send that list back to the AI, ask for a corrected file, and repeat.
4. New theme? Add `--add-theme "Football" --blurb "Matches, fans and clubs."` (football, music, gaming and others are already listed, so you may not need it).
5. Import: `node tools/import.mjs football-1.json`. It is now a hidden draft.
6. Switch on **Teacher view** in the footer and read it as the learner would. Use `docs/question-review/` ideas: is each answer right, is only one option defensible, is the level right?
7. Happy? `node tools/import.mjs --approve football-1`. Not happy? `node tools/import.mjs --remove football-1`.
8. Commit and push to publish.

The checker catches structure mistakes (answer positions, mark totals, text lengths for long missions, bullet counts, unknown formats or themes, repeated ids). It cannot tell whether a question is **fair or correct**. That is what step 6 is for.

## Prompt to give the other AI
Copy everything between the lines.

---
I'm building a free practice site for Pearson Edexcel Functional Skills English (Level 1 and Level 2, Reading and Writing) for one 17-year-old learner. Please write a **pack** of practice missions on the theme **[THEME, e.g. Football]**. Reply with **only one JSON object**, no commentary.

**Shape**
```
{ "pack": "football-1",
  "reading": [ ...reading missions... ],
  "writing": [ ...writing tasks... ] }
```
Use `"topic": "[THEME]"` on every mission, exactly as written. Give every mission a unique `id` starting `r-football-` (reading) or `w-football-` (writing), with a number on the end.

**Reading mission (short, about 10 minutes)**: `id, topic, title, minutes: 10, texts: [ {id: "A", levels: ["L1","L2"], kind, source, title, body: [blocks]} ], questions: [...]`
- One or two texts of 150 to 350 words, written as a real-world text: a web page, newsletter, blog post, advert, leaflet, email or article. Original writing only. **Invent every person, club, company, town and brand.** Do not use real clubs, players, products or places, and do not copy any existing exam text.
- `body` is a list of blocks, each one of: `{"p": "paragraph"}`, `{"h": "heading"}`, `{"ul": ["item", ...]}`, `{"ol": [...]}`, `{"box": "text in a box"}`, `{"table": {"head": [...], "rows": [[...]]}}`. Use `**bold**` for bold words.
- 8 to 12 questions. Each has `id` ("q1", "q2"...), `levels` (["L1","L2"], or just one), `text` (which text: "A" or "B"), `prompt`, and a `type`:
  - `choice`: `options` (exactly 4), `answer` (index 0 to 3), `why` (quote or point to the text).
  - `tfns`: prompt is a statement; `answer` is "true", "false" or "notstated"; `why`.
  - `factopinion`: prompt is a quotation from the text; `answer` is "fact" or "opinion"; `why`.
  - `multi`: `label`, `marks: 2`, `options` (4 to 5), `answer` (list of two indexes), `why`.
  - `open`: `model` (a model answer), `check` (2 to 3 short "I ..." self-check statements).
- Mix the types. Spread correct answers across A, B, C and D. Only one option may be defensible. Wrong options must be plausible but clearly wrong from the text. Questions must be answerable from the text alone.
- Level 1 questions: find a fact, sort fact from opinion, purpose of the text, the effect of a heading or list. Level 2 adds: how language or layout works for the reader, comparing two texts, inference, tone.

**Writing task**: `id, topic, task (1 or 2), title, format, context, audience, purpose, instruction, bullets, indicative`
- `task: 2` is shorter: exactly **2** bullets. `task: 1` is longer: exactly **3** bullets.
- `format` must be one of: email, letter, article, review, report, blog, forum, form, advice, diary, newsletter (check `content/toolkit.json` for the current ids).
- `context` is a short, made-up situation. `audience` and `purpose` are one line each. `instruction` is e.g. "Write a post for the forum."
- `indicative` has exactly one entry per bullet: what a good answer might include, as ideas, not a script.
- Optionally `info`: a short list of facts the learner may use.

**Style rules**
- UK English. Calm, friendly, never babyish. The reader is 17.
- No exam, test or fail wording. No violence, alcohol, gambling, dating or real-world politics.
- Everything about the theme should feel like something a teenager might actually read or write.
- Every `why` must be accurate and, where it helps, quote the text exactly.

Please write: [for example, 3 short reading missions and 3 writing tasks (two Task 2, one Task 1)].
---

## Long missions (optional, harder)
Long reading missions copy the real paper's layout and the checker is strict: three texts (A, B, C), 15 numbered questions, set word counts and mark totals. See `content/reading-long.json` and the "long mission" notes in `docs/content-guide.md`. Ask the AI to match one of the existing `rl-` missions, and attach that file. Expect a few rounds of "fix these problems".

## Later
The same pack format can be produced by an AI inside the project (`tools/draft.mjs`, needs an API key) or by a future in-site generator. Imported packs, checks and the draft/approve step stay the same either way.
