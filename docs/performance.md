# Client and CSS performance budgets

Lateen ships a stylesheet bundle and a set of client islands with every page. This page explains how
that weight is measured, where the numbers live, and when a budget may change.

The budgets are **regression baselines**, not product requirements. Nothing here says a page should
weigh a particular number of bytes; the numbers record what the theme shipped when the baseline was
taken, so an unintended change shows up as a failure instead of passing quietly.

## Run the measurement

A clean checkout needs Node 24 or later and `npm ci`. The script builds the fixture with the
`@velella/mizzen` version the project installs, measures the output in a temporary folder, and deletes
it:

```bash
node scripts/performance-budget.ts
```

It prints one row per route and asset class, then checks the result against
`fixtures/performance/budget.json`. Exit code 0 means every route is within the budget. Exit code 1
lists each problem with the route and the asset class it belongs to, for example:

```text
route /reference/: js/components loads 6 assets, the baseline is 5
route /reference/: js/components is 4,600 B gzip, the baseline is 4,427 B (limit 4,491 B)
```

## The fixture

`fixtures/performance/` is a small Mizzen site built with this theme. It has three fixed routes:

| Route | What it represents |
| --- | --- |
| `/` | A short documentation page: prose, a list, a table, a code sample, and a callout. |
| `/guide/` | A typical guide: steps, two code samples, a callout, and a disclosure. |
| `/reference/` | The heavy end: code tabs, tabs, OS tabs, a terminal, a table, and a disclosure. |

The routes are deliberately stable. Changing their content changes the measurement, so a fixture
change belongs in the same pull request as a budget update, with an explanation.

## What is measured

For each route, the script reads the built HTML and assigns what the page loads to one of five asset
classes:

| Class | A route counts |
| --- | --- |
| `css/base` | The shared stylesheet bundle every page loads. |
| `css/page` | The bundle of the page's layout and component styles. |
| `js/chrome` | Chrome islands (theme chrome such as the header, sidebar, and table of contents) and the modules they import. |
| `js/components` | Islands of the components the page uses, and the modules they import. |
| `js/inline` | Inline JavaScript the page evaluates, such as the theme script in `<head>`. |

For every class the run records:

- **raw** — bytes as written.
- **gzip** — bytes after gzip level 9, summed per asset because each stylesheet and module is its own
  response. Inline JavaScript is compressed on its own for comparison; it travels inside the HTML
  document rather than as a separate request.
- **count** — stylesheets, module files the page loads at startup, or inline scripts. A module a page
  does not reach is not counted, and a module imported by two islands is counted once.

Fonts, images, and the HTML prose are outside the budget. The measurement is a transfer-and-startup
proxy: it does not time a browser, a device, or a network.

## Adjustment policy

1. Run `node scripts/performance-budget.ts`. Treat a failure as a question, not a formality: find what
   grew and why, and prefer removing work over raising the budget.
2. If the growth is intended, record the new baseline:

   ```bash
   node scripts/performance-budget.ts --update
   ```

   Commit the changed `fixtures/performance/budget.json` with the change that caused it.
3. Say in the pull request which route and class moved, by how much, and why the new baseline is
   correct. A budget update without that explanation should not be merged.
4. A decrease is recorded the same way. The budget ratchets down so the saving is not lost later.

The check allows each class `64` bytes of gzip headroom, the `TOLERANCE_BYTES` constant in
`scripts/performance-budget.ts`. It absorbs small differences in gzip output between zlib builds, so a
clean checkout on another Node release does not fail for a byte; it is not a growth allowance.

Module counts are checked without that headroom: an island added to a route is a new request and a new
module to evaluate, whatever its size.

## Mermaid build cache

Mermaid diagrams are rendered in child processes while the site builds. Set
`LATEEN_MERMAID_CACHE_DIR` to keep those renders between builds:

```bash
LATEEN_MERMAID_CACHE_DIR=.cache/mermaid node scripts/performance-budget.ts
```

Entries are keyed by normalized source, render options, and the cache-format version, and each is
written atomically, so parallel builds can share the directory safely. The cache changes build time
only: page output, page weight, and these budgets are unchanged. An unset directory, a read-only
directory, a cache miss, or a corrupt entry falls back to a normal render. Clear it by deleting the
directory, for example after changing the Mermaid version:

```bash
rm -rf .cache/mermaid
```
