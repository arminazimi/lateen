import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import kbd, { CLASS_NAME, directive } from "../components/kbd/index.ts";

type Rendered = { type: string; props: { class: string; dangerouslySetInnerHTML?: { __html: string } } };

/** Render the key the way the render host calls it: no props, the body HTML. */
function render(html: string): Rendered {
  const input = { props: {}, html, page: {}, site: {} } as unknown as ComponentProps;
  return kbd(input) as unknown as Rendered;
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/kbd/style.css", import.meta.url), "utf8");

test("default export is the kbd component", () => {
  assert.equal(typeof kbd, "function");
});

test("the directive is kbd, so :kbd[Ctrl+K] reaches the component", () => {
  assert.equal(directive, "kbd");
  assert.equal(CLASS_NAME, "kbd");
});

test("renders a kbd element with the body HTML", () => {
  const node = render("Ctrl+K");
  assert.equal(node.type, "kbd");
  assert.equal(node.props.class, "kbd");
  assert.deepEqual(node.props.dangerouslySetInnerHTML, { __html: "Ctrl+K" });
});

test("passes the body HTML through unchanged", () => {
  assert.deepEqual(render("<span>Shift</span>+<span>Enter</span>").props.dangerouslySetInnerHTML, {
    __html: "<span>Shift</span>+<span>Enter</span>",
  });
});

test("an empty body renders an empty key", () => {
  assert.deepEqual(render("").props.dangerouslySetInnerHTML, { __html: "" });
});

test("style.css styles both the kbd element and the kbd class", () => {
  assert.match(css, /(^|[\s,])kbd,\s*\.kbd\s*\{/m);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css keeps the key left-to-right inside right-to-left text", () => {
  assert.match(css, /\bdirection:\s*ltr/);
  assert.match(css, /\bunicode-bidi:\s*isolate/);
});

test("style.css uses logical spacing and borders", () => {
  assert.match(css, /kbd[^{]*\{[^}]*padding-inline:/s);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
});

test("style.css uses the monospace font token for keys", () => {
  assert.match(css, /font-family:\s*var\(--type-font-mono\)/);
});
