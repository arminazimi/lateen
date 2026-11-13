# Changelog: @velella/lateen

Releases of this package are tagged `v<version>`. Add a one-line fragment in `changelog.d/` in any pull request a user would notice; the release tool moves fragments here.

## Unreleased

## 0.2.0-rc.1 — 2026-11-13

The first release candidate after 0.1.0. It turns the theme from a set of layouts and components
into an integrated documentation system for people and agents: every page keeps its content without
JavaScript, technical blocks carry source and execution context, trust and freshness states share one
vocabulary, and English, Persian, and Arabic pages are first-class.

### Added

- **Layouts** for documentation, home, tutorials, API reference, changelog, version indexes, search
  results, and 404 pages, with a shared base shell.
- **Navigation and chrome**: header, section tabs, sidebar, table of contents, breadcrumb, pager,
  drawer, skip links, announcement bar, feedback, theme switch, last-updated evidence, edit link, and
  language and version switchers.
- **Search** as a keyboard-complete combobox and command palette: grouped page results, page actions,
  a single active option, `/` and ⌘/Ctrl+K shortcuts, and a preference that disables unmodified
  character shortcuts.
- **Code and technical content**: build-time Shiki highlighting in both themes, copy without shell
  prompts or diff markers, code tabs, OS tabs, content tabs, terminal sessions, diff blocks, schema
  tables, endpoints, key–value blocks, file trees, symbol popovers, and Mermaid diagrams with their
  source kept on the page.
- **Agent workflows**: a copyable prompt for every block with its exact source span, page Markdown
  twins, copy and open-in-agent actions that carry page, version, and locale context, reproducible
  variable and output actions, and structured evidence for technical reference blocks.
- **Trust and freshness**: explainable trust panels, drift findings, version badges and diffs,
  tested chips, and recency evidence that name unknown and unavailable states instead of rounding
  them up.
- **Internationalization**: English, Persian, and Arabic catalogs, localized dates and numbers,
  language-aware navigation and metadata, and right-to-left typography and isolation.
- **Accessibility and QA gates**: an axe matrix over every layout, theme, and locale, browser
  journeys for keyboard, focus, zoom, reflow, reduced motion, clipboard, and RTL, and a documented
  manual checklist.
- **Performance measurement**: reproducible gzip, asset-count, and self-hosted-font budgets for
  three fixture routes, wired into the package scripts and CI.

### Changed

- Code, identifiers, version values, dates, and authored names are isolated so mixed-direction prose
  keeps its reading order.
- Copy, source navigation, variable substitution, and technical inspection share one action model and
  one set of feedback messages.
- Component styles use shared semantic tokens for trust, severity, recency, and interaction states,
  including dark, forced-colors, print, and right-to-left output.
- The documentation set now covers accessibility, performance, internationalization, agent actions,
  and component contracts.

### Fixed

- Placeholder diagnostics in the output-block documentation (zero site-check warnings).
- The documentation layout at 200% text size: side columns are capped by the viewport so the article
  keeps a readable column.
- Malformed or impossible evidence (dates, test counts, drift severities, version diffs, trust
  entries) stays visible as unavailable or invalid instead of reading as success.
- Repeated blocks, forms, banners, and tabs get unique identities and accessible names.
- Scroll regions, popovers, disclosures, and overlays work from the keyboard and keep focus.

### Performance

- The integrated theme is measured at 8,851 B gzip of chrome JavaScript (19 modules) and 9,224 B gzip
  of base CSS per route. The baseline refresh and its cause are documented in
  [`docs/performance.md`](docs/performance.md#the-020-baseline-refresh).
- Mermaid renders are cached by normalized source and shared across build processes; diagrams are
  pictures in the built HTML and need no browser runtime.


