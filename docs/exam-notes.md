# Exam notes

What we rely on when writing missions. Keep verified facts separate from assumptions. Re-check against the sources before adding anything here.

## Verified

Checked against Pearson's own documents (specification, L1 Guidance to Centres, L2 Reading exemplars, L2 Writing examiner report 2024) in October 2026.

### Reading

| | Level 1 | Level 2 |
|---|---|---|
| Time | 60 minutes | 75 minutes |
| Marks | 30 | 35 |
| Question styles | controlled and open response | multiple choice (MCQ), multiple response (MRQ, "select all that apply"), short open and medium open response |

Level 1 paper structure (Guidance to Centres, v1.0, Nov 2019):

- 3 texts and 15 questions, all linked by a common topic or theme.
- Text A (80 to 100 words): Q1 to 3, 5 marks. Q1 asks for a piece of information and which organisational feature helped (bullets, text box, speech bubble, numbering, bold, web menu). Q2 asks for a word or phrase with the same meaning (a dictionary is allowed). Q3 is a multiple-choice question on the main purpose.
- Text B (300 to 320 words): Q4 to 9, 12 marks. Includes retrieval questions worth up to 3 marks.
- Text C (200 to 220 words): Q10 to 14, 10 marks.
- Q15: 3 marks, comparing Text B and Text C.
- Text purposes: instruct, describe, explain, persuade.
- Text formats: adverts, articles, blogs, emails, internet discussions, leaflets, letters, reports, reviews, webpages, web forums.
- Question skills include: fact vs opinion, formal vs informal language, specialist words, punctuation to aid understanding, inferring from images, comparing texts.

