import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "@velella/mizzen/contracts";
import callout, { calloutKind, type CalloutProps } from "../components/callout/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/callout/style.css");
const namesPath = join(root, "tokens/names.json");

/** The parts of a preact VNode the assertions read. */
type Tree = { props: { children?: unknown; [key: string]: unknown } };
type Node = Tree | string | number | null | undefined | boolean;

function render(props: Partial<CalloutProps> & { html?: string }) {
  const { html = "<p>Body</p>", ...rest } = props;
  const input = {
    props: rest,
    html,
    page: {} as ComponentProps["page"],
    site: {} as ComponentProps["site"],
  } as ComponentProps<CalloutProps>;
  return callout(input) as unknown as Tree;
}

/** Every element in the tree, depth first, as preact VNodes. */
function elements(node: Node): Tree[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  const out: Tree[] = [node as Tree];
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list as Node[]) out.push(...elements(child));
  return out;
}

function textOf(node: Node): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node !== "object") return "";
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  return (list as Node[]).map(textOf).join("");
}

test("default export is the callout component", () => {
  assert.equal(typeof callout, "function");
});

test("the root has role=note and is not announced as an alert", () => {
  const tree = render({ type: "warning" });
  assert.equal(tree.props.role, "note");
  const all = elements(tree);
  assert.equal(
    all.some((node) => node.props.role === "alert" || node.props["aria-live"] !== undefined),
    false,
  );
});

test("each kind gets its class and default title", () => {
  const expected: Record<string, string> = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
  };
  for (const [kind, title] of Object.entries(expected)) {
    const tree = render({ type: kind });
    assert.equal(tree.props.class, `callout callout-${kind}`);
    const heading = elements(tree).find((node) => node.props.class === "callout-title");
    assert.equal(textOf(heading), title);
  }
});

test("unknown, missing, and non-string types are notes", () => {
  assert.equal(calloutKind("info"), "note");
  assert.equal(calloutKind(undefined), "note");
  assert.equal(calloutKind(42), "note");
  assert.equal(calloutKind("constructor"), "note");
  assert.equal(render({ type: "info" }).props.class, "callout callout-note");
  assert.equal(render({}).props.class, "callout callout-note");
});

test("danger is read as caution, and type is case-insensitive", () => {
  assert.equal(calloutKind("danger"), "caution");
  assert.equal(calloutKind(" TIP "), "tip");
});

test("a custom title replaces the default; a blank one does not", () => {
  const titled = render({ type: "tip", title: "Read first" });
  const titleOf = (tree: Tree) =>
    textOf(elements(tree).find((node) => node.props.class === "callout-title"));
  assert.equal(titleOf(titled), "Read first");
  assert.equal(titleOf(render({ type: "tip", title: "   " })), "Tip");
});

test("the rendered body is passed through as HTML", () => {
  const tree = render({ type: "note", html: "<p>Remember <code>npm ci</code>.</p>" });
  const body = elements(tree).find((node) => node.props.class === "callout-body");
  assert.deepEqual(body?.props.dangerouslySetInnerHTML, {
    __html: "<p>Remember <code>npm ci</code>.</p>",
  });
});

test("the icon is decorative", () => {
  const icon = elements(render({ type: "caution" })).find((node) => node.props.class === "callout-icon");
  assert.equal(icon?.props["aria-hidden"], "true");
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

test("style.css uses logical properties, so it reads correctly under dir=rtl", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.doesNotMatch(css, /\b(?:margin|padding|border)-(?:left|right)\b/);
  assert.doesNotMatch(css, /\b(?:left|right)\s*:/);
  assert.match(css, /border-inline-start-color/);
});
