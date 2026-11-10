# Shortcuts

The keyboard shortcuts dialog: a `<dialog>` with a heading and a definition list of every shortcut the theme defines.

- `index.ts` renders the dialog, its close button, and the static list. It starts `hidden` so a visitor without JavaScript never sees it.
- `client.ts` opens the dialog on `?` (Shift+/), ignoring fields the reader is typing in; Escape or the close button closes it, and focus returns to the element that was focused before it opened.
- `style.css` draws the dialog and its keycaps with logical properties, so it works in right-to-left pages.

The list is static and names `Ctrl/Cmd+K` for search rather than the platform's one hint. It marks each action that needs JavaScript:

| Keys | Action | Needs JavaScript |
| --- | --- | --- |
| `/`, `Ctrl/Cmd+K` | Search | yes (`chrome/search/client.ts`) |
| `m` | Copy page as Markdown | yes (`chrome/copy-markdown`, T05) |
| `?` | This dialog | yes (`client.ts`) |

`layouts/base.ts` places the dialog on every page, so one id set (`shortcuts-title`, and the close button) appears once per document. The search shortcut keeps `/` and `Ctrl/Cmd+K`; it does not accept `?`, so the two shortcuts never compete.

Known gap: the engine does not yet write the theme's chrome islands into built pages, so the dialog stays hidden in a build until island wiring lands. The keyboard gate serves the islands itself in the meantime.
