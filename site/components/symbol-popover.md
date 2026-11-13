---
title: Symbol popover
description: An inline symbol whose signature and reference open in a native disclosure.
layout: doc
permalink: /components/symbol-popover/
---

A symbol popover names a function, type, or option in running text. The chip is a native disclosure: tap it, click it, or focus it and press Enter or Space to open the signature and a link to the reference page. It works without JavaScript, and the reference link is ordinary content inside the panel rather than a link inside a tooltip.

## Syntax

```markdown
::symbol-popover{name="runExample" signature="runExample(input: Input): Promise<Result>" href="/reference/runner/"}
```

It is a leaf directive, so it stands on its own line with a blank line before and after.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | string | required | The symbol's name, shown on the chip. Without it the component renders nothing. |
| `signature` | string | empty | The signature shown in the panel, as code text. |
| `href` | string | none | A reference page. Root-relative or `http`/`https`; any other URL renders no link. |

Quote a value that has spaces, braces, or angle brackets: `signature="run(input: Input): Result"`.

## Example

::symbol-popover{name="runExample" signature="runExample(input: Input): Promise<Result>" href="/reference/runner/"}

::symbol-popover{name="Result" signature="type Result = { ok: boolean; value: string }"}

## Notes

- The chip is the `<summary>` of a `<details>` element, so the browser opens and closes it with a tap, a click, Enter, or Space. The panel holds no `role=tooltip`, so its reference link is reachable without JavaScript and is valid interactive content.
- With JavaScript, Escape closes an open panel and returns focus to the chip; a click outside closes it without moving focus. The island never traps focus and changes no tab order.
- The island tracks only the panels that are open, so a page with hundreds of symbols does no per-symbol work on a click or a key, and a closed panel carries no keyboard listener.
- The disclosure needs no generated ids, so repeating a symbol name, or passing an explicit id, cannot produce duplicate relationships.
- A symbol inside an ordinary fenced code block needs engine markers, which are not in scope yet. The directive is the supported form for now.