Level 2 reading paper (checked in October 2026 against two Pearson-format practice papers, numbers 4 and 6, hosted on passfunctionalskills.co.uk; both had an identical layout and carry Pearson's front page and copyright line. They are third-party hosted copies, not downloaded from Pearson, so treat the structure as well supported but not official):

- 75 minutes, 35 marks, 15 questions, a separate text booklet, a dictionary allowed.
- Section A: Questions 1 to 4 on Text A, 7 marks (marks per question 2, 1, 2, 2).
- Section B: Questions 5 to 8 on Text B, 9 marks (2, 1, 2, 4).
- Section C: Questions 9 to 11 on Text C, 7 marks (2, 4, 1).
- Section D: Questions 12 to 15 on more than one text, 12 marks (2, 6, 1, 3).
- Each text is roughly 285 to 390 words; the texts get longer from A to C, and all three share one theme.
- Question styles seen: find specific information; choose the best description of a text's style; choose which two quotations are formal; add subheadings to paragraphs (organisation); what a quotation suggests; facts and opinions; name a person or detail; two behaviours or reasons (4 marks); two quotations that support an idea; two language features used to persuade; which quotation shows a view; a synonym question with a dictionary; compare similar ideas across texts (6 marks); which statement about the language of two texts is correct; and a "your friend wants to know" question that draws on several texts (3 marks).
- The lettered section layout shown in the Level 2 Reading exemplars is consistent with this.

### Writing (both levels)

- 60 minutes, 36 marks, two tasks.
- Task 1: 21 marks (Composition 12 + SPaG 9). Task 2: 15 marks (Composition 9 + SPaG 6).
- SPaG is 42% of the writing marks (15 of 36).
- **Task 1 has three bullet points. Task 2 has two** (L2 examiner report 2024).
- Level 2 suggested word counts (confirmed on the papers' task pages: **Task 1 about 35 minutes, 250 to 300 words; Task 2 about 25 minutes, 200 to 250 words; no dictionary**): **250 to 300 (Task 1), 200 to 250 (Task 2)**. Advisory only. Not writing less than the lower figure gives room to develop ideas; going far over the upper figure makes control harder.
- Candidates are given a suggested word range in each Writing assessment (specification).
- SPaG punctuation range:
  - Level 1 descriptors: full stops, question marks, exclamation marks, commas, possessive apostrophes.
  - Level 2 descriptors add inverted commas / quotation marks, and apostrophes more broadly.
- Level 2 examiner report (2024): strong answers cover every bullet point, often with one or two paragraphs per bullet, an introduction that states the purpose, and a concluding paragraph. Format must suit audience and purpose (letters and reports are formal; a forum post can be chatty). Task 1 deserves slightly more time.
- Composition at Level 2 is judged on four things: communication of ideas for audience and purpose; format and structure; range of sentences; language, register and vocabulary.

## Not yet verified

- **Level 1 writing word counts.** The site shows "about 200 to 300" (Task 1) and "about 150 to 250" (Task 2) as a working guess. We could not read the Level 1 writing sample paper (the Level 1 SAM link in the brief returned a web page, not a PDF). Level 2's figures are official.
- **Mark bands.** Confirmed for Level 2 from a Level 2 Writing mark scheme: Task 1 Composition 1 to 4, 5 to 8, 9 to 12 and SPaG 1 to 3, 4 to 6, 7 to 9; Task 2 uses the same three-band layout. These are equal thirds, which is what the site uses. The wording of our guide is our own summary. Level 1 band boundaries are not confirmed.
- **Level 2 formats not yet in the toolkit:** "web forum contribution" and "online form" tasks appear in Level 2 writing papers, and the toolkit has no guide for them yet.
- **Level 2 reading:** the structure above is now known, but no longer Level 2 missions have been written yet.

## How the site matches the real paper

- **Short missions** (`content/reading.json`, about 10 minutes): practice versions with one or two texts and 7 or 8 questions of 1 mark. Not a mock paper.
- **Longer missions** (`content/reading-long.json`, about 35 minutes, Level 1 only): follow the Level 1 layout above. Three texts linked by one theme (A about 80 to 100 words, B 300 to 320, C 200 to 220), 15 numbered questions (1(a) and 1(b), 2(a) and 2(b) count as one each) worth 30 marks, split 5 / 12 / 10 / 3 across Text A, Text B, Text C and the B-and-C comparison. Each includes: finding information and naming the layout feature, word meanings, main purpose, retrieval worth 3 marks, explaining, punctuation, fact vs opinion (as "choose two"), specialist words, informal or formal language, who a text is for, and a final comparison. The texts and questions are original; only the layout and skills follow Pearson's.
- Checked by script: word counts per text, total marks, section marks, answer keys in range. Checked by hand: every closed answer.

Known gaps for a later pass:

- No Level 2 longer missions yet, because the full Level 2 layout is not in the documents we have.
- Not yet covered: inferring from images, and multiple-response questions at Level 2 beyond the "choose two" style.
- Short missions use 1 mark per closed question.
- Our open-question model answers are examples, not the official mark scheme. The wording of acceptable answers (for example, for word-meaning questions) comes from our own judgement, not Pearson's lists.

## Sources

- Specification: https://secure.qualifications.pearson.com/content/dam/pdf/Functional-skills/English/2019/specification-and-sample-assessments/pearson-edexcel-functional-skills-in-english-spec-l1-l2.pdf
- L1 sample assessment: https://qualifications.pearson.com/content/dam/pdf/Functional-skills/English/2019/specification-and-sample-assessments/SAM-L1-FS-English-plain.pdf
- L1 Guidance to Centres: https://qualifications.pearson.com/content/dam/pdf/Functional-skills/English/2019/forms-and-administration/Pearson_Edexcel_FS_English_L1_Guidance_to_Centres.pdf
- L2 Reading exemplars: https://secure.qualifications.pearson.com/content/dam/pdf/Functional-skills/English/2019/specification-and-sample-assessments/Reading_Exemplars_FS_English_L2_Guidance%20to%20Centres.pdf
- L2 Writing examiner report 2024: https://qualifications.pearson.com/content/dam/pdf/Functional-skills/English/2019/Exam-materials/principal-examiner-report-l2-writing-24.pdf
- Third-party practice sets in Pearson format, for calibration only (never copy): functionalskillsuk.co.uk, passfunctionalskills.co.uk
