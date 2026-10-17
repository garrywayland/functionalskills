# Adding content

All content lives in `content/*.json`. Add an entry, reload the page, and it appears on the map. Run the JSON through a validator if the page says the missions did not load.

## General rules

- Original writing only. Use the four topics: pandas; Israel (travel, nature, food, everyday life; no politics or conflict); public transport; UK geography, especially social geography.
- Prefer made-up organisations and UK places. Any real fact must be certain and not time-sensitive.
- Use `.example` for any email address or web address (for example, `buses@valeoffenn.example`).
- Avoid "exam", "test" and "fail" in learner-facing text.
- Check every answer key by hand.

## Reading mission (`content/reading.json`)

```json
{
  "id": "r-unique-id",
  "topic": "Pandas",
  "title": "Short title",
  "minutes": 10,
  "texts": [
    { "id": "A", "levels": ["L1", "L2"], "kind": "Web page", "source": "Made-up organisation",
      "title": "Heading", "body": [ { "p": "Paragraph" }, { "h": "Subheading" }, { "ul": ["item"] },
      { "table": { "head": ["Col"], "rows": [["cell"]] } } ] }
  ],
  "questions": [ ... ]
}
```

Each question has `id`, `levels` (`["L1"]`, `["L2"]` or both), `text` (`"A"`, `"B"` or `"both"`) and `type`:

| type          | extra fields                                       |
|---------------|----------------------------------------------------|
| `choice`      | `prompt`, `options` (array), `answer` (0-based index), `why` |
| `tfns`        | `prompt` (the statement), `answer`: `true`, `false` or `notstated`, `why` |
| `factopinion` | `prompt` (the quote), `answer`: `fact` or `opinion`, `why` |
| `open`        | `prompt`, `model` (a model answer), `check` (self-check list) |

Aim for 4 to 8 questions per level. Vary the position of the correct option.

## Writing mission (`content/writing.json`)

```json
{
  "id": "w-unique-id", "topic": "Public transport", "task": 1, "title": "Short title",
  "format": "email",
  "context": "...", "audience": "...", "purpose": "...", "instruction": "Write an email to ...",
  "bullets": ["first", "second", "third"],
  "info": ["optional facts the learner can use"],
  "levels": { "L2": { "bullets": ["any field can be overridden per level"] } }
}
```

`format` must match a format `id` in `content/toolkit.json`. Its checklist then appears on the Write step automatically. The length guide, marks and marking guide are shared settings at the top of `writing.json`.

## Toolkit (`content/toolkit.json`)

- `formats`: `id`, `name`, `summary`, `layout`, `opening`, `closing`, `tone`, `checklist`, `practice`.
- `spag`: `id`, `name`, `levels`, `explain`, `example` (`wrong` / `right`), `practice`.

A `practice` entry is `{ "prompt", "options", "answer", "why" }`.
