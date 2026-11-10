# Output block

The result of a command, shown apart from the input above it. The directive is `:::output-block`; the
body is read as plain text, so it keeps its line breaks and HTML in it stays text.

- `index.ts`: the Preact component, its directive name, and the classes `style.css` and `client.ts` use.
  An empty body renders nothing. The group has an accessible name, "Output" unless `label` says otherwise.
- `style.css`: a dashed edge and the surface color, so the result is distinct from input code. Colors and
  lengths come from tokens, and every property is logical.
- `client.ts`: the copy island. It copies the body and nothing else, reveals the button that starts
  `hidden` only when the browser has a clipboard, and writes the result into a `role="status"` region.
  Without JavaScript the output is still fully visible and the button stays hidden.
