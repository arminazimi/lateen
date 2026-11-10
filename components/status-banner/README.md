# Status banner

A page-level banner that says a page is deprecated, experimental, or describes an old version: an
inline icon, the status as visible text, an optional version, and an optional link to the replacement.

- `index.ts` renders the component. Each status has its own icon and label, so colour is never the
  only signal. The labels come from `i18n/*.json` (`status_deprecated`, `status_experimental`,
  `status_old_version`), plus `status_since` and `status_replaced_by`, in the page's language.
- `style.css` draws the banner with an accent on the inline start edge, so it moves under RTL, and
  keeps the version and replacement values left to right.
- `test/component-status-banner.test.ts` covers the three variants, icons and labels, the
  replacement link, old-version, unknown statuses, escaping, and the stylesheet's tokens.

Syntax: `::status-banner{status=deprecated replacement="/guide/new/" version="0.2.0"}`. See
`site/components/status-banner.md` for the full reference. For a banner above the title driven by
front matter (`status`, `since`, `replaced_by`), use the separate `page-status` component.
