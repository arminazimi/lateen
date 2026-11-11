---
title: Reference
description: A component-heavy page with tabs, code tabs, OS tabs, and a terminal.
layout: doc
permalink: /reference/
---

# Reference

This page stands for the heavy end of a documentation site: several components that ship a client
island, each adding its module to this route's page bundle. The prose is deliberately short so the
measurement is mostly the components themselves.

:::code-tabs{labels='["npm","pnpm"]'}
```bash
npm install @velella/lateen
```

```bash
pnpm add @velella/lateen
```
:::

:::tabs{group="performance-fixture"}
### Theme

The theme supplies layouts, chrome, components, tokens, and styles.

### Engine

The engine reads the theme folders and writes the site.

### Site

The site supplies content and configuration.
:::

:::os-tabs{id="performance-fixture-os"}
### macOS

```bash
brew install mizzen
```

### Linux

```bash
curl -fsSL https://get.example.com | sh
```
:::

:::terminal
$ node scripts/performance-budget.ts
route          class           assets      raw B     gzip B
/              css/base             1     30,000      6,000
:::

| Component | Island | Purpose |
| --- | --- | --- |
| Code tabs | yes | Group code samples |
| Tabs | yes | Group sections |
| OS tabs | yes | Group install steps |
| Terminal | yes | Show a shell session |

Press ::kbd[Ctrl+K] to open the command palette. Open the details below for the notes.

:::details{summary="Notes on this route"}
Every component above contributes its stylesheet to the page bundle and its client module to the
route's JavaScript. A page without them shows the lower end of the range.
:::
