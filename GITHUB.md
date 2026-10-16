# Running the collector on GitHub

Everything runs in GitHub's cloud from your browser. Nothing to install.

## 1. Create a private repository
GitHub, top right "+", New repository. Name: `pearson-collector`. Choose **Private**.
Leave "Add a README" unticked. Create. (Private matters: Pearson's documents are copyright.
`.gitignore` also keeps downloaded files out of the repo.)

## 2. Upload the project
Unzip `pearson-collector.zip` on your computer. On the new repo page click "uploading an existing file".
Drag the **contents** of the unzipped folder onto the page (the files and the `tests` folder, not the outer folder).
Wait for the upload to finish, then "Commit changes".

## 3. Add the three workflow files
Workflows must live in `.github/workflows/`. Do this three times:
1. Repo page, Add file, Create new file.
2. In the name box type `.github/workflows/collect.yml` (typing `/` makes folders).
3. On your computer open `workflows-to-copy/collect.yml`, copy everything, paste into the editor.
4. Commit changes.
Repeat with `discover.yml` and `approve.yml`.

## 4. Let workflows save to the repo
Settings, Actions, General, "Workflow permissions": choose **Read and write permissions**, Save.
(Needed so Discover and Approve can save `candidates.json` and `manifest.json`.)

## 5. Dry run, then real fetch
Actions tab, "Collect" on the left, "Run workflow": mode `dry-run`, tier `official`, Run.
Open the run: the summary shows what would be fetched. Then run again with mode `fetch`.

## 6. Download the files
Open the finished run, scroll to "Artifacts" at the bottom, download `library`. It is kept for 14 days.
The summary table shows each item's status (`ok`, `http-404`, `to-find`, ...).

## 7. Add the API key and run the agent
1. In the Anthropic Console create a new key used only for this, and set a spending limit or alert.
2. Repo Settings, Secrets and variables, Actions, New repository secret.
   Name: `ANTHROPIC_API_KEY`. Value: the key. Never put it in a file or a chat.
3. Actions, "Discover", Run workflow: phase `official`, max_turns `25`.
4. The summary lists candidates; `candidates.json` is saved in the repo.

## 8. Approve and fetch again
Actions, "Approve", Run workflow: ids = e.g. `sam-l1,guidance-l1` (or `all`), phase `official`.
Then run Collect with mode `fetch` again.

## Stretch: unofficial material
Run Discover with phase `unofficial`. Open `candidates.json` in the repo and read each `licence_note`.
Run Approve with phase `unofficial` and the ids you are happy with. Tick `download` only after reading the note.
Run Collect with tier `unofficial` (or `all`). Treat these as private study material, never as marking ground truth.

## If something goes wrong
| Symptom | Likely cause |
| --- | --- |
| No "Run workflow" button | Workflow file not at exactly `.github/workflows/<name>.yml` on the default branch |
| Tests step fails | Read the log; usually a file missing from the upload |
| Every item `http-403` or `network` | Pearson may block GitHub's servers. Run `fetch.py` from Cloud Shell instead |
| `http-404` on one item | The URL guess was wrong. Run Discover, then Approve |
| Discover fails with 401 | Secret name must be exactly `ANTHROPIC_API_KEY` |
| Push rejected in Discover/Approve | Step 4 not done |
