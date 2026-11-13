# Agent and reader action contracts

Lateen's agent-facing actions are ordinary HTML first: a control that works with the server-rendered
page, then an island that reveals it when the browser can do the job. This page records the contract
each action follows, and the limits a reader or an agent should expect. The tests in
[`test/agent-workflows.test.ts`](../test/agent-workflows.test.ts) hold these promises end to end.

## Block copy prompt

`chrome/block-actions` writes one inert `<template data-block-actions>` per doc page and
`chrome/block-actions/client.ts` clones its button into every top-level `[data-src]` block. A block is
top level when it is not inside another sourced block; blocks whose tag cannot legally hold a button
(`ul`, `ol`, `dl`, `table`, `thead`, `tbody`, `tr`) and blocks whose `data-src` is not a valid span are
skipped.

The template carries the prompt in the page language (`edit_prompt` in `i18n`), and the button carries
the action label, `data-copied`, and `data-copy-failed` for the same language. The island fills two
fields:

- `{source}` — the block's `data-src` span, copied verbatim. Accepted forms are
  `path:line:column-endLine:endColumn`, `path:line:column`, and `path:line`; lines and columns are
  1-based, the end may not run before the start, and the path may contain colons. A code block's
  `data-lang` is appended as `(lang)` after the span.
- `{text}` — the block's current text, with line structure kept. Control characters, bidi overrides,
  line/paragraph separators, and the byte-order mark are removed, and the edges are trimmed, so the
  text cannot forge another prompt field. A `\{{name}}` is ordinary text here; this action never
  expands variables.

The copied prompt is bounded at **8,000 code points** of block text (`MAX_TEXT`). Text that fits is
carried whole, including multiline prose and code. Text that does not fit is cut at a code-point
boundary and says so in the prompt itself:
`[Lateen: text truncated, N of M characters omitted]`. The `data-src` span is not truncated; a span
that fails validation produces no action at all. The stamped button records `data-source`, `data-file`,
`data-lang`, `data-text`, `data-text-total`, and `data-text-omitted` for tooling, and its `aria-label`
names the span: `Edit with your agent (docs/guide/install.md:3:1-9:12)`.

A click writes the prompt and shows the localized success text for `RESET_MS` (2,000 ms), then restores
the label. A refused write shows the localized failure text (`copy_failed`) instead; a failed write is
never reported as a copy.

## Page Markdown copy and the agent menu

For a doc page, the Markdown twin follows one rule (`twinUrl`): a pretty URL such as
`/guide/install/` becomes `/guide/install/index.md`, `/` becomes `/index.md`, `/404.html` becomes
`/404.md`, and a URL that names another file has no twin. Both the copy-Markdown control and the
page-agent menu use the same twin and both render a plain `<a href>` to it, so the link works with no
JavaScript. The site's `base` is applied exactly once.

The copy buttons start `hidden`. `chrome/copy-markdown/client.ts` and the menu's copy button reveal
themselves only when the browser supplies both a clipboard and `fetch`; only then do they request the
twin, write it to the clipboard, and announce loading, success, or failure in their `role="status"`
region. The menu's copy button runs the same shared island as the page control. The page has one `m`
shortcut, owned by the copy-Markdown control and advertised in `aria-keyshortcuts="m"`; the menu
offers the pointer path and no second shortcut.

The page-agent menu is a `<details>` disclosure. Its provider list comes from
`theme.options.pageAgent.providers`; when the site sets none, the menu offers Claude, ChatGPT, and
Cursor. Provider links open in a new tab with `rel="noopener"`.

## Provider URL placeholders

Each configured provider is a `{ title, url }` pair. The URL template is filled in one pass, encoding
every value once with `encodeURIComponent`:

| Placeholder   | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| `{url}`       | absolute page URL                                                  |
| `{markdown}`  | absolute Markdown twin URL                                         |
| `{title}`     | page title                                                         |
| `{lang}`      | page language                                                      |
| `{source}`    | source file from the page's source position                        |
| `{version}`   | the version declared in front matter                               |

`{url}` and `{markdown}` need the site's configured `url`; a provider that asks for a value the page
cannot supply is omitted rather than shown half-filled. A template may use any subset, and duplicate
providers keep their order. Unknown placeholders are left as written; a value that itself contains
braces is copied as text and never expanded again.

