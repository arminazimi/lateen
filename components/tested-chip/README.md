# Tested chip

An inline chip for the result of a page's examples: an icon, the word "Tested", and how many examples
passed and failed. It is sized to sit next to a code block or under it, not to stand alone as a banner.

```markdown
::tested-chip{passed=2 failed=0 lastPassed=2026-11-08}
```

## Unit

- `index.ts` — the Preact component, written with `h()`. The default export is the component and
  `directive` is `tested-chip`, so the engine's registry resolves `::tested-chip` without an index edit.
- `style.css` — tokens only, logical properties only, so dark mode and right-to-left pages follow.

## Props

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `passed` | count | none | Examples that passed. |
| `failed` | count | none | Examples that failed. |
| `lastPassed` | ISO date | none | When the examples last passed, as a `title` tooltip and a visually hidden sentence. |

A count is a non-negative integer. A missing, blank, negative, fractional, or non-numeric value is `0`.
When `passed` and `failed` are absent, the chip reads the page's entry in `site.data.examples` instead.
Props win when either count is given.

The chip renders nothing when there is no data or when `passed + failed` is `0`, which is the untested
case. It reports `failed` when anything failed and `passed` otherwise. The icon shape, the visible text,
and the counts all carry the result, so colour is never the only signal.

`lastPassed` is formatted in the page's calendar: Gregorian for English, Jalali for Persian, and Hijri
for Arabic, using the same helper as the "last updated" line.

## Data

When a site has the data, the page fallback reads `site.data.examples`, keyed by the page's URL:

```yaml
# _data/examples.yml
/guide/install/:
  passed: 2
  failed: 0
  lastPassed: 2026-11-08
```

This is the shape the engine's future `examples.json` report has (`total`, `passed`, and `failed` per
page). Writing `examples.json` is a separate open issue (#1465), so today a site can supply the same
record itself in `_data/examples.yml`. The chip only reads what is present; it never runs an example.

## Placement

The chip works wherever it is placed, but automatic per-block placement needs engine example markers
(N01/N06), which tell the engine which code blocks are runnable and where their results belong. Until
those land, place the chip with the directive beside the block, or let a layout or plugin render it
from `site.data.examples`. This unit does not edit the code component, the layouts, or the pipeline
(ADR 0023).

## Tests

`packages/theme/test/component-tested-chip.test.ts` covers the passed, failed, and mixed states, the
untested cases, the data fallback, the date tooltip in every language, escaping, and the stylesheet's
tokens and logical properties.
