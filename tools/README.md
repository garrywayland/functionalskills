# Content tools

Tools for adding more practice missions. They are not part of the website.

| Tool | Needs an API key? | What it does |
| --- | --- | --- |
| `validate.mjs` | No | Checks all the content: text lengths, mark totals, answer keys, references. Run it before every commit. |
| `sync-guide.mjs` | No | Copies the marking guide into the marking service (`server/guide.js`). |
| `draft.mjs` | Yes | Asks Claude to draft a new mission, checks it, and asks for fixes if it fails. Saves it in `drafts/`. |
| `review.mjs` | Yes | A separate check by a fresh model call: answers every closed question with the answer key hidden, then reviews facts, level, originality and tone. |
| `merge.mjs` | No | Adds a reviewed draft to the content. It refuses unless you say you have read it. |

## The process

```
draft  ->  automatic checks  ->  independent review  ->  YOU read it  ->  merge  ->  commit
```

The AI writes and checks, but a person always reads a mission before it goes live. `merge.mjs` will not run without `--i-have-read-it`, and it will not accept a draft whose review found problems.

## Set up (once)

Open Cloud Shell (the **>_** icon at the top right of the Google Cloud page), then:

```sh
git clone https://github.com/YOUR-GITHUB-NAME/functionalskills
cd functionalskills/tools
npm install
read -s -p "Paste your Anthropic key, then press Enter: " ANTHROPIC_API_KEY; export ANTHROPIC_API_KEY; echo
```

The key is hidden as you paste it and lasts only until you close Cloud Shell.

## Draft, review, merge

A longer reading mission (the topics are `Pandas`, `Israel`, `Public transport` and `UK geography`):

```sh
node draft.mjs reading-long --topic "Public transport" --theme "a new night bus" --feature "text box"
node review.mjs ../drafts/rl-public-transport.json
```

`--theme` and `--feature` are optional. Features are: `text box`, `bold words`, `speech bubble`, `bullet points`, `numbered list`, `menu`, `subheadings`.

A writing task:

```sh
node draft.mjs writing --topic Pandas --task 2 --format review
```

The drafting tool prints the exact file name it saved. Open that file and read all of it. If the review lists **MUST** items, fix them or draft again. When you are happy:

```sh
node merge.mjs ../drafts/rl-public-transport.json --i-have-read-it
node validate.mjs
```

Then commit and push the changed files in `content/`. If you would rather not use git in Cloud Shell, copy the draft file's text into a chat with Claude and ask it to merge and push it.

## Cost

Each draft plus its review is a handful of calls, usually 30 to 70 pence with the default model. Set `MODEL=claude-sonnet-5-5` to roughly halve that.

## Tests

```sh
cd tools
npm test
```

The tests use a fake stand-in for Anthropic, so they cost nothing and need no key.
