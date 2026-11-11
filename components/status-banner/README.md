# Status banner

A page-level banner that says a page is deprecated, experimental, or describes an old version: an
inline icon, the status as visible text, one line of guidance, an optional version, and an optional
link to the replacement.

- `index.ts` renders the component. Each status has its own icon, label, guidance, and severity
  (`SEVERITIES`: deprecated is `critical`, old-version is `warning`, experimental is `info`), so colour
  is never the only signal. The guidance comes from `i18n/*.json` (`status_deprecated_hint`,
  `status_experimental_hint`, `status_old_version_hint`), and the labels from `status_deprecated`,
  `status_experimental`, `status_old_version`, plus `status_since` and `status_replaced_by`, in the
  page's language.
- `style.css` draws the banner with an accent on the inline start edge, so it moves under RTL, and
  keeps the version and replacement values left to right.
- `test/component-status-banner.test.ts` covers the three variants, icons, labels, guidance, severity,
  the replacement link, old-version, unknown statuses, several banners on one page, escaping, and the
  stylesheet's tokens.

Syntax: `::status-banner{status=deprecated replacement="/guide/new/" version="0.2.0"}`. Each banner is
a `note` named by its label, with an id per status, so several statuses on one page stay distinct and
none is announced as an alert. See `site/components/status-banner.md` for the full reference. For a
banner above the title driven by front matter (`status`, `since`, `replaced_by`), use the separate
`page-status` component.
