---
title: Install and quickstart
description: "Install Lateen next to Mizzen and use it as the theme of a site."
layout: doc
permalink: /install/
---

Lateen is the default theme of [Mizzen](https://arminazimi.github.io/mizzen/): layouts, chrome, components, design tokens, and styles for a docs site that people and agents read. It needs Node 24 or later.

## Install

```sh
npm install --save-dev @velella/mizzen @velella/lateen
```

## Use it

Lateen is the theme Mizzen builds with unless the site names another, so a site with a `mizzen.yml` and some Markdown needs nothing more:

```sh
npx mizzen check .
npx mizzen dev .
npx mizzen build . --out dist
```

To name the theme and hand it options, set `theme` in `mizzen.yml`:

```yaml
theme:
  name: "@velella/lateen"
  options:
    logo:
      light: /brand/mark-light.svg
      dark: /brand/mark-dark.svg
```

Every option is in [Tokens and options](/tokens/). The pieces pages use in their content are in [Components](/components/), and the page shapes are in [Layouts](/layouts/).

## What the theme does not do

Lateen draws pages; it does not read files, parse Markdown, or write outputs. The engine does all of that and gives the theme a finished site model. The theme may only import types from `@velella/mizzen/contracts`.
