# Language switcher

A list of the site's languages in the header, one link per language, each to the same page under that
language's URL prefix. The header chrome places it in the header actions, before the repository link.

## Languages

The switcher reads `languages` from the site config, in config order:

```yaml
lang: en
languages:
  - code: en
    name: English
    prefix: ""
  - code: fa
    name: فارسی
    prefix: /fa
```

Without `languages` the site has one language (`lang`), and the switcher renders nothing. A list with
one entry renders nothing too, so a one-language site never shows a control with nothing to switch to.

## URLs

A link keeps the rest of the page path. The unit removes the site's `base` and the current language's
prefix from `page.url`, then adds the target language's prefix back:

| Page | Language | Link |
| --- | --- | --- |
| `/docs/fa/guide/install/` | `en`, prefix `""` | `/docs/guide/install/` |
| `/docs/fa/guide/install/` | `ja`, prefix `/ja` | `/docs/ja/guide/install/` |
| `/docs/fa/` | `ja`, prefix `/ja` | `/docs/ja/` |

The current language is the configured language whose `code` equals the page's `lang`, else the one
whose prefix the URL starts with. When prefixes nest, the longest wins, so `/ja-jp/` is not split at
`/ja`.

## Alternate URL map

When the page URLs do not follow the prefix, `_data/languages.yml` may provide an `alternates` map.
Each key is a page's identity — its non-empty `translation_key` front matter, else its path without
`base` and without the language prefix — and each value maps a language code to that page's URL:

```yaml
alternates:
  install:                     # the pages set translation_key: install
    en: /guide/install/
    fa: /fa/راهنما/نصب/
  /guide/configure/:           # no translation_key: the shared path is the key
    en: /guide/configure/
    fa: /fa/guide/configure/
```

A URL starting with `/` is relative to the site root and gets `base`; an absolute `http`/`https` URL is
used as it is. Other schemes are ignored and the computed URL is used instead. A missing entry, or a
missing language in an entry, also falls back to the computed URL, so the map only needs the exceptions.

The map lives under `languages` in `_data/languages.yml`; that file also carries the translation
fallback chain the engine reads, which this unit leaves untouched.

## Marking and accessibility

The current language's link carries `aria-current="true"` and the visible word from the theme's i18n
(`language_current`, in English, Persian, and Arabic), so the mark is not colour alone. Every link
carries `hreflang` and `lang` with its language code, and the list is a `nav` with the localised
`language` label. The links are ordinary anchors and the list is always in the document: it is
keyboard operable with no JavaScript and no `client.ts`.

## Keeping the reader's theme

Every language lives on the same origin, and the theme choice is stored under `slipway-theme`
(`THEME_KEY`, shared with the theme switch). A switch to another language therefore keeps the
reader's light, dark, or system choice without a query string or any other hand-off.

## Known gap

The engine does not yet load chrome `style.css` files or chrome `client.ts` islands into a build; only
components carry CSS and islands today. The switcher is pure HTML, so it works regardless. Until the
engine includes unit styles, its rules in `style.css` do not reach a built page; the markup is complete
and accessible without them.
