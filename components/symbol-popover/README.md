# Symbol popover

An inline chip for a named symbol in running text. Hovering or focusing it reveals the symbol's
signature and, when the directive gives one, a link to its reference page.

- `index.ts` renders the chip and the tooltip. A missing `name` renders nothing; the signature is
  text, so it is escaped like every other text child, and an unsafe `href` renders no link.
- `style.css` hides the tooltip by default and shows it on `:hover` and `:focus-within`, so the
  popover works without JavaScript. It also keeps a visible focus ring and logical spacing.
- `client.ts` is the island: Escape hides the tooltip and leaving the chip resets it. It never
  moves focus or traps it. The island loads only on pages that use the component, once the engine
  pipeline writes component islands into a page; until then the CSS behaviour is all that runs.
- `test/component-symbol-popover.test.ts` covers the markup, the signature and link, missing names,
  escaping, the island's Escape and reset behaviour, and the stylesheet.

Syntax: `::symbol-popover{name="runExample" signature="runExample(input: Input): Promise<Result>" href="/reference/runner/"}`.
It is a leaf directive, so it stands on its own line. A symbol inside an ordinary fenced code block
needs engine markers (not in scope here); the directive is the supported form. See
`site/components/symbol-popover.md` for the full reference.
