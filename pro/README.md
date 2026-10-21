# Next Stop Plus

The paid version of Next Stop, built beside the free family site (which is untouched, in the folder above). It is one small Node service that serves the website and its API.

**Working title.** The name "Next Stop" and the plan name "Plus" are settings (`BRAND_NAME`, `PLAN_NAME`), not baked in. Pick your real name before launch. The pathway document (the route from here to charging real customers, and what is still to be done outside the code) is kept privately, not in this folder, because it is a business plan.

## What it does

| Area | What a learner or parent gets |
| --- | --- |
| Free taster | No account needed. A first reading mission and writing task in every theme, all the toolkit, all fix-it sets, one marking task per level, Make-your-own-theme. Work stays on the device. |
| Accounts | Sign in with an emailed link (no passwords). One session cookie. Sign out, or sign out everywhere. |
| Plus | Every mission and marking sample, AI feedback on writing (a monthly allowance), work synced across devices, parent or tutor view. Paid monthly or as a one-off pass, or switched on with a promo code or by you. |
| Sync | Progress merges between devices with the same rules as "Restore from a file": nothing is lost, the newest copy wins. Works offline and catches up. |
| Parents and tutors | The learner makes a one-time code; the adult enters it. They see what was finished and when. Writing only if the learner ticks the box. Either side can end it. |
| Her data | Download everything we hold. Delete the account (cancels the subscription, removes saved work and links). |
| Marking | Claude or Gemini (Vertex AI), chosen by one setting, behind one prompt, with a comparison tool. Monthly allowance per learner, hourly limit, and a daily cap for the whole service. Failures and refusals cost the learner nothing. |
| Admin | `server/admin.mjs`: grant or revoke Plus, make promo codes. Admin accounts can see unchecked draft missions. |

## How it is built

```
Browser (web/)  ──same address──▶  Node service (server/)  ──▶  Firestore (or file/memory in development)
 plain JS, no build step            serves the site and /api            accounts, synced progress, counters
 local-first: works offline                │
                                           ├──▶ Stripe        payments, via Stripe's own pages and webhook
                                           ├──▶ Resend        sign-in emails
                                           └──▶ Claude or Gemini on Vertex AI    marking
```
- **Lessons live on the server** (`content/`). A visitor receives free lessons in full and "locked" stubs (title and size only) for the rest, so locked answers are not in the page source. Which lessons are free is `content/tiers.json`.
- **Rules are shared.** `web/js/rules.js` (content checks) and `web/js/backup.js` (merge) run in the browser and in Node, so the page and the server can never disagree.
- **Every data store has one interface** (`server/store/`), and one contract test that all of them must pass.
- **Safe by default.** Strict content-security-policy (no inline scripts or styles, own address only), no third-party scripts or fonts, same-origin API with a custom header, HttpOnly SameSite cookie, one-use sign-in links, rate limits, signed payment webhooks with replay protection, no logging of writing or emails, refusal to start in an unsafe configuration.

## Run it on your computer
```
cd pro
npm install
npm run dev            # http://localhost:8080 with sign-in links shown on screen (development only), a fake marker, files in .data
```
Open the site, go to Account, type any email, and use the "Open the link (development only)" button. Give yourself Plus:
```
DATA_STORE=file DATA_DIR=./.data node server/admin.mjs grant you@example.com 90
```

## Tests
```
npm test               # 67 server tests: sign-in, content gating, marking, sync, payments, family, accounts, stores, admin, comparison tool
npm run test:e2e       # a real browser drives learner, parent and payer through the whole site, on phone and desktop, with fake AI and fake Stripe
node ../tools/validate.mjs  # run as: NEXTSTOP_ROOT=$PWD node ../tools/validate.mjs   (checks the lessons)
node deploy/smoke.mjs https://your-site     # after deploying
```
`FIRESTORE_EMULATOR_HOST=localhost:8086 npm test` also runs the contract test against the Firestore emulator.

## Honest status

| Part | Tested | Not yet |
| --- | --- | --- |
| Sign-in, sessions, CSRF, rate limits | Server and browser tests | Real email delivery (tested against a fake Resend-style server only; the Resend call itself is untested live) |
| Content gating, tiers, sync, family, export, delete | Server and browser tests | Large real-world data volumes |
| Payments | Webhook signatures, plan lifecycle, checkout request shape, cancel on delete, all against a fake Stripe | A real Stripe test-mode purchase end to end (do this first, section 8 of `deploy/DEPLOY.md`) |
| Marking (Claude path) | Same prompt and request shape against a fake Anthropic server | A live call |
| Marking (Gemini on Vertex path) | Request shape and result checking with a stand-in client | A live call, and whether the response schema option behaves as expected with your chosen model |
| Firestore store | Compiles, same interface | The contract test against the emulator, and a deploy |
| Quality of AI marks | Nothing: that needs the comparison tool and a teacher | Calibration on real, human-marked writing (the 18 samples are a start) |
| Legal pages | Drafts with blanks | Everything: needs real advice |

## Folders
```
server/      the service: index.js (routes), auth, billing, sync, family, content, marking/, store/, admin.mjs
web/         the website (a copy of the free site plus accounts, plans, sync, parent view)
content/     the lessons, themes, and tiers.json (what is free)
tests/       server tests, store contract test, e2e/ browser tests
tools/       compare-markers.mjs (how close is each AI to our marks)
deploy/      DEPLOY.md (step by step), env.example, smoke.mjs
docs/        DECISIONS.md (what was chosen and why)
```

## Keeping it separate from the free site
This folder shares no files with the free site, so changes here never touch it. Lessons were copied, so fixes made in one will not appear in the other unless you copy them across.
