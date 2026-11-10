# Diff block

A diff as an ordered list: added and removed lines are styled and named for screen readers, and a copy
control takes the new version of the file. One folder per component ([ADR 0023](../../../../docs/adr/0023-engine-theme-boundary.md)).

- `index.ts` is the Preact component, written with `h()`. Its `directive` export is `diff-block`.
- `lines.ts` parses the directive's body into added, removed, and context lines, and builds the copy
  text. It is pure, so the tests exercise it without rendering.
- `client.ts` is the island: it reveals the copy button only when the browser has a clipboard.
- `style.css` uses tokens for both themes and logical properties for right-to-left pages.

The body is a *line-oriented* diff: each line starts with `+` (added), `-` (removed), or a space
(context). File and hunk headers such as `diff --git`, `---`, `+++`, and `@@` are shown as context but
left out of the copy. A line without a marker is context too, so a fenced `diff` block works as is.

Without JavaScript the list still shows the whole diff and the reader can select it. The copy text is
also on the button's `data-diff` attribute, which exists before the island runs.

Tests live in `test/component-diff-block.test.ts`.
