# Putting Next Stop Plus online (Google Cloud), step by step

You will do this in **Cloud Shell**: the free terminal in your browser at https://shell.cloud.google.com, already signed in as you. Copy one block at a time. Where it says `YOUR-...`, replace it with your own value. **Never paste a secret into a chat or commit it.**

Do the steps in order. The first time, use **test** Stripe keys and your own email only. Nothing here charges anyone until you switch Stripe to live keys.

## 0. Before you start
- A Google Cloud project with billing switched on and your prepaid credit attached (Billing, then Credits, shows it).
- This `pro/` folder copied into your private repo, and the repo open in Cloud Shell (`git clone`, then `cd` into the `pro` folder).
- **Set a budget alert first** (Billing, then Budgets and alerts). Create a budget with alerts at 50 percent and 100 percent. This takes five minutes and stops surprises.

## 1. Choose names and region
```
export PROJECT=YOUR-PROJECT-ID
export REGION=europe-west2          # London. Keep everything in one UK/EU region.
gcloud config set project $PROJECT
```

## 2. Switch on the services
```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com
```

## 3. The database
```
gcloud firestore databases create --location=$REGION
```
All access goes through the service, so the database stays closed to browsers (`firestore.rules` in this folder says so).

## 4. A service identity with only what it needs
```
gcloud iam service-accounts create nextstop-run --display-name="Next Stop service"
export SA=nextstop-run@$PROJECT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/aiplatform.user
```
(`aiplatform.user` lets it call Gemini on Vertex AI. It is only used if `MARKING_PROVIDER=vertex`.)

## 5. Secrets
Make each secret once. The first one is made for you; the others you paste from the provider's website when you have them.
```
printf '%s' "$(openssl rand -base64 48)" | gcloud secrets create SESSION_SECRET --data-file=-
# later, after sections 7 and 8:
printf '%s' 'PASTE-HERE' | gcloud secrets create RESEND_API_KEY --data-file=-
printf '%s' 'PASTE-HERE' | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
printf '%s' 'PASTE-HERE' | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-
# only if you choose Claude for marking:
printf '%s' 'PASTE-HERE' | gcloud secrets create ANTHROPIC_API_KEY --data-file=-

for s in SESSION_SECRET RESEND_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

## 6. Settings file (not secret)
Copy `deploy/env.example` to `env.yaml` in this folder and turn it into YAML (one `KEY: "value"` per line, no secrets). Leave out the secret lines: they come from Secret Manager in the next step. `env.yaml` is ignored by the container build and must not be committed (add it to `.gitignore`).

## 7. Email (Resend)
1. Make a free account at resend.com and add your sending domain. It gives you DNS records to add at your domain provider. Wait until it says verified.
2. Create an API key and store it as the `RESEND_API_KEY` secret (step 5).
3. Set `MAIL_FROM` in `env.yaml` to an address on that domain.

## 8. Payments (Stripe), in test mode first
1. In the Stripe dashboard (test mode): create two Products: a **monthly subscription** and a **one-off payment** for the pass (the length in days must match `PASS_DAYS`). Copy each Price id (`price_...`) into `env.yaml` as `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_PASS`, and set the two `PRICE_..._LABEL` lines to match what you charge.
2. Turn on the **customer portal** (Settings, then Billing, then Customer portal) so people can cancel and update cards.
3. After deploying (step 10) add a **webhook endpoint**: `https://YOUR-SITE/api/stripe/webhook`, with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy its signing secret into the `STRIPE_WEBHOOK_SECRET` secret.
4. Put the secret key (`sk_test_...`) in the `STRIPE_SECRET_KEY` secret.
5. Try a payment with Stripe's test card `4242 4242 4242 4242`, any future date, any code. Check Plus switches on, then cancel from "Manage billing".

## 9. Which AI marks the writing
Pick one in `env.yaml` (`MARKING_PROVIDER`):
- `vertex`: Gemini on Google Cloud. No key to look after, and the cost is on your Google Cloud bill (so your credit pays). Set `VERTEX_MODEL` to a model name that exists in your Vertex AI console.
- `anthropic`: Claude. Needs the `ANTHROPIC_API_KEY` secret and its own Anthropic billing. Default model `claude-sonnet-5-5`.
- `off`: marking is hidden and people use Copy.

