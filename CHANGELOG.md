# Changelog: @velella/lateen

Releases of this package are tagged `v<version>`. Add a one-line fragment in `changelog.d/` in any pull request a user would notice; the release tool moves fragments here.

## Unreleased

## 0.2.2 — 2026-11-14

### Changed

- The code block copy control is one small icon button inside the block's top-right corner, on the
  block's own background, with no header strip and no language label. It swaps to a check after a
  copy and its accessible name follows the page language; without JavaScript no control or wrapper
  is added.
- Reading time is quiet metadata under the title instead of a bordered pill that competed with the
  trust chip.

## 0.2.1 — 2026-11-14

### Fixed

- Components a layout renders directly now load their CSS on every page. The engine bundles a page's
  component styles from the components its Markdown used, so a layout-only `style.css` never loaded:
  the trust chip's unsized icon filled the viewport, and reading time, page status, the drift banner,
  changelog entries, and code blocks rendered unstyled. Their rules now live in `styles/parts-<name>.css`,
  which is always loaded.
- The same gap hid two behaviours: code blocks had no copy button on most pages, and Escape did not
  close an open trust panel. Both islands now ship as chrome parts, which load on every page.
- Loading the changelog styles exposed three contrast failures in its category labels; the label text
  now uses the body colour while the chip keeps its category colour on the icon and border.
- A repeated `version-diff` on one page keeps unique ids for its title, list, note, and changes.
- Root-relative images and media take the site base path: `figure` (`src`, `src_dark`, `srcset`) and
  `video` (poster, captions, transcript). A site served under `/lateen` no longer requests `/brand/...`
  from the domain root.

The base stylesheet grows by 1.3 KB gzip and the chrome script by the two islands; the performance
baseline was re-measured and updated.

## 0.2.0 — 2026-11-13

The first complete Lateen theme. Every layout, chrome unit, and component ships with its keyboard,
no-JavaScript, right-to-left, print, and agent path covered.

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
- **Reproducible examples.** The variables form, terminal, and output block connect by an explicit
  `group`, so two forms with the same variable name keep independent values. Every variable stays a text
  input; the declared `url`, `number`, and `boolean` types validate with visible localized messages,
  `aria-invalid`, and a form-level invalid state that blocks terminal copy for that group. Recorded
  output turns stale when a value moves or is invalid, and reset restores that group's server-rendered
  defaults and announces itself. Nothing executes a command.
- **Internationalization and RTL.** English, Persian, and Arabic catalogs, a language switcher that
  names the language actually shown, localized chrome, bidi isolation for mixed text, and right-to-left
  styles. Fallback and bidi rules: `docs/internationalization.md`.
- **Accessibility gate.** axe-core over WCAG 2.2 A/AA on 44 page states in both themes and in English,
  Persian, and Arabic, including the open drawer and search dialog. Findings are reviewed against a
  checked-in baseline; the baseline is not expanded to make a run pass.
- **Performance gate.** Per-route gzip budgets for base/page CSS, chrome and component JavaScript, and
  self-hosted fonts in `fixtures/performance/budget.json`, run by `npm run test:performance` in CI.
  Policy: `docs/performance.md`.
- **Agent skill.** A portable skill in `skills/lateen` teaches a compatible coding agent the theme
  boundary, unit folders, and verification commands: `npx skills add velella-sh/lateen`.
- 2,092 `node:test` cases, `tsc --noEmit`, 97% line coverage, and a package smoke test that installs
  the packed tarball into an empty project and builds the docs site from `node_modules`.

### Changed

- Ships with `@velella/mizzen` 0.2.0; the theme and the engine are tested together at that version.
- Coverage no longer counts the engine's build subprocess, which duplicated every theme module in the
  report and halved the published percentage.
- `chrome/page-footer` now renders page actions only: copy the agent prompt and give feedback. The edit
  link and the last-updated line are the separate `edit-page` and `last-updated` chrome units, placed
  once by the doc and tutorial layouts. A custom layout that imports `page-footer` must add those two
  units itself to keep the edit link and date.
- Variables are validated by the declared type instead of the browser's input type, so the control stays
  a text input and a root-relative `url` is accepted. The type is exposed as `data-type`; existing forms
  keep their markup and defaults.
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

