---
title: نصب ویجت
description: صفحهٔ فارسی برای بررسی مسیر راست‌به‌چپ و زمینهٔ نسخه.
layout: doc
permalink: /fa/guide/install/
lang: fa
dir: rtl
version: v2
last_modified_at: 2026-03-05
---

## نصب

این صفحه نصب ویجت را توضیح می‌دهد. کد زیر باید چپ‌به‌راست بماند:

```bash
npm install @example/widget
```

:::callout{type=note title="پشتیبان بگیرید"}
پیش از نصب یک نسخهٔ پشتیبان بگیرید.
:::

:::tabs{group="fa-install"}
### macOS

```bash
brew install widget
```

### Linux

```bash
curl -fsSL https://get.example.com | sh
```
:::

:::variables-form{id="fa-variables" variables='[{"name":"api_key","default":"YOUR_KEY","type":"string"},{"name":"host","default":"https://api.example.com","type":"url"}]'}

```bash
curl -H "Authorization: Bearer {{api_key}}" {{host}}/v1/status
```

::tested-chip{passed=3 failed=0 total=3 lastPassed=2026-03-05}
:::

:::endpoint{method=get path="/widgets/{id}" parameters='[{"name":"id","type":"uuid","required":true,"description":"شناسهٔ ویجت."}]'}
یک ویجت را برمی‌گرداند.
:::

::schema-table{data="widget" label="تنظیمات ویجت"}
:::

The identifier `widget_id` and the date 2026-03-05 stay left to right. See the [English page](/guide/install/).
