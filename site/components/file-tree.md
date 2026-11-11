---
title: File tree
description: A nested Markdown list drawn as a folder structure, with a note on each entry and keyboard navigation.
layout: doc
permalink: /components/file-tree/
redirect_from:
  - /blocks/file-tree/
---

A file tree turns a nested list into a folder structure with icons, indentation, and a muted note on each entry. It is a presentational view of a list, so it reads the same without JavaScript. With JavaScript it becomes one keyboard widget: a single tab stop, arrow keys through the visible rows, and folders that open and close.

## Syntax

```markdown
:::file-tree{label="Project layout"}
- content/ # the pages of the site
  - **index.md** # the home page
- mizzen.yml
:::
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `label` | string | `File tree` | The tree's accessible name. |
| `id` | string | `file-tree` | Prefix for the tree's element ids. Without one, each tree on the page gets `file-tree`, then `file-tree-2`, and so on. |

## Keyboard

With JavaScript, the tree is one tab stop: the row you last focused stays in the tab order, and `Tab` leaves the tree. The full behaviour follows the WAI-ARIA tree view pattern.

| Key | What it does |
| --- | --- |
| `ArrowDown` | Moves to the next visible row. |
| `ArrowUp` | Moves to the previous visible row. |
| `Home` | Moves to the first visible row. |
| `End` | Moves to the last visible row. |
| `ArrowRight` | Opens a closed folder, or moves to its first row when it is open. |
| `ArrowLeft` | Closes an open folder, or moves to the parent row. |
| `Enter`, `Space` | Opens or closes a folder. Files have no action. |

Arrow keys do not wrap: at the first or last row the focus stays put. On a right-to-left page `ArrowRight` and `ArrowLeft` swap, because the nesting runs the other way.

## Example

:::file-tree{label="Site layout"}
- content/ # pages and posts
  - **index.md** # the home page
  - guides/
    - install.md
- mizzen.yml # site settings
- assets/
  - logo.svg
:::

## Notes

- The body is a nested bullet list. Each item is one row; nested items are its children.
- A name ending in `/` is a folder. An entry with nested items is a folder even without the slash.
- Text after ` # ` (with a space on each side) is a note on that row.
- A name in bold, `**name**`, is highlighted as the file the page is about.
- Screen readers hear each row's level, its position among its siblings, the name, and the note. A folder with nested rows also reports whether it is open; a folder with no rows cannot open.
- Without JavaScript the complete tree stays visible and every row stays in the tab order. Folders start open: closing one is an enhancement, and the markup the server writes never hides a row.
- Trees without an `id` get page-scoped ids in document order, so two trees on one page never collide. Give an `id` when links or tests should keep the same prefix across edits. The ids only label rows; the paths in `data-copy-value` never change.
- Keep the tree to the files a reader needs. A whole repository dump hides the three lines that matter.
