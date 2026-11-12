---
title: Callout
description: A note, tip, important point, warning, or caution with an icon and a color per kind.
layout: doc
permalink: /components/callout/
redirect_from:
  - /blocks/callout/
---

A callout sets a short passage apart from the prose: something to remember, try, or avoid. The five kinds match GitHub alerts, and both syntaxes render the same component.

## Syntax

A container directive:

```markdown
:::callout{type=warning title="Back up first"}
Run the migration on a copy of the database.
:::
```

A shortened directive, where the name is the type and the label is the title:

```markdown
:::tip[Check the version first]
The engine needs Node 24 or later.
:::
```

`:::note`, `:::tip`, `:::warning`, and `:::danger` (read as `caution`) all work this way. Text in
square brackets after the name is the title; without it the kind's default title is used. Every
other directive name is left alone.

A GitHub alert:

```markdown
> [!TIP]
> Run the build before you open a pull request.
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `type` | `note`, `tip`, `important`, `warning`, or `caution` | `note` | The icon, color, and default title. `danger` is read as `caution`. |
| `title` | string | the kind's name | Replaces the heading above the body, and is the callout's accessible name. |

The defaults are **Note**, **Tip**, **Important**, **Warning**, and **Caution**, read from `i18n/*.json` in the page's language. An author's `title` is shown as written. An unknown `type` falls back to `note`.

## Accessibility

- Every callout has the role `note` and takes its accessible name from the title it shows, through `aria-labelledby`. A screen reader announces "Warning, note" rather than an unnamed note, and the name matches the visible text.
- The title element gets an id unique on the page: `callout-<type>-title` for the first callout of a kind, then `callout-<type>-title-2`, `-3`, and so on for repeats. A custom title does not change the scheme, so no two callouts share an id.
- A callout is not an alert and not a live region: it is announced where it sits in the reading order, and never interrupts. The icon is decorative (`aria-hidden`), since the title carries the meaning.
- The title is text, not HTML: an authored title is escaped, and mixed-direction titles keep the order the author wrote.

## Example

:::callout{type=tip title="Check the version first"}
The engine needs Node 24 or later. Run `node --version` before you install.
:::

:::callout{type=warning}
This option changes every page in the site.
:::

> [!CAUTION]
> Deleting the folder cannot be undone.

## Notes

- The body is Markdown, including paragraphs, lists, and code.
- A GitHub alert takes no options; its kind comes from the marker on the first line.
- The icon and the accent border are on the reading side in both directions, and the icons are symmetric, so no separate right-to-left markup is needed.
