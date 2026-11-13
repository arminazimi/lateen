---
name: lateen
description: Develop, debug, test, and review the Lateen repository (@velella/lateen), including documentation layouts, chrome, Preact components, browser islands, design tokens, CSS, RTL support, and accessibility. Use whenever a task touches the lateen checkout or changes the Mizzen theme's appearance or interaction, even if the user only mentions a docs page, component, responsive layout, Persian or Arabic UI, dark mode, or WCAG. Do not use for engine-only pipeline, CLI, parsing, or output behavior, or for dependency lifecycle checks.
license: MIT
metadata:
  author: Velella
  version: "1"
---

# Lateen theme workflows

Work from the repository root. Read `README.md`, `CONTRIBUTING.md`, and the guide nearest the unit: `layouts/README.md`, `chrome/README.md`, `components/README.md`, `tokens/README.md`, or `styles/README.md`. Keep sibling `../mizzen` available for integration tests and docs builds. Inspect the owning unit, callers, and nearby tests before editing; keep visual changes in that unit rather than adding global overrides.

Preserve the theme boundary. Lateen owns layouts, chrome, components, tokens, and styles; Mizzen owns the engine and content pipeline. Import only types from `@velella/mizzen/contracts`, by package name and with `import type`. Never import engine runtime code or use relative paths into the sibling checkout. `src/index.ts` exports only the theme manifest, and the engine discovers units without shared-index edits.

Use Node 24's erasable TypeScript, `.ts` extensions in relative imports, and no compiled output in commits.

## Route the task

| Task | Workflow |
| --- | --- |
| Whole-page layout | Add or change `layouts/<name>.ts`; reuse the base layout and existing chrome |
| Page content unit | Add or change `components/<name>/` |
| Interface around content | Add or change `chrome/<name>/` |
| Design value | Change the token source, then regenerate `styles/tokens.css` |
| Global style | Use `styles/` only when no single unit owns it |
| Browser interaction | Enhance the unit through its optional `client.ts` island |
| RTL or accessibility issue | Fix the owning unit and test every affected state below |

Write layouts and components as Preact elements with `h()`, not JSX or `.tsx`; Node's type stripping does not transform JSX. Layouts are one `layouts/<name>.ts` file with a default export typed by Mizzen's layout contract. Components and chrome use lowercase kebab-case folders with default-exported `index.ts`, optional `style.css`, and optional `client.ts`. Follow Mizzen's render contract for props; component bodies arrive as rendered HTML.

Keep content readable and controls usable without JavaScript. Preserve semantic HTML, escaping, keyboard behavior, and source positions. Test rendered output, variants, escaping, and relevant interaction states in the nearest `test/component-*.test.ts`, `test/chrome-*.test.ts`, or layout test.

## Change tokens and CSS safely

1. Treat `tokens/names.json` as the frozen registry and edit values in `tokens/<group>.json`.
2. Run `npm run tokens` after token changes. Never hand-edit generated `styles/tokens.css`; `npm test` checks freshness.
3. Use existing CSS token variables instead of raw colors, lengths, or durations in unit stylesheets.
4. Use logical properties such as `margin-inline-start` and `text-align: start`. Mirror only directional navigation affordances, never media or technical symbols.

## Check every affected experience

Exercise the applicable states for visual or interactive changes:

- Light and dark themes.
- LTR and RTL, including Persian and Arabic typography and mixed-direction code.
- Keyboard navigation, visible focus, screen-reader semantics, and reduced motion.
- Desktop and mobile layouts, including open drawer and search overlays when relevant.
- No-JavaScript behavior and forced-colors mode for affected controls.

Do not add a new violation to `test/accessibility/baseline.json` to make the gate pass. Fix it; remove only entries that have genuinely become stale.

## Verify

Add or update `test/*.test.ts` for behavior changes. Run a focused test during development, then:

```bash
npm run typecheck
npm test
```

For docs-site changes, run `node ../mizzen/bin/mizzen.ts check site` and require zero errors. For layout, color, interaction, responsive, RTL, or accessibility changes, run the full `npm run test:a11y` gate. If Chromium is missing, install it with `npx playwright install chromium`. A filtered run such as `node scripts/test-a11y.ts --only "fixture persian"` helps debugging but does not replace the full gate. For packed-file changes, also run `scripts/smoke-package.sh`. Report exactly which checks and states were verified and any environmental limitation.
