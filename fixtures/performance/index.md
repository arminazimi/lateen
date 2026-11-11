---
title: Overview
description: A plain documentation page with the prose, code, and tables a typical page carries.
layout: doc
permalink: /
---

# Overview

This page stands for a short documentation page: a heading, a few paragraphs, a list, a table, and
one code sample. It loads the theme's chrome islands and the base stylesheet, and nothing from a
component, so it is the light end of the measured range.

## What the page shows

- A paragraph of prose, long enough to wrap two or three times at the reading width.
- A list, because most documentation pages have one.
- A table, because reference pages often put values in a grid.
- A code sample, because a page about software usually has one.

| Field | Value | Notes |
| --- | --- | --- |
| `lang` | `en` | The page language. |
| `layout` | `doc` | The layout this page uses. |
| `permalink` | `/` | The URL the build writes. |

```bash
npx mizzen build site --out dist
```

:::callout{type=note title="A fixture, not a product page"}
The text on this page is written to give the measurement stable input. It is not documentation
anyone reads.
:::

## Why the page is fixed

The budget compares the same routes on every run. Changing this page changes the measurement, so a
change here belongs with a budget update and an explanation in the pull request.
