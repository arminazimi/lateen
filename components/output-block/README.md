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

## Variables

A body that names a variable (`{{project}}`) records the names in `data-output-deps`, the same shape a
code block records in `data-placeholders`. When the reader changes one of those values in the page's
variables form, the block is marked `data-output-stale` and its note (localized as `output_stale`) is
filled in: the recorded text is never rewritten, because only running the command again can change what
it printed. The note is an empty `role="status"` span otherwise, so nothing is announced on load.

Only a body that mentions the variable is known to depend on it; an output that never repeats the value
is not marked stale.
