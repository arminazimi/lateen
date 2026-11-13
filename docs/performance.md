# Client, CSS, and font performance budgets

Lateen ships a stylesheet bundle, a set of client islands, and eight self-hosted webfont faces with
every page. This page explains how that weight is measured, where the numbers live, and when a budget
may change.

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

It prints one row per route and asset class, then one row per font file with the `@font-face` context
that loads it, then checks the result against `fixtures/performance/budget.json`. Exit code 0 means
every route is within the budget. Exit code 1 lists each problem with the route and the asset class it
belongs to, and for a font the file itself, for example:

```text
route /reference/: js/components loads 6 assets, the baseline is 5
route /reference/: js/components is 4,600 B gzip, the baseline is 4,427 B (limit 4,491 B)
route /reference/: font/self-hosted loads assets/theme/fonts/geist/geist-sans-latin-600-normal-….woff2 (Geist 600 normal), which is not in the budget; run `node scripts/performance-budget.ts --update`
route /reference/: font/self-hosted assets/theme/fonts/geist/geist-sans-latin-400-normal-….woff2 is 24,900 B gzip, the baseline is 20,172 B (limit 20,236 B)
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

For each route, the script reads the built HTML and assigns what the page loads to one of six asset
classes:

| Class | A route counts |
| --- | --- |
| `css/base` | The shared stylesheet bundle every page loads. |
| `css/page` | The bundle of the page's layout and component styles. |
| `js/chrome` | Chrome islands (theme chrome such as the header, sidebar, and table of contents) and the modules they import. |
| `js/components` | Islands of the components the page uses, and the modules they import. |
| `js/inline` | Inline JavaScript the page evaluates, such as the theme script in `<head>`. |
| `font/self-hosted` | The font files the stylesheets the page loads declare in an `@font-face`. |

For every class the run records:

- **raw** — bytes as written.
- **gzip** — bytes after gzip level 9, summed per asset because each stylesheet, module, and font is its
  own response. Inline JavaScript is compressed on its own for comparison; it travels inside the HTML
  document rather than as a separate request.
- **count** — stylesheets, module files the page loads at startup, inline scripts, or font files. A
  module a page does not reach is not counted, and a module imported by two islands is counted once.

The font class also records the files behind its totals, so `budget.json` lists every font response
with its URL, the stylesheet that declares it, and the family, weight, style, `font-display`, and
`format()` of the face that asked for it.

### How fonts are counted

- A font is discovered from the stylesheets the route actually loads, never from the theme's font
  folder. A face declared in a stylesheet no page links is not measured.
- One file is one response per route, however many faces or stylesheets declare it. Two faces that name
  the same file count once, and so does a file both the base and the page bundle declare. A `<link
  rel="preload" as="font">` of a file the CSS already declares adds a reference, not a second transfer.
- A face with only a `local()` source — the size-adjusted fallbacks the theme ships — transfers nothing
  and is not counted, and neither is a face inside a CSS comment.
- URLs are read as the browser reads them: percent-escapes (`%20`) and CSS escapes (`\20 `) resolve to
  the file the build emitted, a query string or fragment is dropped, and a relative URL is resolved
  against the stylesheet that writes it. A site served under a base path writes `/docs/assets/…` URLs
  while the build emits `assets/…`; the leading segments that only carry the base are dropped.
- A font that cannot be resolved fails the run by name. An external URL (`https://…`, `//…`, or a
  `data:` URI) is outside this budget and also fails: the theme self-hosts, and a remote face is a
  privacy and availability question before it is a byte question.

Images and the HTML prose stay outside the budget. The measurement is a transfer-and-startup proxy: it
does not time a browser, a device, or a network. The font numbers are an upper bound on purpose: they
count every face the loaded CSS declares, including one a browser may skip because its `unicode-range`
(U+0600 and friends on a Latin page) or its `font-display: optional` timing keeps it out of the first
paint. What the budget guards is the weight the theme declares, which is what a typography change
controls.

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

### The 0.2.0 baseline refresh

The baseline was last written before the Wave 2–5 features landed. Re-measured on Node 24.22.2 on
2026-11-13, the fixture moved as follows:

| Route | Class | Before | After | Change |
| --- | --- | --- | --- | --- |
| every route | `css/base` | 8,934 B gzip | 9,224 B gzip | +290 B (3.2%) |
| every route | `js/chrome` | 17,558 B gzip, 18 assets | 18,851 B gzip, 19 assets | +1,293 B (7.4%), +1 module |
| `/` | `css/page` | 915 B gzip | 920 B gzip | +5 B |
| `/guide/` | `css/page` | 1,214 B gzip | 1,222 B gzip | +8 B |
| `/reference/` | `css/page` | 1,676 B gzip | 1,695 B gzip | +19 B |
| `/reference/` | `js/components` | 6,196 B gzip | 6,170 B gzip | −26 B |

The growth is the search combobox and the evidence presentation, not unrelated drift:

- `js/chrome`: the combobox's pure option model is a new module (`chrome/search/options.ts`) and the
  search client grew with grouped results, the active-option model, and localized messages
  (`#135`, `#190`). The one extra asset is that model; inlining it into the client would save
  about 212 B gzip but would make the browser-only client the only way to unit-test the model, so the
  module boundary stays and the count is recorded at 19.
- `css/base`: the active option and dark-surface contrast rules, `unicode-bidi: isolate` on section
  tabs, the shared styles for the paired figure, schema reference, tested chip, and version-diff
  note (`#134`, `#147`, `#145`, `#146`, `#191`), and the release-candidate rules that keep trust,
  drift, tested, version, and recency evidence legible in forced colors and print (+169 B of the
  total).
- The page bundles only carry component styles for the components the route uses, so `/` moves least
  and `/reference/` most. `js/components` shrank slightly.

No compiler, minifier, or tolerance setting changed; `TOLERANCE_BYTES` is still 64. The new numbers
are the measured bytes of the integrated theme, so the next regression fails against them.

The check allows each class `64` bytes of gzip headroom, the `TOLERANCE_BYTES` constant in
`scripts/performance-budget.ts`. It absorbs small differences in gzip output between zlib builds, so a
clean checkout on another Node release does not fail for a byte; it is not a growth allowance.

Module counts are checked without that headroom: an island added to a route is a new request and a new
module to evaluate, whatever its size.

Fonts are checked twice: once as a class, against the totals above, and once file by file, with the same
`64` bytes of gzip headroom per file. The per-file pass is what makes a swapped or renamed face fail even
when the totals happen to stay level, and it also fails a baseline entry the route no longer loads, so a
shrink cannot leave a face in `budget.json` that nothing measures any more. `--update` rewrites the whole
list from the run, so the recorded files, URLs, and face context always match what the fixture builds.

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
