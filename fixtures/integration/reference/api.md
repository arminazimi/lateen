---
title: API reference
description: The reference layout with an endpoint and a schema table.
layout: api
permalink: /reference/
version: v2
last_modified_at: 2026-03-04
examples:
  - title: Read a widget
    lang: bash
    code: |
      curl https://example.com/v1/widgets/w_123
---

## Parameters

:::endpoint{method=get path="/widgets/{id}" parameters='[{"name":"id","type":"uuid","required":true,"description":"The widget id."}]'}
Returns one widget.
:::

::schema-table{data="widget" label="Widget options"}

## Identifier

The identifier `w_123` and the value `v2.0.1` stay left to right inside this sentence.
