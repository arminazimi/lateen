---
title: Version diff
description: A section-by-section comparison of two versions, with a text label and icon shape for every added, removed, changed, or moved section.
layout: doc
permalink: /components/version-diff/
---

A version diff shows what changed between two versions of a page, section by section. Every change
is `added`, `removed`, `changed`, or `moved`, and carries a visible text label beside its own icon
shape, so colour is never the only signal. A moved change also shows its old and new position.

An explicit comparison is never silently hidden. Its state is exposed as `data-diff-state`:
`changes` when every evidence entry was readable and at least one change came out, `incomplete` when
usable changes came out but other entries were dropped as malformed, `unchanged` when two versions
were compared and the change list was explicitly empty, and `unavailable` when a version is missing
or equal or the change evidence could not be read at all. A `changes` or `incomplete` viewer carries
machine-readable `data-changes-usable` and `data-changes-dropped` counts, and an `incomplete` one
adds a visible "Partial" note saying some recorded evidence could not be read — the valid changes and
their navigation stay usable, but a partially unreadable comparison is never called complete or
unchanged. An `unchanged` comparison still names both versions and shows a zero-change count. Only a
page with no comparison written at all renders nothing.

## Syntax

Pass the diff as JSON in the directive's `changes` attribute, with the two versions in `from` and
`to`:

:::version-diff{from="v1" to="v2" changes='[{"kind":"added","title":"Retries"},{"kind":"removed","title":"Legacy flags"},{"kind":"changed","title":"Install"},{"kind":"moved","title":"Upgrade","from":"3","to":"5"}]'}
:::

The same data also works in a page's `versionDiff` front matter, or as the engine's
`diff/<version>/<page>.json` shape, where the four kinds are four lists.

An explicit empty change list compares the two versions and reports that they are unchanged:

:::version-diff{from="0.3" to="0.4" changes='[]'}
:::

If the comparison was requested but none of its evidence can be read, the viewer says it is
unavailable instead of looking like a verified empty diff. When some entries are readable and others
are malformed, the readable changes still render and the viewer marks the comparison incomplete:

:::version-diff{from="v1" to="v2" changes='[{"kind":"added","title":"Retries"},{"kind":"renamed","title":"No such kind"},{"kind":"changed","title":"Install","before":"old","after":"new"},42]'}
:::

The note above the list says the evidence is only partial, `data-diff-state` is `incomplete`, and
`data-changes-usable="2"` with `data-changes-dropped="2"` report exactly what was read and what was
not. The same counts apply to the engine's grouped shape, where malformed entries inside the four
kind lists are counted as dropped.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `from` | string | none | The version the page is compared from. |
| `to` | string | none | The version the page is compared to. |
| `changes` | JSON array | none | The sections that changed, each with `kind`, `title`, and optional `from`, `to`, `before`, and `after`. |
| `data` | JSON object | none | The whole diff, as an alternative to the three attributes above. |

## Example

:::version-diff{from="0.2" to="0.3" changes='[{"kind":"added","title":"Version diff","after":"## Version diff\n\nA section-by-section comparison."},{"kind":"changed","title":"Install","before":"npm install mizzen","after":"npm install @velella/mizzen"},{"kind":"removed","title":"Legacy blocks"},{"kind":"moved","title":"Upgrade","from":"2","to":"4"}]'}
:::

The Previous and Next buttons and the change count start hidden; the island reveals them and makes
one change a single tab stop, with arrow keys moving between changes in reading order. In an
`incomplete` viewer the count, the anchors, and the keyboard navigation cover only the readable
changes — nothing is invented for the dropped evidence. Without JavaScript the whole diff still
reads in order.
