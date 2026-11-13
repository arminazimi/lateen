import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Components a layout renders directly must keep their CSS in `styles/`. The engine bundles a page's
 * component CSS from the components its Markdown used, so a layout-only component's own `style.css`
 * is never loaded; the page renders it unstyled (a `<svg>` with no size fills the viewport).
 */
const LAYOUT_COMPONENTS: Readonly<Record<string, string>> = {
  "changelog-entry": ".changelog-entry",
  code: ".code",
  "drift-banner": ".drift-banner",
  "page-status": ".page-status",
  "reading-time": ".reading-time",
  "trust-panel": ".trust-panel",
};

for (const [name, root] of Object.entries(LAYOUT_COMPONENTS)) {
  test(`layout component ${name} keeps its CSS in the base bundle`, () => {
    const file = new URL(`../styles/parts-${name}.css`, import.meta.url);
    assert.ok(existsSync(file), `styles/parts-${name}.css is missing`);
    assert.match(readFileSync(file, "utf8"), new RegExp(`\\${root}\\s*\\{`), `styles/parts-${name}.css has no ${root} rule`);
    assert.ok(
      !existsSync(new URL(`../components/${name}/style.css`, import.meta.url)),
      `components/${name}/style.css would never load from a layout`,
    );
  });
}
