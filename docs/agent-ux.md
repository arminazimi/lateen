# Agent and block action contracts

Lateen's page and block actions are progressive enhancements: every piece of documentation is in the
server-rendered HTML and every action is hidden until the island that can perform it is running. A
reader without JavaScript keeps the prose, the code, the recorded output, the Markdown link, and the
provider links; a reader with JavaScript gets the same content plus copy and navigation commands.

## Page actions

| Action | Markup | What it copies or opens | Without JavaScript |
| --- | --- | --- | --- |
| Copy page as Markdown | `.copy-markdown-button`, `data-markdown` | The page's Markdown twin, byte for byte | The visible `View Markdown` link to the same twin |
| Use with an agent | `.page-agent-menu`, `theme.options.pageAgent.providers` | A provider URL built from the page's twin, URL, title, language, source, and declared version | The provider links and the Markdown link |
| Edit with your agent | `.page-footer-copy`, `data-prompt` | A localized prompt naming the page source, its language and declared version, and its title | No button; the source context is in the page |
| Feedback | `.feedback` when `theme.options.feedback.endpoint` is set | One vote for the page, its URL, source, language, and declared version | No widget and no request |

The Markdown twin follows the page URL, so a versioned or prefixed route (`/v2/guide/install/`,
`/fa/guide/install/`) keeps its language and version without the action having to rebuild the URL.
`data-markdown` is the same address the link uses, and the command palette, page copy control, and
provider menu share the twin rule.

## Block actions

Every top-level block with a `data-src` span gets one cloned button from the page's
`template[data-block-actions]`. The template carries the localized prompt pattern and the page's
`data-lang` and, when the page declares one, `data-version`. A cloned button carries:

- `data-source` — the exact `path:line:column-endLine:column` span, as written by the engine;
- `data-file` — the source file without its span;
- `data-lang` — the block's language, when it has one;
- `data-block-id` — the stable id also used by the heading and code anchors;
- `data-text`, `data-text-total`, `data-text-omitted` — the block text as copied, and whether it was
  bounded;
- `data-prompt` — the localized prompt, with `{source}` filled by the source plus language/version
  context and `{text}` by the block text.

A prompt carries at most `MAX_TEXT` (8,000) code points. A longer block is cut at a code-point
boundary and the prompt says how much it left out; `data-text-total` and `data-text-omitted` expose
the counts without forcing an agent to parse the sentence. Control characters and bidi overrides are
removed from the text before it reaches the prompt, so a block cannot forge another prompt field.
The copied block text is never changed by the action.

Code, output, terminal, endpoint, and schema blocks also publish their canonical values as inert
JSON or data attributes: `data-placeholders`, `data-output-deps`, `data-output-evidence`,
`data-terminal-commands`, `data-endpoint-operation`, and `data-schema-fields`. An agent can read
those values without scraping styled HTML.

## Keyboard and pointer

The keyboard path is a click on the same native control, not a second handler:

- `m` presses the page's copy-Markdown button, unless unmodified character shortcuts are turned off
  in the shortcuts dialog. The key stays out of inputs, textareas, selects, and contenteditable
  elements, and a second press while a copy is in flight is ignored.
- `/`, `⌘K` (Apple), and `Ctrl+K` open search. Search owns no other letter.
- `?` opens the keyboard shortcuts dialog. The dialog's preference turns off `m`, `/`, and `?`; the
  modified search shortcut always works.
- Every copy result is written to a `role="status"` region. The same localized success and failure
  strings are used by the page copy control, the agent menu, the page footer, and the code/output
  copy islands, so a reader hears one vocabulary wherever the action was started.
- Buttons are native `<button>`s, disclosures use `<details>`/`<summary>`, and block actions are
  cloned from an inert `<template>` only after the clipboard is known to exist. There is one `m`
  shortcut per page and no duplicate id.

## Clipboard and security limits

- Copying needs a browser with `navigator.clipboard.writeText`, a secure context, and a user gesture.
  Without a clipboard the button stays hidden and the Markdown/provider links remain. A denied or
  failed write is announced as failure; the reader can select the text and copy it by hand.
- The page copy action fetches the Markdown twin once per click. It does not write cookies,
  localStorage, sessionStorage, or any other state. A failed request or a refused clipboard leaves
  the page intact and announces the failure.
- No documentation action executes a command. There is no run button, no shell, no child process,
  and no fetch of a command result. Recorded output is author-supplied text; changing an input marks
  it stale rather than re-running anything.
- Provider links and action templates are scheme-checked. A `javascript:`, `data:`, protocol-relative,
  or otherwise unsafe URL is dropped rather than rendered as a link. Values interpolated into a
  provider URL are percent-encoded once, and HTML text is escaped by the renderer.
- The only network requests a static page makes are the local Markdown twin after a click, the
  Pagefind index after search opens, a configured feedback endpoint after a vote, and an embedded
  media provider after the reader presses its load control. Thumbnails, diagrams, and fonts are
  local; Mermaid renders at build time and the browser never loads Mermaid.
- Feedback posts to `theme.options.feedback.endpoint` only when configured. It records one answer per
  page in `sessionStorage` so a reload does not ask twice; the storage write is best-effort and a
  denied storage API does not block the vote.
- The shortcuts preference is stored in `localStorage` under the theme's shortcut key; the theme
  choice is stored under `lateen-theme`. Neither contains page text.

Known limit: a block action's prompt names the page's declared version only when the page declares
one. A page without a `version` front-matter value has no version claim to make, and the action never
invents one.
