# i18n

The theme's interface strings, one flat JSON file per language: `en.json`, `fa.json`, `ar.json`.
`index.ts` loads them and exports `t()` for messages with values and `patternOf()` for raw
templates that client code fills later. `schema/i18n.schema.json` describes one catalog, and
`test/i18n-catalogs.test.ts` checks every catalog against it.

## The message contract

- Every catalog carries exactly the keys of `en.json`, and no others. English is the source of truth.
- Keys are `snake_case`, sorted by code point, and values are non-empty plain text.
- A `{name}` placeholder means the same thing in every language. A translation may move it but not
  add, drop, or rename it.
- Values are text, not HTML. The theme renders `t()` output as text nodes and escaped attributes, so
  markup inside a value never becomes markup in the page.
- Add a key to `en.json` first, then to each other catalog, and run `npm test`.

## Fallback rules

`t(lang, key, values)` resolves a message in this order:

1. The catalog for `lang`. A regional code reads its primary subtag, so `fa-IR` reads `fa` and
   `en-GB` reads `en`.
2. `en.json`, when the language catalog or the key is missing.
3. The key itself, when English has it too missing. This never happens while the catalogs satisfy
   the contract; it keeps a broken build readable instead of blank.

Placeholders are filled in one pass from `values`. A value the caller did not supply is dropped
rather than rendered as `{name}`, so a template artifact never reaches the reader.

## Development diagnostics

A missing catalog, a key that is missing from a non-English catalog, an unknown key, and an
unsupplied placeholder each write one `console.warn` naming the language and key. Repeated
occurrences are reported once per build, and `NODE_ENV=production` silences all of them.

## Direction isolation

A value whose first letter faces the other way from its message (an English reviewer name inside a
Persian sentence, or the reverse) is wrapped in Unicode isolates, U+2068 FIRST STRONG ISOLATE and
U+2069 POP DIRECTIONAL ISOLATE. The reader's browser then keeps the words in order without any
markup or styling. Numbers, paths, and punctuation are neutral and are left alone.
