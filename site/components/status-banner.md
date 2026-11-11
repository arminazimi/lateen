---
title: Status banner
description: A page-level banner for a deprecated, experimental, or old-version page, with a link to its replacement.
layout: doc
permalink: /components/status-banner/
---

A status banner marks a whole page as deprecated, experimental, or about an old version. It shows an icon and a visible label, so the meaning never depends on colour alone. When you give it a replacement, the banner links to the page that replaces this one.

The banner is a leaf directive, so it has no body and takes its text from its attributes.

## Syntax

```markdown
::status-banner{status=deprecated replacement="/guide/new-install/" version="0.2.0"}
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `status` | `deprecated`, `experimental`, or `old-version` | none | The banner's kind, with its own icon, label, and colour. Any other value, or none, renders nothing. |
| `replacement` | site path or `https` URL | none | The page that replaces this one, linked after "Replaced by". Anything else is not shown as a link. |
| `version` | string | none | The version the status applies to, shown after "Since". Missing or blank shows nothing. |
| `id` | string | `status-banner-<status>` | The banner's id base. Only letters, digits, `-`, and `_` are kept; a repeat on the same page gets a numeric suffix. |

Spaces and underscores in `status` are read as hyphens, so `old_version` and `Old Version` both mean `old-version`.

## Example

::status-banner{status=deprecated replacement="/components/page-status/" version="0.2.0"}

::status-banner{status=experimental}

::status-banner{status=old-version version="0.1.0"}

```markdown
::status-banner{status=deprecated replacement="/components/page-status/" version="0.2.0"}

::status-banner{status=experimental}

::status-banner{status=old-version version="0.1.0"}
```

## Notes

- The directive is block-level in Markdown: put it on its own line, with a blank line before and after.
- Use status banners at the top of the content. Each banner has the role `note` and an id: the first banner of a status keeps the plain id (`status-banner-deprecated`, and so on), while a repeat of the same status gets a numeric suffix (`status-banner-deprecated-2`, and so on) and names its own visible label.
- An explicit `id` replaces the status-derived base. It is reduced to letters, digits, `-`, and `_`, so it cannot inject markup, and an id already used on the page is numbered rather than duplicated.
- `data-status` and `data-severity` expose the banner's normalized status and its severity (`critical`, `warning`, or `info`) to scripts and styles. Neither is a claim about the page's trustworthiness.
- This component is written in the page content. For a banner above the title, driven by the `status`, `since`, and `replaced_by` front matter keys, use [Page status](../page-status/).
- Remove the banner when the page is current again. A status banner left on a finished page is worse than no banner.
