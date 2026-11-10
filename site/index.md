---
title: "Lateen"
description: "A docs theme for people and agents, built on Mizzen."
---

A docs theme for people and agents, built on Mizzen: layouts, chrome, components, design tokens, and styles. The engine reads it only by listing the folders below; adding a unit never edits a shared index file.

It lives in its own repository, split from the Slipway monorepo (ADR 0025 in `arminazimi/slipway`). Check out [Mizzen](https://github.com/arminazimi/mizzen) next to it (`../mizzen`) and run `npm ci` in both; the tests and the docs site build with it.

The theme may `import type` from `@velella/mizzen/contracts`, by package name and never by relative path, and imports nothing else from the engine. Preact is a peer dependency, with `jsx: react-jsx` and `jsxImportSource: preact` in `tsconfig.json`.
