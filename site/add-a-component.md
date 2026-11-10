---
title: "Add a component"
description: "Add a component: Lateen reference."
---

A site cannot add a component without changing the theme or its fork: components are theme units, not content files. Adding one never edits a shared index file, because the registry discovers `components/<name>/` by listing the folder.

1. Make `components/<name>/`, using lowercase kebab-case. The folder name is the component's name and the directive an author writes.
2. Add `index.ts` with the Preact component written with `h()`, never JSX, and a default export typed by the engine's component contract. The props arrive as strings from the directive's attributes, and the directive's body arrives as rendered HTML.
3. Add `style.css` only when the component has styles. Read tokens with `var(--…)`, use logical properties, and name classes after the component: the root is `<name>`, its parts add a suffix such as `<name>-title`.
4. Add `client.ts` only when the component needs the browser. It is an island: it ships only on pages that use the component, and every control it enhances starts `hidden` so the page still reads without JavaScript.
5. Add `test/component-<name>.test.ts` beside the other component tests. Test the rendered element, each variant, escaping, and the source position.
6. Run `npm run check`. The registry finds the new folder, and an unknown directive or a missing default export becomes a diagnostic naming the file.

The full rules for a unit are in [components/README.md](https://github.com/arminazimi/lateen/blob/main/components/README.md) and [`docs/blocks.md`](https://github.com/arminazimi/slipway/blob/main/docs/blocks.md).
