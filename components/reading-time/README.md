# Reading time

A chip under the page title with the reading time ("3 minutes read") and, when asked, the word
count. The doc layout places it automatically on every doc page that has an entry in
`site.data["reading-time"]`, the fact behind `reading-time.json`.

- `index.ts` looks the page up by `page.url` and renders the chip. It reads the reading-time fact
  from `site.data["reading-time"]`; the directive's `minutes` and `words` override the stored
  numbers for a manual chip. Three data shapes are accepted: the engine's array of
  `{ url, words, minutes }`, the same list under `pages`, and a `pages` map keyed by the page URL.
  The sentence comes from `i18n/*.json` (`reading_time_*` and `reading_words_*`) in the page's
  language; `pluralCategory` picks the CLDR category with `Intl.PluralRules`. English distinguishes
  one and other, Persian uses one for 0 and 1 and other above that (the noun does not change after
  a numeral), and Arabic uses zero, one, two, few (3 to 10), many (11 to 99), and other.
- `style.css` draws the chip with tokens and logical properties.
- `test/component-reading-time.test.ts` covers the fact lookup in every shape, the props override,
  singular and plural text in English, Persian, and Arabic, the word count, missing and zero data,
  escaping, and the chip's place in the doc layout.

A chip renders nothing when the data has no entry for the page or the reading time is 0, so a page
with only front matter and no prose stays clean.

Syntax: the doc layout adds it; use `::reading-time{minutes=3 words=600 showWords}` for a manual
chip. See `site/components/reading-time.md` for the full reference.
