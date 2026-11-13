---
title: Variables form
description: A personalization form that fills a page's code-example variables with the reader's own values, without storing them.
layout: doc
permalink: /components/variables-form/
tags:
  - components
  - code
---

A variables form turns the `\{{name}}` placeholders in a page's code examples into labelled inputs. Each input starts with the variable's declared default, and the code examples update as the reader types. Values stay in the browser: the component sets no cookie, writes no storage, and makes no request. Without JavaScript the form still shows every default, so the page reads correctly and a reader can copy the values by hand.

## Syntax

```markdown
::variables-form{id="quickstart" group="install"}
```

The component reads the N33 declaration shape from the page's front matter and `site.data.variables`, or from a JSON list in its `variables` prop. A code example uses the same variable in braces:

```bash
curl -H "Authorization: Bearer {{api_key}}" {{host}}/v1/status
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `id` | string | `variables-form` | Prefix for the form's element ids. The first form to claim a base keeps it; later forms on the same page get a `-2`, `-3`, … suffix automatically, so several forms never share ids. |
| `group` | string | the sanitized `id`, then `variables-form` | Connects the form to terminals and output blocks whose `group` matches exactly. Letters, digits, `_`, and `-`. An authored group is marked `data-variable-group-explicit="true"`. |
| `variables` | JSON array | the page and site declarations | The whole list when present: `'[{"name":"api_key","default":"YOUR_KEY"}]'`. When it is absent or unreadable, the page's front matter and `site.data.variables` are used. |

A declaration is `{name, default?, type?}`, the shape the engine's variables output documents. The page's declaration wins over the site's for the same name, and a page declaration without a default keeps the site's default. The form renders nothing when there is no variable.

## Example

::variables-form{id="variables-form-example" variables='[{"name":"api_key","default":"YOUR_KEY","type":"string"},{"name":"host","default":"https://api.example.com","type":"url"}]'}

```bash
curl -H "Authorization: Bearer {{api_key}}" {{host}}/v1/status
```

Type in the form and the command follows. The literal placeholders show what the page looked like before a value was known; the form's islands fill them with the defaults when JavaScript runs.

Each example keeps the text the page author wrote, and every change is rendered from it: a placeholder split across highlighting spans still changes as a whole, and unrelated text that happens to equal a default or the value typed before it is never rewritten.

## Notes

- A form, terminal, and output block belong together only when their `group` values match. On a page with one form and no authored group, ungrouped terminals and code blocks still follow it; with more than one form, give each form and its examples their own group. Two forms with the same variable name then keep independent values. The engine has no group identity for inline code, so grouped inline placeholders are not annotated yet.
- Every variable stays a text input; the declared `type` drives validation and never changes the control. `url` accepts an absolute `http:`/`https:` URL or a root-relative path starting with one `/`; `number` and `boolean` follow their documented forms; `string` and an unknown type accept any text. An invalid input shows a localized message, sets `aria-invalid`, marks its form invalid, and blocks terminal copy for that group. The value never reaches an example.
- Repeated declarations of one name collapse to one input: the later declaration fills fields the earlier one left out and otherwise wins.
- Reset restores that group's defaults, revalidates them, clears invalid and stale state, and announces itself; other groups are untouched.
- The form is a `<fieldset>` with a legend, one visible label per variable, and a hint that values stay in the browser.
- Each input's default is both its value and its placeholder, so the form is complete without JavaScript.
- Changing a variable marks a recorded `:::output-block` that depends on it stale; the recorded text is never rewritten. Freshness follows the values: when every variable the output depends on is back at the value the form started with, whether by typing or by Reset, the stale marker and its note are cleared. A dependency no form on the page holds gives no trustworthy baseline, so the output keeps the state it has; the island never infers freshness it cannot check.
- Focus is visible, and every style uses design tokens and logical properties, so right-to-left pages and dark mode follow.
- The legend and hint are localized through the theme's interface strings.
