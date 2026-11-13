# Symbol popover

An inline chip for a named symbol in running text. Opening it reveals the symbol's signature and,
when the directive gives one, a link to its reference page.

- `index.ts` renders a native `<details>` whose chip is the `<summary>`. A missing `name` renders
  nothing; the signature is text, so it is escaped like every other text child, and an unsafe `href`
  renders no link. A chip with no signature and no link stays a static, non-interactive label.
- `style.css` styles the chip and places the panel. The native `<details>` hides the panel while it
  is closed and shows it when open, so the disclosure, its reference link, and keyboard and touch
  opening all work without JavaScript. It keeps a visible focus ring and logical spacing, and puts
  the panel in the flow on narrow screens.
- `client.ts` is the island: it tracks only the open disclosures, so a click or Escape costs work
  proportional to what is open rather than to every symbol on the page, and a closed disclosure
  carries no keyboard listener. Escape closes the open panel and returns focus to the chip, and a
  click outside closes it without moving focus. It never moves or traps focus on its own and changes
  no tab order; the disclosure needs no generated ids, so repeated names cannot collide. The island
  loads only on pages that use the component, once the engine pipeline writes component islands into
  a page; until then the native disclosure is all that runs.
- `test/component-symbol-popover.test.ts` covers the native disclosure semantics, the signature and
  link, missing names, escaping, duplicate names and ids, the island's Escape and outside
  dismissal, the no-JavaScript fallback, and the stylesheet.

Syntax: `::symbol-popover{name="runExample" signature="runExample(input: Input): Promise<Result>" href="/reference/runner/"}`.
It is a leaf directive, so it stands on its own line. A symbol inside an ordinary fenced code block
needs engine markers (not in scope here); the directive is the supported form. See
`site/components/symbol-popover.md` for the full reference.
