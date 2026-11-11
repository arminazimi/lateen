---
title: API
description: The API layout with an example panel.
layout: api
permalink: /api/
examples:
  - title: Read a page
    lang: bash
    code: |
      curl https://example.com/api/pages/install
  - title: Search
    lang: bash
    code: |
      curl "https://example.com/api/search?q=theme"
---

The API layout places the body beside a panel of examples on wide screens.

## Parameters

| Name | Type | Required | What it does |
| --- | --- | --- | --- |
| `page` | string | yes | The page's URL path. |
| `q` | string | no | The search query. |

## Response

```json
{ "title": "Install", "url": "/install/" }
```
