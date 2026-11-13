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

The language switcher resolves a page in this order: an explicit `alternates` URL, the page's
`translation_key` route, the language prefix, then the configured fallback chain. A page reached
through a fallback is readable, but it is not a translation: the switcher marks the entry `fallback`,
names the language the reader will actually land in, and the head leaves it out of
`rel="alternate"`. A missing page is `missing` and has no link at all. This keeps the visible
switcher, the alternate metadata, and the reader's expectation of "this page exists in that
language" the same.

A missing catalog message follows the same principle at a smaller scale. The message catalogs are
key-for-key: a language that omits a key falls back to English for that key, and `tools` or a
reviewer should treat that as a gap to fill rather than as a translation. Authored content (front
matter titles, navigation titles, component bodies) is never machine-translated: if a translation is
missing, the fallback page's authored text stays as written and its `<html lang>` names the language
of that text. Do not copy an English sentence into a right-to-left page and mark it as translated;
either translate it or let the fallback page render in its own language.

When adding a page, add its translated siblings in the same pull request or leave the fallback
visible. A translation that exists but is not reachable from the switcher is the same reader problem
as a missing one.

## Authoring bidirectional content

The page's `dir` comes from the page's language, not from the first character of its text. Within an
RTL page:

- Code, file paths, flags, versions, identifiers, and machine values stay left to right. The theme
  sets `direction: ltr` and `unicode-bidi: isolate` on `pre`, `code`, `kbd`, `samp`, and `var`, and
  components add `dir="ltr"` to values that have no element of their own (version names, endpoint
  paths, schema types).
- A Latin run in prose, a contributor name, a date, and a pager title are wrapped in `<bdi>` or an
  equivalent `dir` so they keep their own order without moving the sentence around them.
- Dates keep an ISO `datetime` and an exact `aria-label`; the visible date is localized to the page's
  calendar and wrapped in `<bdi>`. The accessible value never changes with direction.
- Forms keep their labels, hints, and error messages in the page language, and every input's
  accessible name comes from its own `<label>`. The values themselves stay as the author wrote them.
- Icons mirror only when their meaning is "the way the reader moves" (pager, breadcrumb, navigation
  arrows). Media controls and technical symbols do not mirror.
- Use logical CSS properties (`margin-inline`, `border-inline-start`, `inset-inline`) instead of
  physical `left`/`right`, and never insert Unicode bidi control characters into authored text.
  Isolate with markup, not with invisible characters.

`test/multilingual-journeys.test.ts` builds a real English/Persian pair and checks the route and
version context, the alternate links, search and navigation names, code and identifier direction,
date names, and form labels. `test/rtl-css.test.ts`, `test/i18n-catalogs.test.ts`, and the
accessibility gate cover the stylesheet, catalog, and rendered-page sides of the same rules.
