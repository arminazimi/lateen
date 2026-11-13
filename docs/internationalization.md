# Translations in document metadata

A multi-language build already knows which pages are real translations of each other: the language
switcher resolves configured languages, explicit alternates, translation keys, fallback chains, and
pages that do not exist. The page head publishes that same graph as `<link rel="alternate" hreflang>`
tags, so a crawler sees what a reader sees in the switcher.

## What the head carries

For every page the layout writes at most one canonical link and one alternate link per actual
translation:

```html
<link rel="canonical" href="https://example.com/docs/fa/guide/install/">
<link hreflang="en" rel="alternate" href="https://example.com/docs/guide/install/">
<link hreflang="fa" rel="alternate" href="https://example.com/docs/fa/guide/install/">
<link hreflang="x-default" rel="alternate" href="https://example.com/docs/guide/install/">
```

Alternate URLs are absolute and reciprocal: every page in a translation group lists the same set,
including itself, in configured language order. `hreflang` is the configured BCP 47 tag exactly as
written, so `pt-BR` stays `pt-BR` while `pt` stays `pt`.

## Which pages are advertised

Only pages the model resolves as `translated` (or the page itself) become an alternate:

- a page that exists under the language's prefix or `translation_key` route;
- an explicit URL from `_data/languages.yml`'s `alternates` map.

Missing pages are left out, never guessed from the prefix. A page served by a fallback chain is also
left out: it is readable, but it is not a translation, and advertising it would tell a crawler the
content exists in a language it does not.

## x-default

`x-default` is the page in the site's default language (`lang` in the site config) when that page
really exists. Otherwise there is no `x-default`. The rule never guesses a URL and never points at a
fallback, so it is the same for every page in a group.

## Canonical

The canonical is the page's own URL under the configured site `url` and `base`. When the engine
already wrote one (for example from a front-matter `canonical_url`), the layout keeps that link and
does not add a second.

## Site URL and base

Both canonical and alternate links need the site `url`: `hreflang` is only meaningful as an absolute
URL. Without `url` the head gets neither canonical nor alternate links, matching the engine's
canonical behaviour. With a `base` such as `/docs`, every absolute URL keeps it, and so do version
segments and translation-key routes, because the URLs come from the switcher's page model rather
than from string concatenation.

Attribute values pass through the theme's HTML renderer, so a configured URL or language tag
containing quotes or angle brackets is escaped rather than ending the attribute early.

## What this does not change

The fallback chain itself, the visible switcher, and the shared i18n catalogs are unchanged: this
page only describes the metadata the base layout adds on top of them.

## Translation fallback

Interface strings live in `i18n/en.json`, `i18n/fa.json`, and `i18n/ar.json`. `t(lang, key, values)`
and `patternOf(lang, key)` resolve a message in this order:

1. The catalog for `lang`, compared case-insensitively.
2. The primary subtag, when the full tag has no catalog: `fa-IR` reads `fa`, `AR-eg` reads `ar`,
   and `en-GB` reads `en`. The subtag is split on `-` or `_`, so either spelling works.
3. English, when the language has no catalog or the catalog has no such key.
4. The key itself, when English has it too. This keeps a broken build readable instead of blank.

The page's own language drives the guidance, not the site default: the language switcher's landmark
and current word, the version switcher, search, the pager, breadcrumbs, dates, the trust panel, and
the variables form all read `page.lang`. A regional tag therefore reads its primary catalog while the
element keeps the full tag, so a Persian regional page writes `lang="fa-IR"` and still reads `fa`
guidance.

A message a non-English catalog is missing reads English and reports it once. Missing catalogs,
missing messages, unknown keys, and placeholders with no supplied value each write one
`console.warn` naming the language and key:

```text
lateen i18n: no "nl" catalog; using en
lateen i18n: "search_results_failed" is missing from fa; using en
lateen i18n: unknown message key "guide.missing_key"
lateen i18n: "search_count" has no value for {n}
```

Diagnostics are deduplicated per build and silenced with `NODE_ENV=production`, so production HTML is
unchanged while a development build points at the broken message. The shipped catalogs satisfy the
catalog contract in `i18n/README.md` and carry exactly the keys of `en.json`, so the missing-message
branch is a safety net for a site's fork, not a normal path. A placeholder with no value stays
visible as `{name}` rather than reading as a complete sentence that lost its value. A supplied value
whose first letter faces the other way from the message is wrapped in Unicode isolates (U+2068 …
U+2069), so it cannot reorder the sentence; digits and paths are neutral and left alone.

What a site sees: one HTML document per language, with `<html lang dir>` from the page, every control
named in that page's language, and links that keep their route. The version switcher and language
switcher take their URLs from the page model, so a version segment such as `/v2/` and a language
prefix such as `/fa/` are never dropped by translation. A language with no page is not guessed and
is not advertised as an alternate; see the sections above.

## Bidi authoring rules

Direction is carried by attributes and logical CSS, never by rewriting text or swapping markup per
language.

- **Authored names** use `dir="auto"` or `<bdi>`. Language names in the switcher are `dir="auto"`;
  pager titles, breadcrumb titles, the last-updated date, and contributor names are `<bdi>` islands.
  These keep their own order beside a page title or a separator facing the other way. Do not set
  `dir="rtl"` on an authored name to make it "look right"; use `dir="auto"` and let the browser read
  the first strong character.
- **Technical runs are isolated.** `styles/rtl.css` gives `pre`, `code`, `kbd`, `samp`, and `var`
  `direction: ltr`, `unicode-bidi: isolate`, and `text-align: start` on a right-to-left page, but
  leaves an authored `dir` alone. Version values in the version switcher are `dir="ltr"` spans, and
  code, terminal, output, and diff components carry the same isolation in their own stylesheets.
  Identifiers, paths, flags, and versions keep their exact characters and reading order.
- **CSS uses logical properties.** Use `padding-inline`, `margin-block`, `inset-inline-end`,
  `inline-size`, and `block-size` instead of physical edges; `rtl-css.test.ts` rejects physical
  direction properties in every theme stylesheet. Layout mirrors because the writing direction
  changes, not because a second right-to-left stylesheet exists.
- **Mirror only movement affordances.** The pager arrow, breadcrumb separator, and home arrow point
  the way the reader moves, so they mirror under `[dir="rtl"]`. Media controls, the version-diff
  marker, figures, and other technical symbols keep their orientation, because their meaning is not
  a direction. `rtl-css.test.ts` holds the allow-list.
- **Dates follow the locale catalog.** `src/dates.ts` shows Jalali dates on Persian pages and Hijri
  dates on Arabic pages (with their own digits), and the visible text is isolated where the component
  wraps it. The ISO value stays on `<time datetime>` for machines.

How to test: `node --test test/multilingual-journeys.test.ts` renders real doc pages through
`layouts/doc.ts` in English, Persian, and Arabic and walks the whole journey — route context, both
switchers, search, navigation, code, trust evidence, dates, the variables form, catalog fallback,
and the bidi authoring rules. It is the end-to-end companion to `rtl-css.test.ts` (stylesheets),
`i18n.test.ts` (resolution and diagnostics), and `i18n-typography.test.ts` (fonts and line breaking).
When adding a control, give it a catalog key, render it with the page language, and add its journey
to that test rather than a second right-to-left variant.

