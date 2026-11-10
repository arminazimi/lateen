---
title: "Components"
description: "Components: Lateen reference."
---

Components are the pieces pages use inside their content. Each name is its folder under `components/` and, where the table shows a directive, the syntax the Markdown writes.

| Component | What it does | Reference |
| --- | --- | --- |
| `badge` | A small inline label for a version or status (`:badge[New]{variant=tip}`). | [Badge](https://arminazimi.github.io/slipway/components/badge/) |
| `callout` | A note, tip, important, warning, or caution (`:::callout{type=warning}`, and GitHub alert syntax). | [Callout](https://arminazimi.github.io/slipway/components/callout/) |
| `cards` | A responsive grid of linked cards. | [Cards](https://arminazimi.github.io/slipway/components/cards/) |
| `code` | Fenced code highlighted at build time with Shiki in light and dark, with a copy button. | [Code](https://arminazimi.github.io/slipway/components/code/) |
| `code-tabs` | The same example in several languages or package managers, as tabs that stack without JavaScript (`:::code-tabs`). | [Code tabs](https://arminazimi.github.io/slipway/components/code-tabs/) |
| `details` | A native disclosure that starts closed unless given `open` (`:::details{summary="…"}`). | [Details](https://arminazimi.github.io/slipway/components/details/) |
| `embed` | A lazy iframe that requests nothing from the provider until it loads (`::embed{src="…" title="…"}`). | [Embed](https://arminazimi.github.io/slipway/components/embed/) |
| `endpoint` | An API endpoint: method, path with parameters, parameter list, and body (`:::endpoint`). | [Endpoint](https://arminazimi.github.io/slipway/components/endpoint/) |
| `figure` | A responsive image with alt text, an optional caption, and an optional credit (`:::figure{src="…"}`). | [Figure](https://arminazimi.github.io/slipway/components/figure/) |
| `file-tree` | A nested Markdown list drawn as a folder tree (`:::file-tree`). | [File tree](https://arminazimi.github.io/slipway/components/file-tree/) |
| `heading-anchor` | Adds a link icon to every h2 to h4; automatic on rendered pages. | [Heading anchor](https://arminazimi.github.io/slipway/components/heading-anchor/) |
| `kbd` | A keyboard key or combination (`:kbd[Ctrl+K]`). | [Kbd](https://arminazimi.github.io/slipway/components/kbd/) |
| `page-status` | An experimental, beta, or deprecated banner from `status`, `since`, and `replaced_by` in front matter. | [Page status](https://arminazimi.github.io/slipway/components/page-status/) |
| `schema-table` | A JSON Schema from `_data` as a table of properties, types, defaults, and descriptions (`::schema-table{data="widget"}`). | [Schema table](https://arminazimi.github.io/slipway/components/schema-table/) |
| `steps` | A numbered sequence, wrapped around an ordered list (`:::steps`). | [Steps](https://arminazimi.github.io/slipway/components/steps/) |
| `table` | Wraps every Markdown table in a labelled scroll region; automatic on rendered pages. | [Table](https://arminazimi.github.io/slipway/components/table/) |
| `terminal` | A shell session where a line starting with `$` is a command and the rest is output (`:::terminal`). | [Terminal](https://arminazimi.github.io/slipway/components/terminal/) |

Each reference page has the syntax, every option, and a live example, and is built with the docs site.
