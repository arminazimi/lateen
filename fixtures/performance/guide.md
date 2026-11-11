---
title: Guide
description: A typical documentation page with prose, code samples, callouts, and disclosure.
layout: doc
permalink: /guide/
---

# Guide

This page stands for the kind of page most sites have many of: a guide with ordered steps, two code
samples, a callout, and a disclosure. It uses no component with a client island, so any JavaScript
beyond the chrome comes from the theme's layouts.

## Before you start

The fixture needs Node 24 or later and a checkout of the theme beside it. The script builds this site
into a temporary folder, measures the HTML it finds, and removes the folder.

:::callout{type=tip title="One command"}
Run `node scripts/performance-budget.ts` from the theme's root. It rebuilds this fixture and prints
the inventory.
:::

## Build the site

1. Install the dependencies.
2. Build the fixture.
3. Read the table the script prints.

```bash
npm ci
node node_modules/@velella/mizzen/bin/mizzen.js build fixtures/performance --theme .
```

The build writes one HTML file per page and the shared assets beside it.

```js
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
console.log(html.length);
```

## Keep the baseline honest

:::details{summary="What changes the measurement"}
A new chrome island adds a module to every route. A component island adds a module to the routes
that use it. A stylesheet change grows the base bundle or the page bundle. Front matter and prose
change the HTML, but the budget measures only JavaScript and CSS.
:::

Update the budget only when the change is intended, and say in the pull request what grew and why.