**Before you switch real learners on, compare them.** This uses only the 18 invented sample answers (no real writing) and a few pence:
```
cd pro && npm ci
VERTEX_PROJECT=$PROJECT node tools/compare-markers.mjs --providers vertex --limit 3     # try 3 first
VERTEX_PROJECT=$PROJECT node tools/compare-markers.mjs --providers vertex --out vertex.json
ANTHROPIC_API_KEY=... node tools/compare-markers.mjs --providers vertex,anthropic       # both side by side
```
It prints how many marks each AI is off by on average, and tokens used (multiply by the current price to get your cost per feedback). Choose from that, and set `QUOTA_MONTHLY_MARKS` and `MARKS_DAILY_CAP` so the worst case is a number you are happy to pay.

## 10. Deploy
```
cd pro
gcloud run deploy nextstop --source . --region $REGION --service-account $SA \
  --allow-unauthenticated --min-instances 0 --max-instances 3 --memory 512Mi \
  --env-vars-file env.yaml \
  --set-secrets SESSION_SECRET=SESSION_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
```
(`--max-instances 3` is a cost brake. Add `ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest` to `--set-secrets` if you use Claude.)

The first deploy prints an address like `https://nextstop-xxxx-nw.a.run.app`. Put that in `env.yaml` as `BASE_URL` and deploy again (or `gcloud run services update`). The service refuses to start if something unsafe is set (for example development mode in production), and says why in the logs.

## 11. Your own address
```
gcloud beta run domain-mappings create --service nextstop --domain YOUR-DOMAIN --region $REGION
```
Follow the DNS instructions it prints, then change `BASE_URL` to `https://YOUR-DOMAIN`, redeploy, and fix the Stripe webhook address.

## 12. Check it
```
node deploy/smoke.mjs https://YOUR-DOMAIN
```
Every line should say `ok`. Then do the human check, with test keys:
- [ ] Sign in with your own email (the email arrives, the link works once).
- [ ] Open a locked mission signed out: you see the Plus page, not the lesson.
- [ ] Buy Plus with the test card; Plus switches on; "Manage billing" opens Stripe.
- [ ] Write and ask for feedback; the allowance counts down.
- [ ] Sign in on a phone: your draft is there.
- [ ] Share a code with a second email; the parent view shows progress and not writing.
- [ ] Download my data; delete the account; check it is gone.

## 13. Running it
- **Give someone Plus** (a tutor, a pilot student) from Cloud Shell:
  `DATA_STORE=firestore FIRESTORE_PROJECT=$PROJECT node server/admin.mjs grant them@example.com 90`
  or make a promo code to hand out: `... node server/admin.mjs code new --days 30 --uses 20 --label "Tutor pilot"`.
- **Look at the logs:** `gcloud run services logs read nextstop --region $REGION --limit 50`. They never hold writing or email addresses.
- **Roll back a bad deploy:** `gcloud run revisions list --service nextstop --region $REGION`, then `gcloud run services update-traffic nextstop --to-revisions REVISION=100 --region $REGION`.
- **Change lessons:** edit files in `content/`, run `NEXTSTOP_ROOT=$PWD node ../tools/validate.mjs`, redeploy.

## 14. Testing the database code
The Firestore code is covered by the same contract test as the other stores, but only when you point it at the emulator (no real data touched):
```
gcloud emulators firestore start --host-port=localhost:8086      # in one Cloud Shell tab
FIRESTORE_EMULATOR_HOST=localhost:8086 npm test                  # in another
```
Do this before the first real customer. It has not been run for you.

## 15. Before real customers
The code is only part of "ready". Work through the "before you charge anyone" section of the pathway document: the privacy notice and terms in `web/privacy.html` and `web/terms.html` are **drafts with blanks**; the AI provider's data terms must be read and stated; a teacher must review content and marking; and you need advice on tax and consumer rights. Switch Stripe to live keys last.
