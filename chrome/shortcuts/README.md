# Shortcuts

The keyboard shortcuts dialog: a visible launcher, a `<dialog>` with a heading and a definition list of every shortcut the theme defines, and the preference that turns the unmodified character shortcuts off.

- `index.ts` renders the launcher button, the dialog, its close button, the static list, and the preference checkbox. Both controls start `hidden` so a visitor without JavaScript never sees them.
- `client.ts` reveals the launcher and the dialog, opens the dialog on `?` (Shift+/) and on the launcher, ignoring fields the reader is typing in; Escape, the close button, or a press on the backdrop closes it, and focus returns to the element that was focused before it opened (the launcher, when a pointer or Tab+Enter opened it).
- `preference.ts` reads and writes the reader's choice in `localStorage` under `lateen-shortcuts`. It is shared with `chrome/search/shortcut.ts` and `chrome/copy-markdown/island.ts`, so one choice gates `/`, `m`, and `?` together. Storage that is missing, blocked, or holds anything the theme did not write reads as "on", so a storage failure never takes a shortcut away.
- `style.css` draws the launcher, dialog, and keycaps with logical properties, so they work in right-to-left pages.

The list is static and names `Ctrl/Cmd+K` for search rather than the platform's one hint. It marks each action that needs JavaScript:

| Keys | Action | Needs JavaScript |
| --- | --- | --- |
| `/`, `Ctrl/Cmd+K` | Search | yes (`chrome/search/client.ts`) |
| `m` | Copy page as Markdown | yes (`chrome/copy-markdown`, T05) |
| `?` | This dialog | yes (`client.ts`) |

The launcher sits outside the dialog because it is the only way back in while the preference is off: `?` then types normally, and the pointer control plus every modified key (`Ctrl/Cmd+K`) still work. The preference is read on each key press, so a change takes effect without a reload.

`layouts/base.ts` places this unit on every page, so one id set (`shortcuts-title`, `shortcuts-toggle`, and the close button) appears once per document. The search shortcut keeps `/` and `Ctrl/Cmd+K`; it does not accept `?`, so the two shortcuts never compete.

Known gap: the engine does not yet write the theme's chrome islands into built pages, so the launcher and dialog stay hidden in a build until island wiring lands. The keyboard gate serves the islands itself in the meantime.
