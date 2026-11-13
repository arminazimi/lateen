# Diff block

A diff as an ordered list: added and removed lines are styled and named for screen readers, and two
copy actions take either the authored patch or the resulting file. One folder per component.

- `index.ts` is the Preact component, written with `h()`. Its `directive` export is `diff-block`.
  Repeated or slug-equivalent blocks get numbered group and label ids per page, so no two blocks on a
  page share an id and each group names its own label.
- `lines.ts` parses the directive's body into added, removed, context, file, hunk, and meta lines, and
  builds both exports. It is pure, so the tests exercise it without rendering.
- `client.ts` is the island: it reveals the copy buttons only when the browser has a clipboard, and
  each action announces its own result.
- `style.css` uses tokens for both themes and logical properties for right-to-left pages.

The body is a *line-oriented* diff: each line starts with `+` (added), `-` (removed), or a space
(context). A line without a marker is context too, so a fenced `diff` block works as is.

## Exports

- **Patch**: every line exactly as authored, including file and hunk headers and all markers. It
  round-trips to the text inside the directive.
- **Source**: one action per file in the diff, labelled with that file's path. Each writes only its
  own added and context lines, with markers and leading spaces removed; removed lines, headers, and
  the `\ No newline at end of file` marker are left out. A deleted file's source is empty, and files
  are never joined into one ambiguous text.

## Metadata

Each line carries `data-kind` (`added`, `removed`, `context`, `file`, `hunk`, or `meta`). A readable
file header also carries `data-file-old` and `data-file-new`; a `/dev/null` side carries no path. A
hunk header carries `data-hunk-old-start`, `data-hunk-new-start`, and the counts and section only when
the author wrote them. A hunk-shaped line whose metadata cannot be read keeps its text and carries
`data-hunk-unknown="true"`; no line number is invented for it.

## Without JavaScript

The list still shows the whole diff and the reader can select it. Both texts are on the buttons'
`data-diff` and `data-patch` attributes, and the buttons stay `hidden` until the island can write to
the clipboard. The buttons are native `<button type="button">` elements, so Enter and Space work
without extra key handling.

Tests live in `test/component-diff-block.test.ts`.
