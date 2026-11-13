<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/velella-sh/lateen/main/.github/assets/mark-night.svg">
    <img src="https://raw.githubusercontent.com/velella-sh/lateen/main/.github/assets/mark-day.svg" width="96" height="96" alt="Lateen">
  </picture>
</p>

<h1 align="center">Lateen</h1>

<p align="center">
  <strong>Easy to read. Safe to edit.</strong><br>
  A docs theme for people and agents, built on Mizzen.
</p>

<p align="center">
  <a href="https://github.com/velella-sh/lateen/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/velella-sh/lateen/ci.yml?branch=main&label=CI&logo=github&logoColor=white&labelColor=1F1F28&color=4C6F9A&style=flat"></a>
  <a href="https://www.npmjs.com/package/@velella/lateen"><img alt="npm" src="https://img.shields.io/npm/v/@velella/lateen?label=npm&logo=npm&logoColor=white&labelColor=1F1F28&color=4C6F9A&style=flat"></a>
  <a href="https://github.com/velella-sh/lateen/actions/workflows/ci.yml"><img alt="coverage" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fvelella-sh%2Flateen%2Fbadges%2Fcoverage.json&labelColor=1F1F28&style=flat"></a>
  <a href="https://skills.sh/velella-sh/lateen/lateen"><img alt="skills.sh" src="https://skills.sh/b/velella-sh/lateen"></a>
</p>

<p align="center">
  <a href="https://velella.sh/lateen/install/">Quick start</a> ·
  <a href="https://velella.sh/lateen/">Documentation</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="https://github.com/velella-sh/mizzen">Mizzen</a>
</p>

---

A docs theme for people and agents, built on Mizzen: layouts, chrome, components, design tokens, and styles. The engine reads it only by listing the folders below; adding a unit never edits a shared index file.

## Why Lateen

- **Easy to read.** An editorial layout with a sidebar, table of contents, and search that works for people and for agents.
- **Safe to edit.** Every visual decision is a design token, and a component is a folder, so a change stays in one place.
- **Accessible.** Tested against WCAG 2.2 AA, with a keyboard gate, a contrast gate, and an RTL gate.
- **Right-to-left ready.** Direction, language, and mirrored icons are handled for RTL languages.

