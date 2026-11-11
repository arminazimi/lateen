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
