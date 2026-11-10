---
title: "Lateen"
description: "Lateen is the default theme for Mizzen: layouts, chrome, components, design tokens and styles."
layout: home
hero:
  eyebrow: "v0.1.0 \u00b7 docs theme"
  title: "A docs theme for people and agents."
  lead: "Lateen is the default theme for Mizzen: layouts, chrome, components, design tokens and styles."
actions:
  - label: "Read the docs"
    url: folders/
    primary: true
  - label: "Components"
    url: components/
sections:
  - title: Start
    url: folders/
    description: "How the theme is laid out in folders."
    icon: "M5 4h10l4 4v12H5zM14 4v5h5M9 13h6M9 17h6"
    links:
      - title: "Folders"
        url: folders/
        meta: page
  - title: Build
    url: layouts/
    description: "Layouts, components and design tokens."
    icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
    links:
      - title: "Layouts"
        url: layouts/
        meta: page
      - title: "Components"
        url: components/
        meta: page
      - title: "Tokens"
        url: tokens/
        meta: page
  - title: Customize
    url: overrides/
    description: "Override units and add your own."
    icon: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6"
    links:
      - title: "Overrides"
        url: overrides/
        meta: page
      - title: "Add a component"
        url: add-a-component/
        meta: page
      - title: "Commands"
        url: commands/
        meta: page
      - title: "Layout"
        url: layout/
        meta: page
---


A docs theme for people and agents, built on Mizzen: layouts, chrome, components, design tokens, and styles. The engine reads it only by listing the folders below; adding a unit never edits a shared index file.

It lives in its own repository, split from the Slipway monorepo (ADR 0025 in `arminazimi/slipway`). Check out [Mizzen](https://github.com/arminazimi/mizzen) next to it (`../mizzen`) and run `npm ci` in both; the tests and the docs site build with it.

The theme may `import type` from `@velella/mizzen/contracts`, by package name and never by relative path, and imports nothing else from the engine. Preact is a peer dependency, with `jsx: react-jsx` and `jsxImportSource: preact` in `tsconfig.json`.
