---
title: Schema table
description: A JSON Schema from the site's data folder as a table of properties, types, defaults, and descriptions.
layout: doc
permalink: /components/schema-table/
---

A schema table turns a JSON Schema into the properties table a reference page needs: name, type, whether it is required, its default, its allowed values, and its description. Nested properties are indented under their parent, and `$ref` is followed within the same document.

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
  "version": 1,
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
      "truncated": null,
      "children": []
    }
  ]
}
```

- `fields` keeps the table's order and nesting: nested properties and array-item fields appear under their parent in `children`, each with its dotted `path`, `depth`, and the row's `anchor` id.
- `required`, `values` (from `enum` or `const`), `description`, and `copyValue` (the row's current copy text) carry the row's evidence as the table shows it.
- `default` tells absent from explicit null: `present` is whether the schema has a `default` keyword, and `hasValue` is whether that default is a readable value — so `"default": null` publishes `{ "present": true, "hasValue": true, "value": null }` while a field with no default publishes `{ "present": false, "hasValue": false }`. `false` and `""` defaults survive as themselves.
- `truncated` marks where expansion stopped early — `"cycle"` for a `$ref` already on the way down, `"depth"` at the level the depth limit cut off — so an empty `children` never implies a leaf when it is not one.

## Notes

- The schema is read from `_data`, so the page and the schema stay separate. A schema that is not there renders a message naming the missing file.
- Column headers, the `required` cell, the default table name, and every message come from `i18n/*.json` in the page's language.
- `$ref` must point inside the same document, such as `#/$defs/option`. A reference to another file is ignored.
- Deeply nested schemas stop expanding after eight levels and show the row without its children. The JSON block marks such a row `truncated: "depth"`, and a row cut off by a recursive `$ref` `"cycle"`, instead of implying the tree is complete.
- The table scrolls inside its own region and is reachable by keyboard.
