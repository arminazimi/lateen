# Copy page as Markdown

A button that copies the page's Markdown twin, for pasting into an agent or an editor. The same
twin is offered as a plain link, so the page still gives a reader the Markdown when JavaScript is
off or the browser has no clipboard.

## Files

- `index.ts`: the Preact component. Its default export is the chrome part. It renders nothing for a
  page that is not a doc page (`page.kind !== "doc"`) or whose URL has no Markdown twin.
- `style.css`: the button, the link, and the status region, from design tokens only.
- `client.ts`: the island. It reveals the copy button when `navigator.clipboard` and `fetch` both
  exist, fetches the twin on click or on `m`, writes it to the clipboard, and puts the result in
  the `role="status"` region so a screen reader announces it. The `m` shortcut stays out of inputs,
  textareas, selects, and contenteditable elements, and never takes `/`, `?`, or Ctrl/Cmd+K from
  search.
- `../../test/chrome-copy-markdown.test.ts`: the unit's tests.

## Strings

The labels come from the theme's string table: `copy_page_md`, `copied`, `copy_failed`,
`view_markdown`, and `copy_markdown_hint` (English, Persian, and Arabic).

## Limits

The engine does not wire chrome islands into built pages yet (`packages/engine/src/pipeline/build.ts`
says so), so a built page currently shows the plain Markdown link and keeps the copy button hidden.
The link is the no-JavaScript fallback and works today; the button and the `m` shortcut start working
when the engine loads chrome islands.
