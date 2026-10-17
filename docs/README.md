# Next Stop

A static practice site for Pearson Edexcel Functional Skills English, Level 1 and Level 2 (Reading and Writing). Activities are short "missions" of about ten minutes. Every mission works at both levels via the Level switch.

Plain HTML, CSS and vanilla JS. No build step, no framework, no external requests. Deploys from `main` (root) with GitHub Pages.

## Run it locally

The page loads its content with `fetch`, so it needs to be served rather than opened as a file:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html          page shell, level switch
css/style.css       all styles (light and dark, reduced motion)
js/app.js           routing, missions, storage, progress log and export, Send for marking
content/
  reading.json      reading missions: texts + questions
  writing.json      writing missions, length guide, marks, our own marking guide
  toolkit.json      format guides and SPaG points, each with a practice question
docs/
  exam-notes.md     what is verified about the exam, and what is not yet
  content-guide.md  how to add a mission
```

## Ground rules

- **No personal data** in code, content, commits or comments. This repo is public.
- **Writing stays in the browser.** The only way out is the explicit "Send for marking" step, which builds a text block for the learner to copy. No analytics, trackers, web fonts or third-party scripts. A Content-Security-Policy in `index.html` blocks requests to other origins.
- **Progress record:** each finished mission is logged in localStorage with its date (and word count for writing). The Progress page can print or save as PDF, download a CSV, or copy as text, all built in the browser. An optional name is typed at export time and is never stored. Reading results are left out unless the learner ticks the box.
- **Storage** is `localStorage` only, every access wrapped in `try/catch`, with an in-memory fallback so the site works when storage is blocked.
- **Copyright:** all texts, questions and marking descriptors are original. Nothing is copied from Pearson papers, texts or mark schemes.
- **Wording:** activities are "missions". Learner-facing text avoids "exam", "test" and "fail". Feedback shows the answer and the reason, calmly, with no crosses.

## Adding content

See [content-guide.md](content-guide.md). Adding a mission means adding a JSON entry, not editing code.
