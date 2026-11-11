# Copy page as Markdown

A button that copies the page's Markdown twin, for pasting into an agent or an editor. The same
twin is offered as a plain link, so the page still gives a reader the Markdown when JavaScript is
off or the browser has no clipboard.

## Files

- `index.ts`: the Preact component. Its default export is the chrome part. It renders nothing for a
  page that is not a doc page (`page.kind !== "doc"`) or whose URL has no Markdown twin.
- `style.css`: the button, the link, and the status region, from design tokens only.
- `island.ts`: the page copy island, shared with `chrome/page-agent-menu`. It fetches the twin on
  click or on `m`, writes it to the clipboard, clears the previous message and marks the
  `role="status"` region `aria-busy` while the request runs, then puts the localized success or
  failure text in that region so a screen reader announces it. The `m` presses the button itself, so
  the key and the pointer run the same path, and it stays out of inputs, textareas, selects, and
  contenteditable elements. It never takes `/`, `?`, or Ctrl/Cmd+K from search, and it ignores a
  second press while a copy is in flight.
- `client.ts`: the copy-Markdown entry point: it reveals the button when `navigator.clipboard` and
  `fetch` both exist, wires the island with the `m` shortcut, and re-exports the island for tests.
- `../../test/chrome-copy-markdown.test.ts`: the unit's tests.

## Strings

The labels come from the theme's string table: `copy_page_md`, `copied`, `copy_failed`,
`view_markdown`, and `copy_markdown_hint` (English, Persian, and Arabic).

## Limits

The engine does not wire chrome islands into built pages yet (`packages/engine/src/pipeline/build.ts`
says so), so a built page currently shows the plain Markdown link and keeps the copy button hidden.
The link is the no-JavaScript fallback and works today; the button and the `m` shortcut start working
when the engine loads chrome islands.
