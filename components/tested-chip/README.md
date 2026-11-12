# Tested chip

An inline chip for the result of a page's examples: an icon, a label, and how many examples passed,
failed, or did not run. It is sized to sit next to a code block or under it, not to stand alone as a
banner.

```markdown
::tested-chip{passed=2 failed=0 total=2 lastPassed=2026-11-08}
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
| `total` | count | none | Examples the run counted. More than `passed + failed` means the rest did not run. |
| `lastPassed` | ISO date | none | When the examples last passed, as a `title` tooltip and a visually hidden sentence. |

A count is a whole, non-negative, safe integer. Only an omitted field (`undefined`) is treated as
missing. A blank, a negative, a fractional, `NaN`, `Infinity`, a value past `Number.MAX_SAFE_INTEGER`,
a boolean, an object, and a non-numeric string are all "present but invalid" and never become `0`.
When no count is given, the chip reads the page's entry in `site.data.examples` instead.
Props win when any count is given.

The chip renders nothing when there is no count at all, or when every supplied count is a valid zero
and no positive total is recorded, which is the no-evidence case. A positive `total` with nothing
passed or failed is a recorded but unrun suite: it reports `unrun`, says every counted example did
not run, and never reads as passed or partial. A present-but-invalid count, or a valid `total`
smaller than `passed + failed`, reports the neutral `unavailable` state: the chip shows an icon and
the theme's "Unknown" label with no visible count and no `data-passed`, `data-failed`, or
`data-total` attribute, so a bad report never masquerades as a valid execution state. A valid report
still reports `failed` when anything failed, `partial` when the entry's `total` counts more examples
than the results cover, and `passed` otherwise. A partial chip says how many examples did not run, so
a partly run page never reads as a full pass. The icon shape, the visible text, and the counts all
carry the result, so colour is never the only signal.

`lastPassed` is formatted in the page's calendar: Gregorian for English, Jalali for Persian, and Hijri
for Arabic, using the same helper as the "last updated" line. On an `unavailable` chip it still
renders, because the date is separate evidence and the chip only refuses to turn bad counts into a
pass/fail/partial/unrun claim.

## Data

When a site has the data, the page fallback reads `site.data.examples`, keyed by the page's URL:

```yaml
# _data/examples.yml
/guide/install/:
  passed: 2
  failed: 0
  total: 2
  lastPassed: 2026-11-08
```

This is the shape the engine's future `examples.json` report has (`total`, `passed`, and `failed` per
page). `total` may be larger than `passed + failed` when some examples did not run; the chip then shows
them as "not run" and reads as partial. A `total` smaller than the results is ignored. Writing
`examples.json` is a separate open issue (#1465), so today a site can supply the same record itself in
`_data/examples.yml`. The chip only reads what is present; it never runs an example.

## Placement

The chip works wherever it is placed, but automatic per-block placement needs engine example markers
(N01/N06), which tell the engine which code blocks are runnable and where their results belong. Until
those land, place the chip with the directive beside the block, or let a layout or plugin render it
from `site.data.examples`. This unit does not edit the code component, the layouts, or the pipeline
.

## Tests

`test/component-tested-chip.test.ts` covers the passed, partial, unrun, failed, and mixed states, the
no-evidence cases, the data fallback, the date tooltip in every language, escaping, and the
stylesheet's tokens and logical properties.
