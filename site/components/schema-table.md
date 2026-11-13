---
title: Schema table
description: A JSON Schema from the site's data folder as a table of properties, types, defaults, and descriptions.
layout: doc
permalink: /components/schema-table/
---

A schema table turns a JSON Schema into the properties table a reference page needs: name, type, whether it is required, its default, its allowed values, and its description. Nested properties are indented under their parent, and `$ref` is followed within the same document. A reference that cannot be expanded never turns into a bare `any`: the row shows `unknown` plus the authored `$ref` and why it stopped.

## Syntax

```markdown
::schema-table{data="widget" label="Widget options"}
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | string | required | The schema's path under `_data`, without its extension: `widget` reads `_data/widget.json` or `_data/widget.yml`; `guides/steps` reads `_data/guides/steps.yml`. |
| `label` | string | `Properties` | The accessible name of the scroll region. |

## Example

::schema-table{data="schema-table" label="Widget options"}

The file behind this table is `_data/schema-table.json`:

```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": { "type": "string", "description": "The widget's name." },
    "size": { "enum": ["s", "m", "l"], "default": "m" }
  }
}
```

## Structured field evidence

Besides the table, each schema table publishes an inert JSON block — a `<script type="application/json" data-schema-fields>` inside its region — with the same fields the rows show, so an agent can read the schema without scraping formatted cells. The block is part of the server-rendered page and needs no JavaScript. It is written with every `<` escaped, so no value, description, or schema name can close the block early.

```json
{
  "component": "schema-table",
  "version": 2,
  "data": "schema-table",
  "fields": [
    {
      "path": "size",
      "name": "size",
      "anchor": "schema-schema-table-field-size",
      "depth": 0,
      "type": "enum",
      "copyValue": "size: enum",
      "required": false,
      "default": { "present": true, "hasValue": true, "value": "m" },
      "values": ["s", "m", "l"],
      "description": "",
      "ref": null,
      "truncated": null,
      "children": []
    }
  ]
}
```

- `fields` keeps the table's order and nesting: nested properties and array-item fields appear under their parent in `children`, each with its dotted `path`, `depth`, and the row's `anchor` id.
- `required`, `values` (from `enum` or `const`), `description`, and `copyValue` (the row's current copy text) carry the row's evidence as the table shows it.
- `default` tells absent from explicit null: `present` is whether the schema has a `default` keyword, and `hasValue` is whether that default is a readable value — so `"default": null` publishes `{ "present": true, "hasValue": true, "value": null }` while a field with no default publishes `{ "present": false, "hasValue": false }`. `false` and `""` defaults survive as themselves.
- `ref` is `null` when the field authored no `$ref`. Otherwise it carries the authored `value` and its `state`: `"resolved"`, `"unresolved"` (a local pointer with no target), `"external"` (another document or URL), `"malformed"` (not a usable string or JSON pointer), `"cycle"` (a reference already on the way down), or `"depth"` (a deterministic expansion limit). A field whose reference did not resolve shows `type: "unknown"`, never `any`, and its row carries the same evidence in `data-ref` and `data-ref-state`.
- `truncated` marks where expansion stopped early — `"cycle"` for a `$ref` already on the way down, `"depth"` at the level the depth limit cut off — so an empty `children` never implies a leaf when it is not one.
- `version` is `2`: it adds `ref` and the `unknown` type for rows whose reference could not be read.

## Notes

- The schema is read from `_data`, so the page and the schema stay separate. A schema that is not there renders a message naming the missing file.
- Column headers, the `required` cell, the default table name, and every message come from `i18n/*.json` in the page's language.
- `$ref` must point inside the same document, such as `#/$defs/option`. External references are never fetched: the row keeps the authored reference, shows an `external` marker, and reads `unknown` rather than claiming an unconstrained field. JSON pointers decode `~1` and `~0`, and a missing target, invalid pointer, or malformed value is marked rather than silently dropped.
- Deeply nested schemas stop expanding after eight levels and show the row without its children. The JSON block marks such a row `truncated: "depth"`, and a row cut off by a recursive `$ref` `"cycle"`, instead of implying the tree is complete. The visible marker for a reference repeats its authored value and state; the state words are schema vocabulary and read the same in every language, like `any` did.
- The table scrolls inside its own region and is reachable by keyboard.
