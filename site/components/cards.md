---
title: Cards
description: A responsive grid of linked cards for a home page or a section overview.
layout: doc
permalink: /components/cards/
redirect_from:
  - /blocks/cards/
---

A card is one linked box with an icon, a title, and a description. Cards sit in a responsive grid: one column on a narrow screen, more as the article widens. The home layout uses the grid for its sections.

## Syntax

Cards are front matter, not a Markdown directive. The home layout reads `sections`:

```yaml
sections:
  - title: Write
    url: /guides/
    description: Guides for the engine.
    links:
      - title: Migrate from Jekyll
        url: /guides/migration/
        meta: 20 min
```

Each section is one card. `title` and `url` make the card's heading a link, `description` is the line under it, and `links` is the right-aligned list of links.

## Options

The `card` helper in `components/cards/` takes:

| Name | Type | Required | What it does |
| --- | --- | --- | --- |
| `href` | string | yes | Where the whole card goes. The card is one link — but only when the destination is safe (see Notes). |
| `title` | string | yes | The card's heading. Blank or whitespace-only titles never produce a link. |
| `description` | string | no | Plain text under the heading. It cannot hold a link of its own. |
| `icon` | HTML | no | A decorative icon, hidden from assistive technology. |

## Example

There is no live example on this page: `cards` is a layout component, and `:::cards` is not usable from Markdown yet. The `card` helper has no directive, and the container receives no children from the render host.

Use the home layout with `sections` in front matter, or a Markdown list of links:

- [Callout](../callout/) for a note or warning.
- [Code tabs](../code-tabs/) for one example in several languages.
- [Steps](../steps/) for a numbered tutorial.

## Notes

- Card destinations follow the theme's link-card policy: only root-relative paths (`/guide/`, not protocol-relative `//host`) and `http`/`https` addresses become links. Unsafe, malformed, or blank `href` values — and blank or whitespace-only `title` values — render the card as non-interactive content instead, so a card never becomes a `javascript:` navigation or an unnamed link. The description stays readable as plain text, including with JavaScript disabled.
- Keep a card's description to one line. The whole card is a single link, so a nested link would be invalid.
- Without an icon the card keeps the same layout; the icon is optional.
- For a section overview inside a normal doc page, a list of links reads well and needs no front matter.
- Valid cards show the standard focus ring across the whole card when tabbed to by keyboard.
