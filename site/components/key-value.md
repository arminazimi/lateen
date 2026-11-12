---
title: Key-value list
description: Properties, options, or metadata as a two-column list of keys and values that folds to one column on narrow screens.
layout: doc
permalink: /components/key-value/
---

A key-value list shows pairs: a property and its type, an option and its default, a field and its value. It is a description list, so each key is a `<dt>` and each value a `<dd>`, and it reads correctly without CSS or JavaScript.

## Syntax

```markdown
:::key-value
Version: 1.0
License: MIT
:::
```

The `items` prop takes the same pairs as a JSON array, for content that comes from data or a generator:

```markdown
::key-value{items='[{"key":"Version","value":"1.0"},["License","MIT"]]'}
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `items` | string | — | A JSON array of pairs, each `{"key":"…","value":"…"}` or `["…","…"]`. When it is missing or unreadable, the `key: value` lines in the body are used. |

## Example

:::key-value
Version: 1.0
License: MIT
Built with: Lateen
:::

The list keeps the order you write, including duplicate keys. Each line is split at its first colon, the key and value are trimmed, and blank lines are skipped.

## Values

A string value shows exactly as written. Other JSON values show as JSON, so they stay readable and keep their type: a number as `8080`, a boolean as `true`, `null` as `null`, an array as `[1,2]`, and an object as `{"a":1}`. Markup is always text, never parsed: a value containing `<b>` or `</script>` renders escaped and cannot close the element or the payload script.

An absent value is the empty string, and a body pair is always a string, so `Port: 8080` publishes `"8080"` while `{"key":"Port","value":8080}` publishes the number `8080`. An explicit `null` stays `null`.

## Structured pair evidence

Each list publishes an inert JSON block — a `<script type="application/json" data-key-value-pairs>` inside its `<dl>` — with the same pairs the list shows, so an agent reads the authored values without scraping the description list:

```json
{
  "component": "key-value",
  "version": 1,
  "pairs": [
    { "key": "Port", "value": 8080, "type": "number" },
    { "key": "Port", "value": 9090, "type": "number" },
    { "key": "Empty", "value": "", "type": "string" }
  ]
}
```

- `pairs` is an array, not an object, so order is kept and duplicate keys survive; read it in order.
- `type` is `string`, `number`, `boolean`, `object`, `array`, or `null`, and `value` is exactly what the prop supplied. Body-authored pairs are always `string`.
- The block is written with every `<` escaped, so no key or value can close the script early. It is part of the server-rendered page and needs no JavaScript.

## Notes

- Use it for a short set of properties or metadata, not for tabular data with several columns; a [table](../table/) is the right component there.
- A string value is plain text; structured values display as JSON rather than being expanded into links or markup. To link or style part of a value, use Markdown elsewhere, or a [schema table](../schema-table/) when the data is a JSON Schema.
- On a narrow screen the two columns become one, and long values wrap instead of widening the page. A structured value is long by its displayed JSON, so a large object still wraps.
- A malformed `items` prop — not a JSON array, or entries without a usable key — contributes only the pairs it can read; the body fallback still applies when it gives none.
