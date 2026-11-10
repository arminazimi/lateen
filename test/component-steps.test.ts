import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import steps, { directive } from "../components/steps/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/steps/style.css");
const namesPath = join(root, "tokens/names.json");

type RenderedNode = {
  props: { class: string; dangerouslySetInnerHTML: { __html: string } };
};

const ORDERED_LIST = "<ol><li><p>Install.</p></li><li><p>Configure.</p></li></ol>";

function render(html: string): RenderedNode {
  // The component reads only `html`; the rest of the props are not needed for this test.
  return steps({ html } as unknown as Parameters<typeof steps>[0]) as RenderedNode;
}

test("the directive is named steps", () => {
  assert.equal(directive, "steps");
});

test("default export is the steps component", () => {
  assert.equal(typeof steps, "function");
});

test("wraps the ordered list in a .steps element without changing its HTML", () => {
  const node = render(ORDERED_LIST);
  assert.equal(node.props.class, "steps");
  assert.equal(node.props.dangerouslySetInnerHTML.__html, ORDERED_LIST);
});

test("style.css uses only token custom properties from names.json", () => {
  const names = JSON.parse(readFileSync(namesPath, "utf8")) as Record<string, Record<string, unknown>>;
  const allowed = new Set<string>();
  for (const [group, entries] of Object.entries(names)) {
    for (const key of Object.keys(entries)) allowed.add(`--${group}-${key}`);
  }

  const css = readFileSync(stylePath, "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !allowed.has(name));
  assert.deepEqual(unknown, []);
});

test("style.css numbers Persian pages with Persian numerals and Arabic pages with Arabic-Indic numerals", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.steps:lang\(fa\)\s*>\s*ol\s*>\s*li::before\s*\{\s*content:\s*counter\(steps,\s*persian\)/);
  assert.match(css, /\.steps:lang\(ar\)\s*>\s*ol\s*>\s*li::before\s*\{\s*content:\s*counter\(steps,\s*arabic-indic\)/);
  assert.match(css, /\.steps\s*>\s*ol\s*>\s*li::before\s*\{[^}]*content:\s*counter\(steps\)/s);
});

test("style.css draws a line between steps and none after the last one", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.steps\s*>\s*ol\s*>\s*li:not\(:last-child\)::after\s*\{[^}]*border-inline-start:/s);
  assert.match(css, /\.steps\s*>\s*ol\s*>\s*li:last-child\s*\{[^}]*padding-block-end:\s*0/s);
});

test("style.css uses logical properties only, so right-to-left pages lay out correctly", () => {
  const css = readFileSync(stylePath, "utf8");
  const physical = /\b(margin|padding|border|inset)-(left|right)\b|\b(left|right):\s/;
  assert.doesNotMatch(css, physical);
});
