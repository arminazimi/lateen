---
title: Drift banner
description: A warning above a page whose documentation has drifted from the code, from the site's drift data.
layout: doc
permalink: /components/drift-banner/
---

A drift banner warns that a page no longer matches the code it documents. The doc layout places it above the page content automatically, so an author does not write a directive. It names the number of findings, lists each finding with its own severity and source span, and, when the site configures one, links to the full report.

The banner is hidden when the page has no findings, so it appears only where the data says something is wrong.

## Syntax

The banner reads `site.data.drift`, keyed by page URL. A site can keep its own `_data/drift.yml` until the engine's `drift.json` output lands. Either shape works:

```yaml
"/guide/install/":
  - kind: drift.missing-file
    reference: src/install.ts:42
    severity: warning
  - message: The example calls a function that no longer exists.
```

```yaml
pages:
  "/guide/install/":
    - kind: drift.moved-symbol
      reference: src/cli.ts:10-14:3
      severity: error
```

Each key is the page URL including the site's `base`, such as `/evergreen/guide/install/`. The value is a list of findings. The banner counts every finding and renders one row for each, in data order, so the list always matches the count.

## Findings

| Field | What it does |
| --- | --- |
| `kind` or `id` | The check that found the problem, such as `drift.missing-symbol`. Shown as a machine token. |
| `reference` | The cited code span: `path:line`, `path:line-endLine`, or `path:line:column`. Only a repository-relative path is accepted. |
| `path` or `file`, `line`, `endLine`, `column` | The same span as separate fields, when the data does not use `reference`. |
| `severity` | `error`, `warning`, or `info`. A missing or unknown value reads as `warning`, matching the banner. |
| `message` | A human-readable explanation. Rendered as text. |
| `url` | Optional evidence link. A root-relative path gets `base` in front; an `https` URL is kept as written. |

Each row gets a stable anchor from its position, `drift-banner-finding-1`, `drift-banner-finding-2`, and so on, and carries its own `data-drift-severity`. A validated span also fills `data-drift-path`, `data-drift-line`, `data-drift-end-line`, and `data-drift-column`, so a reader or agent can link to the exact finding.

Malformed data is never turned into a source claim. An unsafe `url` is dropped, so the reference stays plain text. A malformed span, a non-record finding, or a finding with nothing readable is shown as "Not recorded" instead of an invented path, line, or link. The banner itself stays plain HTML, so the whole list reads without JavaScript.

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `theme.options.drift.detailsUrl` | site path or `https` URL | none | Where the details link points. A site path starts with `base`. Missing or unsafe values show no link. |
| `site.data.drift` | map of page URL to findings | none | The findings for each page. An absent key, an empty list, or a value that is not a list hides the banner. |

The number and link text come from the theme's translations (`drift_finding`, `drift_findings`, and `drift_details`), so the banner follows the page's language.

## Example

```yaml
# _data/drift.yml
pages:
  "/guide/install/":
    - kind: drift.missing-symbol
      reference: src/app.ts:12:5
      severity: error
      message: The example calls a symbol the file no longer exports.
      url: /drift/build-42/#finding-3
    - message: The option was renamed.

# mizzen.yml
theme:
  options:
    drift:
      detailsUrl: /drift/
```

On this page that produces a banner saying "2 drift findings", one row with an error and the exact `src/app.ts:12:5` span linked to the build's evidence, one row for the renamed option, and the generic "View drift details" link. The banner renders nothing on a page with no findings.

## Notes

- Until the engine's `drift.json` output lands, the site's own `_data/drift.yml` is the only source, and a site without it sees no banner.
- `pagesOf` accepts both data shapes; a nested `pages` object wins over the top-level keys.
- The details link follows the same safe-scheme rule as other theme links: a root-relative path or an `https` URL. A `javascript:` URL, a protocol-relative `//host`, or a plain relative path is dropped.
- A finding's `url` follows that same rule. It is applied to the reference when the finding has one, otherwise to the kind or message, so a link always has readable text.
- A span is accepted only when its path is repository-relative and its numbers are positive whole numbers. A line range that ends before it starts, a column without a line, a scheme such as `https:` or `javascript:`, a leading `/`, a `..` segment, and a backslash are all rejected rather than corrected.
- In right-to-left pages, the severity, kind, and reference stay left to right and isolated; messages and labels follow the page direction.
