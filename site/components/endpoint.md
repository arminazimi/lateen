---
title: Endpoint
description: An HTTP method, path with highlighted parameters, parameter list, and body for API reference pages.
layout: doc
permalink: /components/endpoint/
redirect_from:
  - /blocks/endpoint/
---

An endpoint opens an API reference entry: the method badge, the path with each parameter highlighted, the list of parameters the path names, and the body that describes the request and response.

## Syntax

```markdown
:::endpoint{method=get path="/users/{id}"}
Returns one user.
:::
```

Parameter metadata comes from `parameters`, a JSON array:

```markdown
:::endpoint{method=get path="/users/{id}" parameters='[{"name":"id","type":"uuid","required":true,"description":"The user id."}]'}
Returns one user.
:::
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `method` | string | no badge | The HTTP method, in any case. Known methods get their own badge color; any other method gets the neutral one. |
| `path` | string | empty | The path. Write parameters as `{id}` (OpenAPI) or `:id` (Express); both are highlighted and listed. |
| `parameters` | string | — | A JSON array of parameter metadata: `{"name":"id","type":"string","required":true,"description":"…"}`. Entries are matched to the path by name; the first entry for a name wins. |

## Example

:::endpoint{method=get path="/users/{id}" parameters='[{"name":"id","type":"uuid","required":true,"description":"The user id."}]'}
Returns the user with this id.

### Response

```json
{ "id": "u_123", "name": "Ada" }
```
:::

:::endpoint{method=post path="/users"}
Creates a user from the JSON body.
:::

## Notes

- The path is marked left-to-right even on a right-to-left page, because paths and parameter names are not prose. Descriptions follow the page direction.
- The parameter list is generated from the path; do not repeat it by hand. An authored `parameters` entry adds the type, required state, path association, and description under that parameter. Without metadata the list stays as before: the name alone.
- Labels and yes/no answers come from the page language (`i18n/*.json`), including regional codes such as `fa-IR`; the type and the location value stay machine tokens (`string`, `path`) marked left-to-right, and the operation JSON is never translated.
- `type` defaults to `string` and `required` defaults to `true`, because every path parameter is part of the URL. An entry for a name the path does not contain is ignored, as is a second entry for the same name; an unreadable `parameters` value changes nothing.
- Every endpoint also publishes an inert `<script type="application/json" data-endpoint-operation>` with its id, method, path, and typed parameters, so agents can read the operation without parsing the badge or the highlighted path.
- Metadata is plain text, never HTML: markup in a type or description is shown as written.
- The body is Markdown. Use headings, code fences, and tables inside it for request and response samples.
