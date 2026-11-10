import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import badge, { DEFAULT_VARIANT, VARIANTS, classNameOf, variantOf, type BadgeProps } from "../components/badge/index.ts";

type Rendered = { type: string; props: { class: string; children?: unknown; dangerouslySetInnerHTML?: { __html: string } } };

/** Render the badge the way the render host calls it: props from the directive plus the body HTML. */
function render(props: BadgeProps, html = ""): Rendered {
  return badge({ props, html } as unknown as ComponentProps<BadgeProps>) as unknown as Rendered;
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/badge/style.css", import.meta.url), "utf8");

test("default export is the badge component", () => {
  assert.equal(typeof badge, "function");
});

test("renders a span with the variant class and the body HTML", () => {
  const node = render({ variant: "tip" }, "New");
  assert.equal(node.type, "span");
  assert.equal(node.props.class, "badge badge-tip");
  assert.deepEqual(node.props.dangerouslySetInnerHTML, { __html: "New" });
});

test("uses the label when the directive has no body", () => {
  const node = render({ label: "new" });
  assert.equal(node.props.class, "badge badge-note");
  assert.equal(node.props.children, "new");
  assert.equal(node.props.dangerouslySetInnerHTML, undefined);
});

test("renders empty text when there is neither a body nor a label", () => {
  assert.equal(render({}).props.children, "");
});

test("a missing or unknown variant falls back to the note variant", () => {
  assert.equal(DEFAULT_VARIANT, "note");
  assert.equal(render({}, "x").props.class, "badge badge-note");
  assert.equal(render({ variant: "purple" }, "x").props.class, "badge badge-note");
  assert.equal(variantOf(undefined), "note");
  assert.equal(variantOf(42), "note");
});

test("every callout variant gets its own class", () => {
  assert.deepEqual([...VARIANTS], ["note", "tip", "important", "warning", "caution"]);
  for (const variant of VARIANTS) {
    assert.equal(variantOf(variant), variant);
    assert.equal(classNameOf(variant), `badge badge-${variant}`);
    assert.equal(render({ variant }, "x").props.class, `badge badge-${variant}`);
  }
});

test("each variant reads its color from the callout token it shares", () => {
  const expected: Record<string, string> = {
    note: "--color-info",
    tip: "--color-success",
    important: "--color-accent",
    warning: "--color-warning",
    caution: "--color-danger",
  };
  for (const [variant, token] of Object.entries(expected)) {
    const rule = new RegExp(`\\.badge-${variant}\\s*\\{[^}]*color:\\s*var\\(${token}\\)`);
    assert.match(css, rule, `.badge-${variant} uses var(${token})`);
  }
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css styles the badge as a pill with logical spacing", () => {
  assert.match(css, /\.badge\s*\{[^}]*display:\s*inline-block/s);
  assert.match(css, /\.badge\s*\{[^}]*padding-inline:/s);
  assert.match(css, /\.badge\s*\{[^}]*border-radius:\s*var\(--radius-full\)/s);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
});
