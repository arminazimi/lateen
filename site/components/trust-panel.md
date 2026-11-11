---
title: Trust panel
description: A chip under the title that opens the page's trust level, examples, drift, build and review provenance, reviewer, and actions.
layout: doc
permalink: /components/trust-panel/
---

A trust panel tells a reader how much to trust a page: the examples it tested, whether it has drifted
from the code it describes, who reviewed it last, which build produced the evidence, when it was
generated, when a person last reviewed it, and why it has its level. The doc layout puts the chip under
the title automatically when the page has an entry in `site.data.trust`; a page without an entry gets no
chip.

## Syntax

The layout adds it automatically. For a manual panel inside a page:

```markdown
:::trust-panel{level=verified reasons="3 of 3 examples passed|No drift findings" lastReviewer="Ada Lovelace" buildId="build-42" generatedAt="2026-03-06" reviewedAt="2026-03-04"}
:::
```

The layout's panel reads the page's entry from `site.data.trust`, keyed by URL:

```yaml
# _data/trust.yml
"/guide/install/":
  level: verified
  reasons:
    - 3 of 3 examples passed
    - No drift findings
  lastReviewer: Ada Lovelace
  buildId: build-42
  generatedAt: 2026-03-06
  reviewedAt: 2026-03-04
```

The entry also works under a `pages` key, which wins when both shapes are present. When the engine's
`trust.json` output (N14) lands, it will write the same shape.

`buildId`, `generatedAt`, and `reviewedAt` are optional. When the entry omits them, the panel reads
`site.data.build.id` and `site.data.build.generatedAt` (or `.date` / `.asOf`) from `_data/build.yml`, and
the page's review date from `site.data.reviewers[url].date`. A valid build id is exposed as
`data-trust-build`, a generation date as `data-trust-generated`, and a review date as
`data-trust-reviewed`; the two dates render as rows labelled "Updated" and "Reviewed" with exact
`<time datetime>` values, keeping any written time and offset while the visible text stays localised.
A malformed or future date is left out, a review dated after its build is left
out, and a trust entry that names a different build than `site.data.build.id` keeps no build provenance.
None of this changes the level: missing provenance cannot turn a partial, unreviewed, or unknown panel
into a verified one.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `level` | `verified`, `review due`, or `at risk` | none | The chip's level. Any other value renders nothing. Spaces, case, and `_` are ignored. |
| `reasons` | list, or a string split on line breaks or `|` | none | Why the page has this level. |
| `lastReviewer` | string | none | Who reviewed the page last. |
| `buildId` | string | none | The build that produced the evidence. |
| `generatedAt` | ISO date | none | When that build was generated. |
| `reviewedAt` | ISO date | none | When a person last reviewed the page. |

The examples row reads `site.data.examples` by page URL (`passed`, `failed`); the drift row reads
`site.data.drift` by page URL. A missing value says it is not recorded.

The action links are optional, from `theme.options.trust`; `{url}`, `{title}`, `{source}`, `{build}`,
`{generated}`, and `{reviewed}` are filled from the page and its valid provenance, and a root-relative
URL gets the site's `base`:

```yaml
theme:
  options:
    trust:
      contextPackUrl: "https://example.com/context?page={url}&build={build}"
      suggestEditUrl: "https://github.com/example/docs/edit/main/{source}"
```

Every placeholder value is percent-encoded. A link whose option is missing, whose value is not a site
path or an `https` URL, or that asks for provenance the page does not have, is left out.

## Example

:::trust-panel{level=verified reasons="3 of 3 examples passed|No drift findings" lastReviewer="Ada Lovelace"}
:::

:::trust-panel{level=review-due reasons="Reviewed more than 90 days ago."}
:::

## Notes

- The chip is a native `<details>` summary, so it opens with Enter, Space, or a click and closes with
  Escape without JavaScript. The island only adds the focus return to the chip.
- The text comes from `i18n/*.json` in the page's language, and the panel uses logical properties, so
  it works under RTL.
- Writing `trust.json` per page is a separate issue (N14). Until it lands, the layout's panel stays
  hidden unless the site writes `_data/trust.yml` or a page writes the directive.
