# Changelog: @velella/lateen

Releases of this package are tagged `v<version>`. Add a one-line fragment in `changelog.d/` in any pull request a user would notice; the release tool moves fragments here.

## Unreleased

## 0.2.0-rc.1

Release candidate for the first complete Lateen theme. Every layout, chrome unit, and component now
ships with its keyboard, no-JavaScript, right-to-left, print, and agent path covered.

### Added

- **Complete layout set.** `doc`, `tutorial`, `home`, `api`, `changelog`, `versions`, `search-results`,
  and `not-found`, with one shared chrome: header, sidebar, table of contents, search, pager, footer,
  and page status. Each layout places the last-updated line and the edit link exactly once.
- **Search and command palette.** A Pagefind-backed dialog with grouped results, no-JavaScript fallback,
  and keyboard shortcuts: `⌘K`/`Ctrl+K` and `/` open search, `?` opens the shortcut reference.
- **Agent and block actions.** Copy the page as Markdown, open it in a configured agent, and copy one
  block's prompt with its exact `path:line:column` span, language, and declared version. Code, output,
  terminal, endpoint, and schema blocks publish their canonical values as inert data for agents.
  Contracts, clipboard limits, and security rules: `docs/agent-ux.md`.
- **Trust and freshness evidence.** Trust panel, drift banner, tested chip, page status, last updated,
  and version badge/diff share one vocabulary: `verified`, `unverified`, `stale`, `unknown`, and
  `unavailable`. Every state carries words and an icon, never colour alone, and survives forced colors
  and print.
- **Reproducible examples.** The variables form, terminal, and output block substitute values, use the
  declared input type for native validation, mark recorded output stale when inputs move, and reset to
  the server-rendered defaults. Nothing executes a command.
- **Internationalization and RTL.** English, Persian, and Arabic catalogs, a language switcher that
  names the language actually shown, localized chrome, bidi isolation for mixed text, and right-to-left
  styles. Fallback and bidi rules: `docs/internationalization.md`.
- **Accessibility gate.** axe-core over WCAG 2.2 A/AA on 44 page states in both themes and in English,
  Persian, and Arabic, including the open drawer and search dialog. Findings are reviewed against a
  checked-in baseline; the baseline is not expanded to make a run pass.
- **Performance gate.** Per-route gzip budgets for base/page CSS, chrome and component JavaScript, and
  self-hosted fonts in `fixtures/performance/budget.json`, run by `npm run test:performance` in CI.
  Policy: `docs/performance.md`.
- 2,072 `node:test` cases, `tsc --noEmit`, 97% line coverage, and a package smoke test that installs
  the packed tarball into an empty project and builds the docs site from `node_modules`.

### Changed

- `chrome/page-footer` now renders page actions only: copy the agent prompt and give feedback. The edit
  link and the last-updated line are the separate `edit-page` and `last-updated` chrome units, placed
  once by the doc and tutorial layouts. A custom layout that imports `page-footer` must add those two
  units itself to keep the edit link and date.
- Search option rendering moved into `chrome/search/client.ts`. The chrome asset count stays at 18 and
  no extra request is added.
- At 40rem and below the header wraps its actions onto a second line instead of overflowing the page at
  320px.
- Block actions are hidden in print, including the buttons cloned into blocks after load.

### Fixed

- Duplicate edit and last-updated controls on doc and tutorial pages.
- `placeholder.undefined` warnings in the output-block documentation; `mizzen check site` is back to
  0 errors and 0 warnings.
- Forced-colors and print rules for trust, drift, tested, version, and evidence surfaces.

## 0.1.0

First release: layouts, chrome, components, styles, tokens, fonts, i18n and icons for Mizzen sites. Ships as TypeScript source; Mizzen loads it directly from `node_modules`.

