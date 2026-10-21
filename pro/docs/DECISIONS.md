# Decisions made for the first build

Chosen with the owner on 2026-10-21 unless stated.

| Decision | Choice | Why / how to change it |
| --- | --- | --- |
| Where it lives | New `pro/` folder beside the free site | The free site stays untouched. Move the folder to a private repo when ready. |
| Backend | Google Cloud: Cloud Run and Firestore | Uses the prepaid Google credit. One bill, easy budget alerts. The store has one interface, so Supabase or another database means writing one new file in `server/store/`. |
| Marking AI | Both Claude and Gemini (Vertex), switchable | `MARKING_PROVIDER`. Same prompt for both. `tools/compare-markers.mjs` shows which is closer to our marks. |
| First customer | Parents and learners | One learner per account. Parents and tutors can view progress if the learner shares. No classes or teacher dashboard yet. |
| Sign-in | Emailed link, no passwords | Nothing to leak or forget. Needs an email provider (Resend adapter written; adding another is one function in `server/mailer.js`). |
| Payments | Stripe Checkout, customer portal and webhook | Cards never touch our server. Monthly subscription and a one-off pass. Access is an end date, so lapses need no clean-up. |
| What is free | First mission per theme, all toolkit and fix-it, one marking task per level, Make-your-own-theme | `content/tiers.json`. |
| Marking limits | 40 per month per learner, 8 per hour, 300 per day overall | Settings. The daily cap is the budget brake. |
| Writing storage | Not stored by the marking service, not logged | The AI provider still receives it to mark it; the privacy notice has a blank to fill once their terms are checked. Saved drafts live in her synced progress, which she can download or delete. |
| Working name | "Next Stop" and plan "Plus" | `BRAND_NAME`, `PLAN_NAME`. Change before launch. |
| Pre-seeded themes | The four from the free site | More come from packs or the Make-a-pack page (which stays local to a browser). Server-side pack import for everyone is not built yet. |
