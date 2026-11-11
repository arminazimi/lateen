---
title: Page status
description: An experimental, beta, or deprecated banner above the title, from front matter.
layout: doc
permalink: /components/page-status/
---

A page-status banner tells a reader that a page is experimental, beta, or deprecated. The doc layout reads the page's front matter and puts the banner above the title; the same component can be shown inside a page with a directive.

## Syntax

In front matter:

```yaml
status: beta
since: 0.3.0
```

To preview one inside a page:

```markdown
:::page-status{status=deprecated since="0.2.0" replaced_by="/components/callout/"}
:::
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `status` | `experimental`, `beta`, or `deprecated` | none | The banner's kind. Any other value renders nothing. |
| `since` | string | none | The version when the status was set, shown as "Since 0.3.0". |
| `replaced_by` | site path or `https` URL | none | The replacement page. Only a deprecated page shows it. |

## Example

:::page-status{status=experimental since="0.3.0"}
:::

:::page-status{status=deprecated since="0.2.0" replaced_by="/components/callout/"}
:::

## Structured evidence

The banner's message element carries the state as attributes in the server-rendered HTML, so an agent can read it without scraping prose and it is available without JavaScript:

| Attribute | Values | Meaning |
| --- | --- | --- |
| `data-page-status` | `experimental`, `beta`, or `deprecated` | The normalized lifecycle status. A page with no banner has no status evidence. |
| `data-page-status-since` | the authored version | Present only when `since` has a non-blank value; absent means no version was supplied. |
| `data-page-status-replacement` | `valid`, `invalid`, `not-applicable`, or `absent` | The replacement evidence. |

The replacement states are:

- `valid`: a deprecated page with a safe link, which the banner shows.
- `invalid`: `replaced_by` was written but is not a safe URL. It is not a link, and the value is not echoed into the HTML.
- `not-applicable`: a non-deprecated page supplied `replaced_by`, so it is not active guidance and no link is shown.
- `absent`: no non-blank `replaced_by` was supplied.

A lifecycle status says nothing about whether a page is trusted, reviewed, or fresh. Read those from their own evidence; the banner adds no such claim.

## Notes

- `status`, `since`, and `replaced_by` are front matter keys. The directive is for a preview inside a page; a real page uses front matter.
- A `replaced_by` that is not a root-relative path or an `https` URL is not shown as a link.
- The label, explanation, "Since" prefix, and replacement link text come from `i18n/*.json` in the page's language, so a Persian or Arabic page shows a translated banner.
- Remove the status when the feature is stable. A beta banner left on a finished page is worse than no banner.
