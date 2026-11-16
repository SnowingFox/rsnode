# data/benchmark.json

This file is the only source of numbers on the page. `assets/site.js` fetches it
at load time and renders every card from it. Nothing is hardcoded in the markup,
so replacing this file replaces the whole benchmark section.

The file in this directory is the **three-way measurement** of Node 28, rsnode
and Bun 1.4.4. It is generated from the measurement output by a converter that
validates the source against this contract; it is not hand-edited.

## Schema

```json
{
  "generated": "2026-11-16",
  "host": { "cpu": "...", "cores": 8, "note": "..." },
  "runtimes": {
    "node":     { "name": "Node.js",  "version": "...", "engine": "V8 ..." },
    "rustnode": { "name": "rsnode",   "version": "...", "engine": "V8 ..." },
    "bun":      { "name": "Bun",      "version": "...", "engine": "JavaScriptCore" }
  },
  "sections": [
    {
      "id": "startup",
      "title": "Process startup",
      "unit": "ms",
      "lowerIsBetter": true,
      "method": "one sentence describing the workload and how it was measured",
      "rows": [
        { "case": "-e ''", "node": 18.9, "rustnode": 23.8, "bun": 12.1, "n": 100,
          "note": "why this number needs a caveat, if it does",
          "notComparable": ["bun"] }
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
| `native-call` | Native call overhead | `lowerIsBetter: false` — higher is better |
| `http` | HTTP throughput | `lowerIsBetter: false` |
| `compatibility` | Compatibility coverage | not a speed number; its own layout |

Cards are rendered in that order regardless of the order in the file, and a
section missing from the file still renders as an explicit empty card so an
absent measurement is never mistaken for a good one.

Any other section id is appended after those five and rendered as a normal
chart card. This dataset relies on that for two measurement sections the page
has no fixed slot for: `http_rss` (server memory under load) and `node-bench`
(Node's own benchmark tree).

### Id mapping at conversion time

The measurement output and the page do not use the same ids for two sections,
so the converter maps them once, in one place, rather than the page guessing:

| measurement id | dataset id | card |
| --- | --- | --- |
| `rss` | `memory` | Peak memory |
| `native` | `native-call` | Native call overhead |

Ids are resolved before the file is written, so this file always uses the ids
in the table above and the page needs no alias table. If a future measurement
run emits a new id for a fixed card, add it to that map — do not add a second
lookup table to `assets/site.js`.

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

### Row notes (required for any number that needs a caveat)

- **`rows[].note`** is a string printed in the card, under that row's case label
  and above its bars. It stays visible at every viewport width; a note that
  disappeared on a phone would leave a misleading number on its own.
- **`rows[].notComparable`** is an array of runtime keys whose value on that row
  is *not* a like-for-like comparison. For each listed runtime the page tags the
  value `see note`, never awards it the row's "best" tag, and excludes it from
  the per-section Bun tally. The value itself is still printed, because deleting
  a measurement hides it; the row's `note` explains it. A row using this field
  must have a `note`, and the converter enforces that.

  This exists for exactly one cell today: `startup` / `-e ''` / `bun`, where Bun
  prints a 2301-byte help banner instead of running an empty script, so its
  1.18 ms times help output rather than startup. Node and rsnode on that row are
  a valid comparison and stay counted. Read that row's note, and quote the
  `-e 'void 0'` row — which carries `headline: true` — for a like-for-like Bun
  startup number.

## Compatibility section extras

The compatibility card reads two optional fields besides `rows`:

- `headlineNote` — the sentence under the big percentage.
- `stats` — `[{ "value": "2880/5692", "label": "test files passing" }]` tiles.

`rows[].<runtime>` there is a percentage of coverage (0–100), and the card draws
it as a coverage bar, not a speed bar. `rows[].n` is absent, and the method line
therefore prints no sample size.

### Compatibility provenance rules

The compatibility figures are not one measurement and must not be presented as
a series:

- The headline **54.5%** is **3115 of 5714** Node test files across **all eight
  suites**, under the four-marker rule, and it is a **prior measurement** at
  commits `1d020c12`→`293ae04c`. It was not re-measured in the three-way run.
- The `stats` tile **70.0%** is **210 of 300** files from `test/parallel`'s
  **first 300 files alphabetically**, measured this session at `365cfa2f`.
  That slice is **biased**: Node's ordering front-loads `abort`/`assert`/
  `async_hooks`, which are friendlier than the suite average.
- The two are therefore **not comparable and not a trend**, and both figures
  carry their scope in the tile label. Do not compute a delta between them.
- **Bun is `null`, not `0`.** Bun's compatibility with Node's test suite was
  never measured: Bun does not claim Node test-suite parity, and the harness
  drives `rustnode` specifically, so the number would not be comparable.
- **Node is `100` by definition**, because the tests are Node's own.
- The four-marker rule is the only scoring rule: a file passes only when it
  exits 0 **and** has no `✖`, no `Uncaught`, no `1..0 # Skipped` at column zero,
  and no `: # SKIP`. Exit-code-only counting inflates this suite by roughly 800
  skipped files and must never be quoted.

## Calibration

`calibration.null_control_js_loop` renders as a sixth, clearly-labelled control
card, not as a benchmark. It exists to show the reader how much to discount the
JS-bound numbers when the control does not come back at 1.00x.

In this dataset it comes back at **1.000x** between Node and rsnode on the
fast-path medians, which is the expected result for a runtime that reuses V8
unmodified. That 1.000x is the discount the other JavaScript-bound rows are
entitled to; it is not an rsnode advantage.
