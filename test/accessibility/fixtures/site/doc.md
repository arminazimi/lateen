---
title: Document
description: The document layout with one of each interactive component state.
layout: doc
permalink: /doc/
---

The document layout is the shape most pages use. This page carries the component states the
gate needs: prose with links, callouts, code, code tabs, disclosures in both states, steps, a
terminal session, tabs, and a table.

## Prose

A paragraph with a [link to the API page](/api/) and inline `code`. A list keeps its reading order:

1. First step.
2. Second step with a [link](/versions/).
3. Third step.

## Callout

:::callout{type=warning title="Back up first"}
A warning callout with a title.
:::

## Code

```ts
export const answer = 42;
```

:::code-tabs{labels='["npm","pnpm"]'}
```bash
npm install @velella/lateen
```

```bash
pnpm add @velella/lateen
```
:::

## Details

:::details{summary="A closed disclosure"}
The body of a disclosure that starts closed.
:::

:::details{summary="An open disclosure" open}
The body of a disclosure that starts open.
:::

## Steps

:::steps
1. Install the theme.
2. Build the site.
3. Audit the result.
:::

## Terminal

:::terminal
$ npm test
ok 1 - the suite passes
:::

## Tabs

:::tabs{group="a11y-fixture"}
### npm

The npm command.

### pnpm

The pnpm command.
:::

## Table

| Key | Value |
| --- | --- |
| theme | light and dark |
| direction | ltr and rtl |

Press :kbd[Ctrl+K] to search.
