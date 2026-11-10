# Drift banner

A warning above a page whose documentation no longer matches the code it describes. It shows how many
drift findings the page has and, when the site configures one, a link to the full report.

- `index.ts` renders the component. It reads `site.data.drift`, keyed by the page URL, and renders nothing
  when the page has no findings. The number and link text come from `i18n/*.json` (`drift_finding`,
  `drift_findings`, `drift_details`) in the page's language.
- `style.css` draws the banner with a warning accent on the inline start edge, so it moves under RTL.
- `test/component-drift-banner.test.ts` covers both data shapes, one and many findings, the details link,
  localisation, escaping, and the stylesheet's tokens.

The doc layout places the banner automatically above the page content, so there is no Markdown directive.
Until the engine's `drift.json` output lands, `site.data.drift` is absent and the banner stays hidden; a
site can keep its own `_data/drift.yml` in the meantime. A file may write either shape:

```yaml
"/guide/install/":
  - message: The option was renamed.
    line: 42
```

```yaml
pages:
  "/guide/install/":
    - message: The option was renamed.
      line: 42
```

The optional details link is `theme.options.drift.detailsUrl`: a path on this site or an `https` link.

```yaml
theme:
  options:
    drift:
      detailsUrl: /drift/
```

See `site/components/drift-banner.md` for the full reference.
