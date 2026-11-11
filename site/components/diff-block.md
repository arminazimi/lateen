---
title: Diff block
description: A diff with added, removed, and context lines, named for screen readers and copyable as the authored patch or the resulting source.
layout: doc
permalink: /components/diff-block/
---

A diff block shows a change to a file as an ordered list: added lines, removed lines, and the context
around them. Each line carries a visible `+` or `−`, added and removed lines carry a "Added:" or
"Removed:" prefix for screen readers, and two copy buttons take the authored patch or the resulting
source.

## Syntax

Write the lines in the directive's body, or wrap a `diff` fence in it:

````markdown
:::diff-block
```diff
 publish:
-  dir: build
+  dir: dist
 keep:
```
:::
````

Each line starts with `+` for an added line, `-` for a removed line, or a space for context. A line
with no marker is context too. File and hunk headers (`diff --git`, `---`, `+++`, `@@`) are shown with
the diff.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `id` | string | derived from the diff | Prefix for the block's label id. Give each identical block on a page its own id. |

## Copy actions

- **Copy patch** writes the diff exactly as authored: every line, marker, and header, so it
  round-trips to the directive's text.
- **Copy source** writes the resulting file: added and context lines, with markers and leading spaces
  removed. Removed lines, headers, and the no-newline marker are left out, so a deleted file copies an
  empty string.

Each button has its own status region, so a slow copy from one action never changes the result shown
for the other. A result that arrives after a newer click on the same button is dropped.

## Example

:::diff-block
```diff
--- a/mizzen.yml
+++ b/mizzen.yml
@@ -1,3 +1,3 @@
 publish:
-  dir: build
+  dir: dist
 keep:
```
:::

## Machine-readable lines

Every line carries `data-kind`: `added`, `removed`, `context`, `file`, `hunk`, or `meta`. File headers
also carry `data-file-old` and `data-file-new` when the path is authored (`/dev/null` has no path). A
hunk header carries `data-hunk-old-start`, `data-hunk-new-start`, and the counts and section only when
the author wrote them. Malformed hunk metadata keeps its text and carries
`data-hunk-unknown="true"`; the component never invents a line number.

## Without JavaScript

The copy buttons start hidden and the island reveals them when the browser can write to the clipboard.
Without JavaScript the list still shows the whole diff and the text can be selected by hand; the patch
and source texts are also on the buttons' `data-patch` and `data-diff` attributes.