Check out [Mizzen](https://github.com/velella-sh/mizzen) next to it (`../mizzen`) and run `npm ci` in both; the tests and the docs site build with it.

The theme may `import type` from `@velella/mizzen/contracts`, by package name and never by relative path, and imports nothing else from the engine. Preact is a peer dependency, with `jsx: react-jsx` and `jsxImportSource: preact` in `tsconfig.json`.

## Folders

| Folder | One unit is | Guide |
| --- | --- | --- |
| `layouts/` | `<name>.ts` | [layouts/README.md](layouts/README.md) |
| `chrome/` | `<name>/` | [chrome/README.md](chrome/README.md) |
| `components/` | `<name>/` | [components/README.md](components/README.md) |
| `tokens/` | `<group>.json` | [tokens/README.md](tokens/README.md) |
| `styles/` | `<name>.css` | [styles/README.md](styles/README.md) |

## Commands

- `npm test`
- `npm run typecheck`
- `npm run tokens` writes `styles/tokens.css` from `tokens/*.json`; `tokens:check` fails when it is stale.

## Layouts

A page picks a layout with `layout` in its front matter, or gets one from `defaults` in the site config. `mizzen build` uses `doc` when neither sets one.

| Layout | What it renders |
| --- | --- |
| `base` | The document shell: `<head>`, skip link, theme script, and slots for the header, sidebar, main column, aside, and footer. The other layouts build on it; a page does not name it. |
| `doc` | The docs page: header, sidebar, breadcrumb, article, table of contents, pager, and page footer. Front matter `status`, `since`, and `replaced_by` add the page-status banner. |
| `home` | The docs home: a hero, action buttons, and section cards from `hero`, `actions`, and `sections` in front matter. |
| `not-found` | The 404 page, with a search form and links to the home page and the top-level sections. |
| `versions` | The versions index: a page's versions from `site.data.versions` or the `versions` front matter key, each row linked to the same page when it exists and marked with Latest, Deprecated, or Dev in text. |

Each layout is `layouts/<name>.ts`; the rules for adding one are in [layouts/README.md](layouts/README.md).

## Components

Components are the pieces pages use inside their content. Each name is its folder under `components/` and, where the table shows a directive, the syntax the Markdown writes.

| Component | What it does | Reference |
| --- | --- | --- |
| `badge` | A small inline label for a version or status (`:badge[New]{variant=tip}`). | [Badge](https://velella.sh/lateen/components/badge/) |
| `callout` | A note, tip, important, warning, or caution (`:::callout{type=warning}`, and GitHub alert syntax). | [Callout](https://velella.sh/lateen/components/callout/) |
| `cards` | A responsive grid of linked cards. | [Cards](https://velella.sh/lateen/components/cards/) |
| `code` | Fenced code highlighted at build time with Shiki in light and dark, with a copy button. | [Code](https://velella.sh/lateen/components/code/) |
| `code-tabs` | The same example in several languages or package managers, as tabs that stack without JavaScript (`:::code-tabs`). | [Code tabs](https://velella.sh/lateen/components/code-tabs/) |
| `details` | A native disclosure that starts closed unless given `open` (`:::details{summary="…"}`). | [Details](https://velella.sh/lateen/components/details/) |
| `embed` | A lazy iframe that requests nothing from the provider until it loads (`::embed{src="…" title="…"}`). | [Embed](https://velella.sh/lateen/components/embed/) |
| `endpoint` | An API endpoint: method, path with parameters, parameter list, and body (`:::endpoint`). | [Endpoint](https://velella.sh/lateen/components/endpoint/) |
| `figure` | A responsive image with alt text, an optional caption, and an optional credit (`:::figure{src="…"}`). | [Figure](https://velella.sh/lateen/components/figure/) |
| `file-tree` | A nested Markdown list drawn as a folder tree (`:::file-tree`). | [File tree](https://velella.sh/lateen/components/file-tree/) |
| `heading-anchor` | Adds a link icon to every h2 to h4; automatic on rendered pages. | [Heading anchor](https://velella.sh/lateen/components/heading-anchor/) |
| `kbd` | A keyboard key or combination (`:kbd[Ctrl+K]`). | [Kbd](https://velella.sh/lateen/components/kbd/) |
| `page-status` | An experimental, beta, or deprecated banner from `status`, `since`, and `replaced_by` in front matter. | [Page status](https://velella.sh/lateen/components/page-status/) |
| `schema-table` | A JSON Schema from `_data` as a table of properties, types, defaults, and descriptions (`::schema-table{data="widget"}`). | [Schema table](https://velella.sh/lateen/components/schema-table/) |
| `steps` | A numbered sequence, wrapped around an ordered list (`:::steps`). | [Steps](https://velella.sh/lateen/components/steps/) |
| `table` | Wraps every Markdown table in a labelled scroll region; automatic on rendered pages. | [Table](https://velella.sh/lateen/components/table/) |
| `terminal` | A shell session where a line starting with `$` is a command and the rest is output (`:::terminal`). | [Terminal](https://velella.sh/lateen/components/terminal/) |

Each reference page has the syntax, every option, and a live example, and is built with the docs site.

## Tokens

Every visual decision is a design token, defined once and read from CSS. `tokens/names.json` freezes the names; one file per group (`color.json`, `type.json`, `space.json`, and the rest) sets the values. Run `npm run tokens` after editing a group: it writes `styles/tokens.css`, which `npm test` keeps current. Never edit that CSS by hand, and never put a raw color, length, or duration in a unit's stylesheet; use `var(--color-accent)`, `var(--space-4)`, and the other token variables.

A site changes a token in its config, not in the theme. The site config is `mizzen.yml`; the engine passes `theme.options` to the theme unread, and the token overrides live under `theme.options.tokens`:

```yaml
theme:
  options:
    tokens:
      accent: "#0b6e4f"
      canvas: "#ffffff"
      text: "#222222"
      font_body: '"Source Serif 4", Georgia, serif'
      radius: "0.5rem"
```

The keys are the token names that the config maps into the theme's CSS variables: `accent`, `canvas`, `text`, `font_body`, and `radius`. An unset color keeps the theme's light and dark pair; a set one replaces both, so check the contrast in both modes.

## Overrides

The rest of `theme.options` is the theme's as well. Lateen reads these blocks:

```yaml
theme:
  options:
    announcement:
      id: v0-4
      text: Mizzen 0.4 is out.
      href: /changelog/
    editPage:
      headingLinks: true
    logo:
      light: /assets/logo.svg
      dark: /assets/logo-dark.svg
    footer:
      copyright: © 2026 Example
      license: MIT
      links:
        - title: Source
          url: https://github.com/example/site
    pageAgent:
      providers:
        - title: Claude
          url: "https://claude.ai/new?q=Read+{markdown}"
    feedback:
      endpoint: https://feedback.example.com/vote
```

| Option | What it changes |
| --- | --- |
| `announcement.id`, `announcement.text`, `announcement.href` | A dismissible bar above the header. `text` is required; the bar renders nothing without it. `href` links the text; `http`, `https`, `mailto`, and root-relative paths are shown. Dismissal is remembered per `id`. |
| `editPage.headingLinks` | `true` adds a per-heading "suggest an edit" issue link under the "Edit this page" link; absent or any other value leaves it out. |
| `logo.light`, `logo.dark` | The header mark. A root-relative path gets the site's `base`; an absolute URL is used as written. With both, the header swaps them with the theme; with one, it shows that one in both modes. |
| `footer.copyright`, `footer.license` | The two lines of the site footer. |
| `footer.links[]` | Footer links with `title` and `url`; only `http`, `https`, `mailto`, and root-relative paths are shown. |
| `pageAgent.providers[]` | The "Use with an agent" menu. Each provider has a `title` and a `url`; `{markdown}`, `{url}`, and `{title}` are filled per page. Without the block the menu offers Claude, ChatGPT, and Cursor. |
| `feedback.endpoint` | The address the "Was this page helpful?" buttons POST `{url, helpful}` to. Without the block the feedback widget renders nothing. |

## Add a component

A site cannot add a component without changing the theme or its fork: components are theme units, not content files. Adding one never edits a shared index file, because the registry discovers `components/<name>/` by listing the folder.

1. Make `components/<name>/`, using lowercase kebab-case. The folder name is the component's name and the directive an author writes.
2. Add `index.ts` with the Preact component written with `h()`, never JSX, and a default export typed by the engine's component contract. The props arrive as strings from the directive's attributes, and the directive's body arrives as rendered HTML.
3. Add `style.css` only when the component has styles. Read tokens with `var(--…)`, use logical properties, and name classes after the component: the root is `<name>`, its parts add a suffix such as `<name>-title`.
4. Add `client.ts` only when the component needs the browser. It is an island: it ships only on pages that use the component, and every control it enhances starts `hidden` so the page still reads without JavaScript.
5. Add `test/component-<name>.test.ts` beside the other component tests. Test the rendered element, each variant, escaping, and the source position.
6. Run `npm run typecheck` and `npm test`. The registry finds the new folder, and an unknown directive or a missing default export becomes a diagnostic naming the file.

The full rules for a unit are in [components/README.md](components/README.md).

## Layout

- `src/index.ts`: exports the theme manifest (`name` and `folders`) and nothing else.
- `test/`: `*.test.ts` files for `node --test`.

## Contributing

Bug reports, fixes, and docs improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE).

---

<p align="center">Lateen is part of <a href="https://velella.sh">Velella</a>. Set the sail. Let the docs carry.</p>
