import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import headingAnchor, {
  ANCHOR_CLASS,
  TEXT_CLASS,
  rehype,
  textIdFor,
  type HastNode,
} from "../components/heading-anchor/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/heading-anchor/style.css");
const namesPath = join(root, "tokens/names.json");

type Vnode = { type: unknown; props: Record<string, unknown> };

function childrenOf(vnode: Vnode): Vnode[] {
  const kids = vnode.props.children;
  return (Array.isArray(kids) ? kids : [kids]) as Vnode[];
}

function text(node: HastNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(text).join("");
}

function heading(tagName: string, id: string | undefined, label: string): HastNode {
  return {
    type: "element",
    tagName,
    properties: id === undefined ? {} : { id },
    children: [{ type: "text", value: label }],
  };
}

test("default export is the heading anchor component", () => {
  assert.equal(typeof headingAnchor, "function");
});

test("component renders the level it is given with the id and a labelled text span", () => {
  for (const level of [2, 3, 4] as const) {
    const vnode = headingAnchor({ id: "install", level, children: "Install" }) as unknown as Vnode;
    assert.equal(vnode.type, `h${level}`);
    assert.equal(vnode.props.id, "install");
    assert.equal(vnode.props["aria-labelledby"], textIdFor("install"));
  }
  const vnode = headingAnchor({ id: "install", level: 2, children: "Install" }) as unknown as Vnode;
  const [span] = childrenOf(vnode);
  assert.ok(span);
  assert.equal(span.type, "span");
  assert.equal(span.props.id, textIdFor("install"));
  assert.equal(span.props.class, TEXT_CLASS);
  assert.equal(span.props.children, "Install");
});

test("the link icon sits outside the labelled text, so it is not in the heading name", () => {
  const vnode = headingAnchor({ id: "install", level: 3, children: "Install" }) as unknown as Vnode;
  const [span, anchor] = childrenOf(vnode);
  assert.ok(span && anchor);
  assert.equal(anchor.type, "a");
  assert.equal(anchor.props.class, ANCHOR_CLASS);
  assert.equal(anchor.props.href, "#install");
  assert.equal(anchor.props["aria-label"], "Link to this heading");
  const icon = childrenOf(anchor)[0];
  assert.ok(icon);
  assert.equal(icon.type, "svg");
  assert.equal(icon.props["aria-hidden"], "true");
  assert.equal(icon.props.focusable, "false");
  // The labelled span holds the text only, never the link.
  assert.equal(span?.props.children, "Install");
});

test("the link label can be passed in", () => {
  const vnode = headingAnchor({ id: "x", level: 2, children: "X", label: "Lien vers ce titre" }) as unknown as Vnode;
  const anchor = childrenOf(vnode)[1];
  assert.equal(anchor?.props["aria-label"], "Lien vers ce titre");
});

test("rehype adds the anchor to every h2 to h4 with an id", () => {
  for (const tagName of ["h2", "h3", "h4"]) {
    const tree: HastNode = { type: "root", children: [heading(tagName, "install", "Install")] };
    rehype()(tree);
    const node = tree.children?.[0];
    assert.ok(node);
    assert.equal(node.tagName, tagName);
    assert.equal(node.properties?.id, "install");
    assert.equal(node.properties?.ariaLabelledBy, textIdFor("install"));
    assert.equal(node.children?.length, 2);
    const [span, anchor] = node.children ?? [];
    assert.equal(span?.tagName, "span");
    assert.deepEqual(span?.properties?.className, [TEXT_CLASS]);
    assert.equal(text(span!), "Install");
    assert.equal(anchor?.tagName, "a");
    assert.deepEqual(anchor?.properties?.className, [ANCHOR_CLASS]);
    assert.equal(anchor?.properties?.href, "#install");
    assert.equal(anchor?.properties?.ariaLabel, "Link to this heading");
    assert.equal(anchor?.children?.[0]?.properties?.ariaHidden, "true");
  }
});

test("rehype leaves h1, h5, and headings without an id alone", () => {
  for (const [tagName, id] of [
    ["h1", "top"],
    ["h5", "deep"],
    ["h2", undefined],
  ] as const) {
    const tree: HastNode = { type: "root", children: [heading(tagName, id, "Title")] };
    rehype()(tree);
    const node = tree.children?.[0];
    assert.equal(node?.children?.length, 1, `${tagName} should not be changed`);
    assert.equal(node?.properties?.ariaLabelledBy, undefined);
  }
});

test("rehype finds headings nested inside other elements and is idempotent", () => {
  const tree: HastNode = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "section",
        properties: {},
        children: [heading("h3", "nested", "Nested")],
      },
    ],
  };
  rehype()(tree);
  rehype()(tree);
  const nested = tree.children?.[0]?.children?.[0];
  assert.equal(nested?.tagName, "h3");
  assert.equal(nested?.children?.length, 2);
  assert.equal(nested?.children?.filter((child) => child.tagName === "a").length, 1);
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

test("style.css hides the icon until hover or focus, and shows it on touch", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.heading-anchor\s*\{[^}]*opacity:\s*0/s);
  assert.match(css, /:is\(h2,\s*h3,\s*h4\):hover\s*>\s*\.heading-anchor/);
  assert.match(css, /:is\(h2,\s*h3,\s*h4\):focus-within\s*>\s*\.heading-anchor/);
  assert.match(css, /\.heading-anchor:focus-visible\s*\{[^}]*opacity:\s*1/s);
  assert.match(css, /@media \(hover: none\)\s*\{\s*\.heading-anchor\s*\{[^}]*opacity:\s*1/s);
});

test("style.css uses logical properties so the icon sits correctly in right-to-left text", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.doesNotMatch(css, /\b(margin|padding)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
  assert.match(css, /margin-inline-start:\s*var\(--space-2\)/);
});
