---
title: OS tabs
description: Install instructions grouped by operating system, defaulting to the reader's system and remembering a manual choice.
layout: doc
permalink: /components/os-tabs/
---

OS tabs group install instructions by operating system. The reader sees the tab for their system, and a choice they make by hand is remembered on the pages they open next, follows them into other browser tabs, and can be shared as a link. Without JavaScript every section stays visible under its title, so nothing is hidden behind a control that does not run.

## Syntax

A container directive whose body holds one `##` or `###` heading per operating system. The heading's text is the tab label and starts that section:

````markdown
:::os-tabs{id="install-mizzen"}
### macOS

```bash
brew install mizzen
```

### Windows

```powershell
winget install mizzen
```

### Linux

```bash
curl -fsSL https://get.mizzen.dev | sh
```
:::
````

The labels macOS, Windows, and Linux (also `Mac`, `Win32`, `Ubuntu`, and a few other names) tell the island which tab each section is. A heading it does not recognise still becomes a tab, but the island never selects it by name.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `id` | string | `os-tabs` | Prefix for the group's element ids. Give each group on a page its own id. |

## Example

:::os-tabs{id="install-example"}
### macOS

```bash
brew install mizzen
```

### Windows

```powershell
winget install mizzen
```

### Linux

```bash
curl -fsSL https://get.mizzen.dev | sh
```
:::

## Notes

- The tab list starts `hidden`; without JavaScript the sections stack, each under its label.
- The island reads the browser's platform, chooses that tab, and falls back to the first tab when it cannot tell. Phones and tablets report no desktop system, so they see the first tab unless the reader chooses one or follows a link that names one.
- Choosing a tab by hand is remembered in `localStorage["lateen-os-tabs"]` and switches every OS tab group on the page and on later pages that offers the same system. The same choice also reaches other browser tabs open on the site.
- A shared link can name the system with `?os=mac`, `?os=win`, or `?os=linux` (case-insensitive). It wins over the remembered choice and the reader's platform, so a link shows the same panels on any device. A value that names no system is ignored: the remembered choice, then the platform, then the first tab applies.
- Choosing a tab by hand writes `?os=` into the URL with `history.replaceState`, so the link becomes shareable. Other query parameters and the `#` fragment stay as they were, and the page neither scrolls nor moves focus.
- Arrow keys move between tabs, `Home` and `End` go to the ends, and the arrows follow the reading direction in right-to-left pages. Arrow keys count as a choice too, so they switch every group and update the address the same way a click does.
- A group without the chosen system stays on its first tab.
- Component islands are not wired into built pages yet, so a built site shows the no-JavaScript state — every section stacked — until island wiring lands.
- Use [code tabs](../code-tabs/) when the choice is a language or package manager rather than an operating system.
