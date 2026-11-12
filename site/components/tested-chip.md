---
title: Tested chip
description: A small chip beside a code block that says whether its examples passed, with when they last passed.
layout: doc
permalink: /components/tested-chip/
---

A tested chip shows the result of a page's examples in one line: an icon, the word "Tested", and how many examples passed or failed. It is an inline chip, sized to sit next to a code block or under it. It renders nothing when the block or page has no report at all. A report that counted examples but completed none renders as not run, so a recorded unrun suite is not hidden. A report whose counts cannot be trusted — a negative, a fraction, an unsafe integer, a blank, a non-numeric string, or a `total` smaller than the results — renders as the neutral `unavailable` chip instead of a plausible-looking result, so malformed data never passes as evidence.

The icon's shape, the visible label, and the counts carry the result, so it never depends on colour alone.

## Syntax

```markdown
::tested-chip{passed=2 failed=0 lastPassed=2026-11-09}
```

`tested-chip` is a leaf directive: it has no body and takes every value from its attributes.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `passed` | count | none | Examples that passed. |
| `failed` | count | none | Examples that failed. |
| `total` | count | none | Examples the report counted. Any above `passed + failed` did not run. |
| `lastPassed` | ISO date | none | When the examples last passed, shown as a tooltip and read by screen readers. |

A count is a whole, non-negative, safe integer. A value that is missing or blank, or that is negative, fractional, larger than `Number.MAX_SAFE_INTEGER`, or non-numeric, is present-but-invalid and never becomes `0`. When no count is given, the chip reads the page's entry in `site.data.examples`. When the props are present they win.

The chip is hidden when there is no report, or when every supplied count is a valid zero and nothing else is recorded. A positive total with nothing passed or failed shows every example as not run, in the `unrun` state. The chip reads as failed when any example failed, as partly tested when some examples did not run, and as the neutral `unavailable` state when a supplied count is invalid or a valid `total` is smaller than `passed + failed`. A `lastPassed` date never turns an unrun, partial, or unavailable suite into a pass.

The state is available to machine readers as the chip's class: `tested-chip-passed`, `tested-chip-partial`, `tested-chip-unrun`, `tested-chip-failed`, or `tested-chip-unavailable`. `data-passed`, `data-failed`, and `data-total` are emitted only for a valid report; the `unavailable` chip has no count attributes, so no fabricated number leaks out.

## Example

::tested-chip{passed=2 failed=0 lastPassed=2026-11-09}

::tested-chip{passed=0 failed=1 lastPassed=2026-11-09}

::tested-chip{passed=2 failed=1 lastPassed=2026-11-09}

::tested-chip{total=5}

::tested-chip{passed=two failed=0}

```markdown
::tested-chip{passed=2 failed=0 lastPassed=2026-11-09}

::tested-chip{passed=0 failed=1 lastPassed=2026-11-09}

::tested-chip{passed=2 failed=1 lastPassed=2026-11-09}

::tested-chip{total=5}

::tested-chip{passed=two failed=0}
```

## Notes

- The tooltip is `Last passed <date>`, in the page's calendar: Gregorian in English, Jalali in Persian, and Hijri in Arabic. It is also available to a screen reader. A malformed report can still show a `lastPassed` tooltip because the date is separate evidence, validated independently.
- A page can supply the result with `_data/examples.yml`, keyed by the page's URL. The engine's `examples.json` report is a separate open issue (#1465), so this fallback reads data a site writes today.

  ```yaml
  /guide/install/:
    passed: 2
    failed: 0
    lastPassed: 2026-11-09
  ```

- Automatic per-block placement needs the engine's example markers (N01/N06), which say which code blocks are runnable. Until they land, place the chip next to the block with this directive.
- Use a [badge](../badge/) for a status label that is not about examples.
