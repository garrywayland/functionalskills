# Pearson collector

Finds, downloads and logs Pearson Edexcel Functional Skills English study material
(sample assessments, practice papers, mark schemes, marked learner work, examiner reports),
so you can build a calibration set for the marking experiment.

## What is and is not available

- Pearson's own past-papers page lists no public past papers for Functional Skills English.
  Live papers are secure and only for teachers and exams officers at registered centres.
  Ask her centre's exams officer what they can share. The collector does not try to get round this.
- Publicly available from Pearson: specification, sample assessment materials, sample marked
  learner work, "You are the assessor" slides, principal examiner reports, guidance to centres,
  grade boundaries. These are what `manifest.json` points at.
- Some practice papers exist and are mirrored on third-party sites. Those are in the unofficial tier.

## Parts

| File | What it is | Uses a model? |
| --- | --- | --- |
| `manifest.json` | The list of documents: URL, level, kind, tier, evidence | no |
| `fetch.py` | Downloads official items; checks PDF, robots.txt, hosts; logs provenance | no |
| `discover.py` | Agent: web search + URL checker + proposal tool. Finds missing items | yes |
| `approve.py` | You approve or reject what the agent proposed | no |
| `tools.py`, `common.py` | Tool handlers and shared helpers | no |
| `tests/` | 12 tests, run offline | no |

## Run it (Cloud Shell or any machine with Python 3.10+)

```
unzip pearson-collector.zip && cd pearson-collector
python3 -m unittest discover -s tests          # sanity check, no network needed
python3 fetch.py --dry-run                      # see what would be fetched
python3 fetch.py                                # official tier only; ~2 s between requests
```

Files land in `library/<tier>/<level>/<kind>/<id>.pdf`. `library/state.json` says what happened
to each item; `library/provenance.jsonl` records URL, time, size and SHA-256 for every file.

Statuses to expect: `ok`, `unchanged`, `to-find`, `http-404` (URL guess was wrong),
`not-a-pdf`, `robots-disallow`, `blocked-host`, `link-only`.

## Finding the missing items (the agent)

```
pip install anthropic
export ANTHROPIC_API_KEY=...        # in this shell only; never in a file or a chat
python3 discover.py --phase official
python3 approve.py --phase official
python3 fetch.py
```

The agent can search (restricted to qualifications.pearson.com in the official phase), check
URLs and propose items. It cannot download files or change the manifest. Limits: 25 turns and a
150,000-token budget by default (`--max-turns`, `--token-budget`). Watch the spend in your console.
Set a budget alert there first.

## Stretch: unofficial material

```
python3 discover.py --phase unofficial
python3 approve.py --phase unofficial
python3 fetch.py --tier unofficial
```

Rules built in:
- Unofficial items are link-only. `approve.py` asks whether to download after showing the licence
  note; `fetch.py` fetches only items with `"download": true`.
- Every unofficial proposal needs a licence note quoting what the page says about reuse.
- Sites that host copied documents under unclear terms are blocked from the agent's search
  (see `BLOCKED_UNOFFICIAL` in `discover.py`; edit to taste).
- Free to download is not the same as permitted to reuse. Treat the unofficial tier as private study material.

## Using the library for the marking experiment

Build the golden set only from official, marked material (sample marked learner work, guidance to
centres, examiner reports). Do not use unofficial marks as ground truth: nobody has verified them.
Keep the material private and do not republish it.

## Honest status

- Tested offline: downloader (PDF check, 404, redirects off-host, robots.txt, idempotence, provenance),
  tool handlers, and the agent loop against a scripted fake model.
- Not tested: the real Pearson site and the live API call. Several URLs in the manifest were seen in
  search results but never fetched; one (`sam-l2`) is an inferred filename. The first run will show which are wrong.
- Next iteration: have the agent read the PDFs it downloads and extract the marked answers
  into the golden-set format.

## Running it on GitHub (no installs needed)

See `GITHUB.md`. In short: a private repo, three manual workflows (Collect, Discover, Approve)
copied from `workflows-to-copy/` into `.github/workflows/`, and one repository secret for the API key.
