# Command palette

The command palette extends the existing search dialog (`chrome/search/`) with actions next to page
results: switch the theme to light, dark, or system; copy the page as Markdown; and jump to any
section heading. There is one dialog, not two.

`actions.ts` is pure. `paletteActions({ page, base })` returns the list, each action a stable `id`, a
localised `label`, an optional `hint`, and a `run` descriptor (theme choice, Markdown twin URL, or
heading id). Nothing touches the DOM, so the server can render the list and the client can execute
it.

`index.ts` publishes that list as one inert `<script type="application/json"
data-palette-actions>` inside the search dialog. `chrome/search/index.ts` places it, and
`chrome/search/client.ts` parses it, groups actions under "Actions", filters actions and page results
on the same query, and runs the selected action:

- **Theme** writes the choice to the same `localStorage` key the theme switch uses and sets
  `data-theme` on `<html>`.
- **Copy** fetches the page's Markdown twin and writes it to the clipboard, as the copy-page control
  does.
- **Section** scrolls the heading into view, focuses it, and closes the dialog.

`/` and Ctrl/Cmd+K open the dialog. Arrow keys move through actions and page results as one list,
Enter runs or opens the focused item, Escape closes, and Tab stays inside. Focus rings are visible.

## Known gap

Client islands are not wired into built pages yet (the same gap as `chrome/copy-markdown` and
`chrome/shortcuts`). In a built site the search dialog and this payload are not placed, so the
palette is exercised by the theme tests only. When islands are wired, the search island and this
script need to be placed together by the header or base layout.