Only these schemes are linked: `http:`, `https:`, `cursor:`, `claude:`, `codex:`, and `vscode:`.
A configured `javascript:`, `data:`, or other scheme is dropped, as is an entry without a title or a
URL.

## Variables, outputs, and dependencies

The variables form (`components/variables-form`) is complete without JavaScript: every input carries
its declared default as both `value` and `placeholder`. The island then wires the page:

- `applyValue(root, name, value)` writes one variable into inline placeholder spans
  (`.placeholder[data-var]`) and into code blocks or terminals that recorded the name in
  `data-placeholders`. Blocks are re-rendered from the authored template, so a value that equals
  another variable's token is inserted once and never expanded, and a value that matches text the
  block showed before never rewrites that text. Escaped `\{{name}}` tokens stay literal.
- `activate(root, form)` applies each input's default, records the value the documented examples
  were wired with as that variable's **baseline**, and updates the **current** value on every accepted
  `input` event. Each change calls `applyValue` and `recomputeStaleness`.
- An output block that names variables in `data-output-deps` (inferred from its text or declared with
  the `deps` prop) is **stale** while any dependency's current value differs from its baseline. On
  staleness the island sets `data-output-stale="true"` and fills the `data-output-stale-note` element
  from `data-stale-text`. Restoring every dependency to its baseline clears both. `recomputeStaleness`
  is idempotent.
- The recorded output text is **never rewritten**. It is what a command printed once; the island only
  marks it out of date. An output whose dependency was never held by a wired form keeps whatever state
  it has: freshness is never inferred without a baseline. Outputs with no dependencies are untouched.
- A value the input's declared type rejects (browser constraint validation) never reaches an example
  and never changes an output's state. The reset button restores declared defaults and recomputes
  freshness in the same step.

Values stay in the page: the island writes no cookie, storage, or request, and executes no command.

## Technical reference evidence

`::schema-table` renders its table in the server HTML — names, types, required state, defaults,
allowed values, descriptions, and nested rows — so it reads with JavaScript disabled. Beside the table
it publishes an inert `<script type="application/json" data-schema-fields>` payload (version 2) with
one entry per visible field: `path`, `name`, `anchor`, `depth`, `type`, `copyValue`, `required`,
`default` (`present`/`hasValue`, so an absent default is distinct from `null`), `values`,
`description`, `ref`, `truncated`, and `children`. A reference that did not resolve is published as
`type: "unknown"` with `ref: { value, state }`, where `state` is one of `resolved`, `unresolved`,
`external`, `malformed`, `cycle`, or `depth`; it is never flattened to `any`. The visible table carries
the same facts in `data-field`, `data-ref`, and `data-ref-state` attributes. External references are
reported, never fetched.

## Clipboard and security limits

- **Secure context and user gesture.** The clipboard APIs are only exposed in a secure context.
  Writes run inside the click or keypress handler, so a browser that requires transient user
  activation accepts them; a denied write is reported as a failure, never as success. Lateen does not
  request clipboard permission ahead of time.
- **No clipboard, no control.** With no clipboard the block action, output copy button, page
  copy button, and agent-menu copy button all stay `hidden` and do nothing. The page copy controls also
  require `fetch`; the plain Markdown links remain the no-JavaScript fallback.
- **Links stay safe.** Provider links accept only `http(s)` and the approved app schemes; everything
  else is omitted. External links use `target="_blank"` and `rel="noopener"`.
- **Bounded text, explicit omission.** Source spans are validated and copied verbatim. The block text
  carried with a span is bounded at 8,000 code points and a truncated prompt states how much was
  omitted. Prompt text is stripped of characters that could forge prompt fields.
- **Inert data.** The schema and output evidence is `application/json` inside a `data-` attribute or
  script; it is never evaluated, and `<` is escaped inside the published schema JSON.

## Shortcuts

The shortcuts dialog lists the theme's keys: search (`/` or `Ctrl/Cmd+K`), copy page as Markdown
(`m`), and the shortcuts dialog itself (`?`). `m` and the search keys are distinct. All three stay out
of fields the reader is typing in — input, textarea, select, and contenteditable elements — and the
unmodified character shortcuts (`/`, `m`, `?`) can be turned off with the dialog's preference. The
modified search key keeps working either way.

## Commands

```sh
# the journey tests in this contract
node --test test/agent-workflows.test.ts

# types for the tests and the theme
npm run typecheck

# the whole suite (tokens check plus every test)
npm test
```
