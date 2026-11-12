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
code block records in `data-placeholders`. An output that never repeats its inputs, such as an exit status
or a timing result, declares them in the `deps` prop: a JSON array of variable names such as
`'["project"]'`. The declared names are merged with the inferred ones, in order and once each.

When the reader changes one of those values in the page's variables form, the block is marked
`data-output-stale` and its note (localized as `output_stale`) is filled in: the recorded text is never
rewritten, because only running the command again can change what it printed. The note is an empty
`role="status"` span otherwise, so nothing is announced on load.

A malformed `deps` value gives no declared names, and an item that is not a variable name is dropped, so
the valid names beside it still count. An escaped placeholder in the body (`\{{name}}`) stays literal and
is not a dependency.

## Execution evidence

The `stream`, `exit`, and `duration` props declare what is known about the run that produced the output.
`evidence.ts` validates each one to a state — `valid` (with the parsed value), `invalid` (with the declared
text), or `omitted` — and `index.ts` publishes the three states as an inert JSON script
(`data-output-evidence`) beside the body, so an agent reads them without scraping visual labels and without
touching the recorded text. Nothing is inferred from an omission, least of all success.

- Stream: exactly `stdout`, `stderr`, or `combined`, case as written.
- Exit: plain decimal integer 0–255 (`MAX_EXIT`); signs, base prefixes, leading zeros, separators, and
  words are invalid.
- Duration: whole milliseconds up to `MAX_DURATION_MS` (one hour), as `340`, `340ms`, `2s`, or `1.5s`;
  seconds allow at most three decimals and the value is built from the digits, never by float scaling.

The evidence script renders only when at least one prop is declared, valid or not. Copying still returns
the recorded output exactly; the evidence never enters the clipboard payload.
