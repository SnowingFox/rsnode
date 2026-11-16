# data/benchmark.json

This file is the only source of numbers on the page. `assets/site.js` fetches it
at load time and renders every card from it. Nothing is hardcoded in the markup,
so replacing this file replaces the whole benchmark section.

The file currently in this directory is a **placeholder**: it has
`"status": "not-generated"` and an empty `sections` array, so the page renders
its empty state rather than any invented number.

## Schema

```json
{
  "generated": "2026-11-16",
  "host": { "cpu": "...", "cores": 8, "note": "..." },
  "runtimes": {
    "node":     { "name": "Node.js",  "version": "...", "engine": "V8 ..." },
    "rustnode": { "name": "rsnode",   "version": "...", "engine": "V8 ..." },
    "bun":      { "name": "Bun",      "version": "...", "engine": "V8 ..." }
  },
  "sections": [
    {
      "id": "startup",
      "title": "Process startup",
      "unit": "ms",
      "lowerIsBetter": true,
      "method": "one sentence describing the workload and how it was measured",
      "rows": [
        { "case": "-e ''", "node": 18.9, "rustnode": 23.8, "bun": 12.1, "n": 100 }
      ]
    }
  ],
  "calibration": {
    "null_control_js_loop": { "node": 128.5, "rustnode": 120.8, "bun": 0, "n": 20, "note": "..." }
  }
}
```

`data/` is fetched with `fetch()`, so the page must be served over HTTP. Opening
`index.html` from the filesystem will not load the dataset.

## Section ids the page understands

| id | card | notes |
| --- | --- | --- |
| `startup` | Process startup | `lowerIsBetter: true` |
| `memory` | Peak memory | `lowerIsBetter: true` |
| `native-call` | Native call overhead | `lowerIsBetter: true` |
| `http` | HTTP throughput | `lowerIsBetter: false` |
| `compatibility` | Compatibility coverage | not a speed number; its own layout |

Cards are rendered in that order regardless of the order in the file, and a
section missing from the file still renders as an explicit empty card so an
absent measurement is never mistaken for a good one.

Any other section id is appended after those five and rendered as a normal
chart card.

## Required behaviour

- **`null` is not zero.** A runtime with `null` renders as a hatched
  "not measured" row. `0` renders as `0`, because a measured zero is data.
  An object form `{ "value": null, "status": "failed" }` renders "failed".
- **`method` is printed**, small, under the chart in every card, in the shape
  `workload · method · hardware · medians of N`, matching how bun.sh prints its
  method line inside the card rather than in a tooltip.
- **`n`** may be per row. The method line summarises the range (`medians of
  40–100 per case`) and omits it entirely for the compatibility section.
- **`headline: true`** on a row makes that row the one the verdict line leads
  with. Without it the first row is used.
- **No aggregate.** The page never sums, averages, or ranks runtimes across
  sections. Section verdicts are written from that section's own numbers and
  always name who lost.

## Compatibility section extras

The compatibility card reads two optional fields besides `rows`:

- `headlineNote` — the sentence under the big percentage.
- `stats` — `[{ "value": "2880/5692", "label": "test files passing" }]` tiles.

`rows[].<runtime>` there is a percentage of coverage (0–100), and the card draws
it as a coverage bar, not a speed bar.

## Calibration

`calibration.null_control_js_loop` renders as a sixth, clearly-labelled control
card, not as a benchmark. It exists to show the reader how much to discount the
JS-bound numbers when the control does not come back at 1.00x.
