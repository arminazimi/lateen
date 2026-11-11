# Drift banner

A banner above a page whose drift evidence is not clean. It says what changed and what to do next,
and it never presents an unchecked page as a healthy one.

- `index.ts` renders the component. It reads `site.data.drift`, keyed by the page URL, and reports one
  of three states from `evidenceOf`:
  - `drifting` — a finding names code the page cites (`kind` or `reference`), so the page and the code
    have drifted apart. It says "This page cites code that has changed."
  - `stale` — findings only describe the page itself (`message`, `line`), so the page's own content may
    be out of date. It says "This page may be out of date."
  - `unavailable` — the entry is `null` or `{ unavailable: true }`, so the check has no result for this
    page. It says "Drift has not been checked for this page." and draws a dashed accent, so unknown is
    not mistaken for clean.
- The severity comes from the worst finding (`error`, `warning`, `info`; a missing or unknown severity
  is `warning`). `unavailable` is `unknown` and is never `error`, `warning`, or `info`.
- `style.css` draws the banner with an accent on the inline start edge, so it moves under RTL, and
  colours it by severity. Text and icon carry the state; colour is never the only signal.
- `test/component-drift-banner.test.ts` covers the three states, the severity order, both data shapes,
  the details link, localisation, escaping, and the stylesheet's tokens.

The doc layout places the banner automatically above the page content, so there is no Markdown
directive. A clean page, a page with no entry, and a site with no drift data all render nothing, so a
site only shows the banner where its data says something needs attention. A file may write either
shape, and an entry may mark a page as unchecked:

```yaml
"/guide/install/":
  - message: The option was renamed.
    line: 42
```

```yaml
pages:
  "/guide/install/":
    - kind: drift.missing-symbol
      reference: src/app.ts:12
      severity: error
  "/guide/install/legacy/":
    unavailable: true
```

The optional details link is `theme.options.drift.detailsUrl`: a path on this site or an `https` link.
It is the reader's next step for every state.

```yaml
theme:
  options:
    drift:
      detailsUrl: /drift/
```

See `site/components/drift-banner.md` for the full reference.
