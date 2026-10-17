# Marking service

A small web service that gives feedback on the learner's writing. The website sends it the task and the answer, and it returns marks, two things that worked and one thing to try.

- It uses the official Anthropic SDK and the paid Anthropic API. The API key lives only in Google Cloud Secret Manager. It is never in this repository.
- It receives the task and the answer, and nothing else. A request with any extra field (for example a name) is refused.
- It stores nothing and never logs the learner's writing. Logs hold only the time taken, the status and token counts.
- Only the website address you set in `ALLOWED_ORIGIN` may call it, and there are limits on how often it can be used.

## What it costs

Marking one answer uses about 3,000 tokens of input and a few thousand tokens of output. With the default model (`claude-sonnet-5-5`, $2 per million input tokens and $10 per million output tokens) that is usually about 2 to 4 pence per answer. The default daily cap of 60 answers keeps the worst case to roughly £2 a day. If you ever want to try a stronger (and about twice as expensive) model, set `MODEL=claude-opus-5-5`.

Set two safety nets before you start: a **monthly spend limit** in the Anthropic Console, and a **budget alert** in Google Cloud (steps below).

## Set it up (about 30 minutes, once)

You need: a Google account, a debit or credit card for Google Cloud billing, and an Anthropic Console account with a few pounds of credit. You do not install anything on your computer. Everything runs in your browser.

Replace `YOUR-GITHUB-NAME` below with your own GitHub username, and `YOUR-PROJECT-ID` with your Google Cloud project ID.

### 1. Get an Anthropic API key, with a spend limit

1. Go to https://console.anthropic.com and sign in.
2. Open **Settings**, then **Limits**, and set a **monthly spend limit** (for example $10).
3. Open **API keys**, click **Create key**, name it `next-stop`, and copy the key. It starts with `sk-ant-`.
4. Keep it open in a tab. Do not put the key in a chat, an email or a file in this repository.

### 2. Create a Google Cloud project, with a budget alert

1. Go to https://console.cloud.google.com and sign in.
2. Click the project name at the top, then **New project**. Call it `next-stop` and click **Create**. Note the **Project ID** (it may have numbers on the end).
3. Open the menu (three lines), then **Billing**, and link a billing account to the project.
4. In **Billing**, open **Budgets & alerts**, click **Create budget**, set it to £10 a month, and keep the alert emails on.

### 3. Open Cloud Shell

Click the **>_** icon at the top right of the Google Cloud page (**Activate Cloud Shell**). A terminal opens at the bottom of the page. Paste each command below, one block at a time, and press Enter.

### 4. Get the code and switch on the services

```sh
gcloud config set project YOUR-PROJECT-ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com
git clone https://github.com/YOUR-GITHUB-NAME/functionalskills
cd functionalskills/server
```

If it asks you to authorise, click **Authorize**.

### 5. Store the API key as a secret

This asks you to paste the key. What you type is hidden, which is normal.

```sh
read -s -p "Paste your Anthropic key, then press Enter: " KEY; echo
printf %s "$KEY" | gcloud secrets create anthropic-api-key --data-file=-
unset KEY
```

Now allow the service to read that secret:

```sh
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 6. Deploy

```sh
gcloud run deploy next-stop-marking --source . --region europe-west2 \
  --allow-unauthenticated --max-instances 1 --concurrency 10 --timeout 120 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --set-env-vars ALLOWED_ORIGIN=https://YOUR-GITHUB-NAME.github.io
```

- If it asks to create an Artifact Registry repository, type `Y`.
- The first deploy takes a few minutes.
- `--allow-unauthenticated` is needed so the website can call it. The service protects itself with the checks above.
- `--max-instances 1` keeps the usage limits accurate.

When it finishes it prints a **Service URL** that ends in `.run.app`. Copy it.

### 7. Check it is alive

```sh
curl SERVICE-URL/health
```

You should see `{"ok":true}`.

### 8. Connect the website

1. On GitHub, open `js/config.js` in your repository and click the pencil icon.
2. Put the Service URL between the quotes after `markingEndpoint:`. No slash at the end.
3. Click **Commit changes**. The website updates within a minute or two.
4. Open the website, finish a writing mission, and on the last step press **Get feedback**.

## Settings

Set these with `--set-env-vars` (separate several with commas). All are optional except `ALLOWED_ORIGIN`.

| Name | Default | What it does |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | none (required) | The website address allowed to call the service. No slash at the end. |
| `MODEL` | `claude-sonnet-5-5` | Which Claude model marks the work. |
| `EFFORT` | `medium` | How much thinking the model does: `low`, `medium`, `high`. |
| `RATE_PER_IP_PER_HOUR` | `12` | Answers one visitor can have marked per hour. |
| `DAILY_CAP` | `60` | Answers the whole service will mark per day. |
| `USE_FALLBACKS` | on | Set to `0` to turn off the automatic fallback if the safety systems decline a request. |

## Everyday jobs

- **Change a setting:** run the deploy command again with the new `--set-env-vars`.
- **Update the marking guide:** edit `markGuide` in `content/writing.json`, run `node tools/sync-guide.mjs`, commit, then deploy again. This keeps the website and the service saying the same thing.
- **Replace the key:** `printf %s "NEW-KEY" | gcloud secrets versions add anthropic-api-key --data-file=-`, then deploy again.
- **Turn it off:** `gcloud run services delete next-stop-marking --region europe-west2`

## Run the tests on your own computer

```sh
cd server
npm install
npm test
```

The tests use a fake stand-in for Anthropic, so they cost nothing and need no key.
