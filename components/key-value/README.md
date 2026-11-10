# Key-value list

`components/key-value/` renders properties, options, or metadata as a semantic `<dl>`: each key is a `<dt>`
and each value a `<dd>`, in two columns that become one below `40rem`.

- `index.ts`: the component, its `key-value` directive, and the parsers for the `items` prop and the body.
- `style.css`: the grid, the long-value wrapping, and the narrow-screen column.
- `test/component-key-value.test.ts`: the props, body, empty, escaping, long-value, and stylesheet tests.

Pairs come from `items`, a JSON array of `{key, value}` objects or `[key, value]` pairs. When that gives no
pairs, the body is read one `key: value` per line, trimming each line and skipping blank lines. Order is kept,
and duplicate keys stay in the list.

The component writes no client script: the list is complete in the HTML.
