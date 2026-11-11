import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import fileTree, { directive, entryPath, idBase, nodeId, parseEntries, plainText } from "../components/file-tree/index.ts";
import {
  activate,
  ENHANCED_ATTR,
  GROUP_SELECTOR,
  ITEM_SELECTOR,
  TREE_SELECTOR,
  type TreeElement,
  type TreeEvent,
} from "../components/file-tree/client.ts";
import type { ComponentProps, Page, Site, SourcePos, SiteConfig } from "@velella/mizzen/contracts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const config: SiteConfig = {
  title: "Example",
  base: "/example",
  lang: "en",
  dir: "ltr",
  languages: [],
  source: ".",
  include: [],
  exclude: [],
  navigation: "_data/navigation.yml",
  defaults: [],
  theme: { options: {} },
  search: { text: 300 },
  redirects: {},
  outputs: {},
};

const page: Page = {
  url: "/example/guide/install/",
  source: pos,
  frontMatter: { title: "Install" },
  title: "Install",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const site: Site = { config, pages: [page], nav: {}, data: {} };

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions; `dangerouslySetInnerHTML` is written raw. */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props as {
    children?: unknown;
    dangerouslySetInnerHTML?: { __html: string };
    [key: string]: unknown;
  };
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  const inner = dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : html(children);
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function render(body: string, props: Record<string, string> = {}, on: Page = { ...page }): string {
  const componentProps: ComponentProps<Record<string, string>> = { props, page: on, site, html: body };
  return html(fileTree(componentProps as ComponentProps<{ label?: string }>));
}

function idsOf(out: string): string[] {
  return [...out.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const stylePath = new URL("../components/file-tree/style.css", import.meta.url);

/** The HTML `remark-rehype` gives a nested Markdown list, with `data-src` on each list. */
const NESTED = [
  '<ul data-src="a.md:1">',
  "<li>beacon.yml # the only file Beacon reads</li>",
  "<li>dist/",
  '<ul data-src="a.md:3">',
  "<li>index.html</li>",
  "<li>assets/",
  "<ul>",
  "<li>app.js</li>",
  "</ul>",
  "</li>",
  "</ul>",
  "</li>",
  "<li>.beacon/",
  "<ul>",
  "<li>cache/</li>",
  "</ul>",
  "</li>",
  "</ul>",
].join("\n");

test("default export is a component bound to the file-tree directive", () => {
  assert.equal(typeof fileTree, "function");
  assert.equal(directive, "file-tree");
});

test("parseEntries builds the nested rows, splitting names from # comments", () => {
  const entries = parseEntries(NESTED);
  assert.deepEqual(
    entries.map((e) => [e.name, e.note]),
    [
      ["beacon.yml", "the only file Beacon reads"],
      ["dist/", ""],
      [".beacon/", ""],
    ],
  );
  assert.deepEqual(
    entries[1]?.children.map((e) => e.name),
    ["index.html", "assets/"],
  );
  assert.deepEqual(entries[1]?.children[1]?.children.map((e) => e.name), ["app.js"]);
});

test("parseEntries drops the paragraphs of a loose list and keeps inline markup", () => {
  const loose = [
    "<ul>",
    "<li>",
    "<p><code>src/</code> <em>sources</em></p>",
    "<ul>",
    "<li><code>index.ts</code> # entry</li>",
    "</ul>",
    "</li>",
    "</ul>",
  ].join("\n");
  const [folder] = parseEntries(loose);
  assert.equal(folder?.name, "<code>src/</code> <em>sources</em>");
  assert.equal(folder?.children[0]?.name, "<code>index.ts</code>");
  assert.equal(folder?.children[0]?.note, "entry");
});

test("renders a tree role with a label and a treeitem level for every row", () => {
  const out = render(NESTED);
  assert.match(out, /<ul class="file-tree" role="tree" id="file-tree" aria-label="File tree" data-file-tree="">/);
  assert.match(out, /role="treeitem"[^>]*aria-level="1"[^>]*aria-setsize="3"[^>]*aria-posinset="1"/);
  assert.match(out, /role="treeitem"[^>]*aria-level="2"[^>]*aria-setsize="2"[^>]*aria-posinset="1"/);
  assert.match(out, /role="treeitem"[^>]*aria-level="3"[^>]*aria-setsize="1"[^>]*aria-posinset="1"/);
  assert.match(out, /<ul class="file-tree-group" role="group">/);
  assert.equal(out.match(/role="group"/g)?.length, 3);
});

test("a folder row is marked expanded; a file row is not", () => {
  const out = render(NESTED);
  assert.match(out, /class="file-tree-item is-folder"[^>]*role="treeitem"[^>]*aria-level="1"[^>]*aria-expanded="true"/);
  assert.match(out, /class="file-tree-item is-file"[^>]*role="treeitem"[^>]*aria-level="2"/);
  assert.doesNotMatch(out, /is-file"[^>]*aria-expanded/);
});

test("folders get the folder icon and files the file icon", () => {
  const out = render(NESTED);
  assert.equal(out.match(/file-tree-icon is-folder-icon/g)?.length, 4);
  assert.equal(out.match(/file-tree-icon is-file-icon/g)?.length, 3);
  assert.match(out, /<svg class="file-tree-icon is-file-icon" viewBox="0 0 16 16" aria-hidden="true"/);
});

test("the comment after # renders in a muted note, not in the name", () => {
  const out = render("<ul><li>config.md # <em>important</em> step</li></ul>");
  assert.match(out, /<span class="file-tree-name"[^>]*>config\.md<\/span>/);
  assert.match(out, /<span class="file-tree-note"[^>]*><em>important<\/em> step<\/span>/);
});

test("a hash inside a name is not a comment", () => {
  const out = render("<ul><li>notes#2.md</li></ul>");
  assert.match(out, /<span class="file-tree-name"[^>]*>notes#2\.md<\/span>/);
  assert.doesNotMatch(out, /class="file-tree-note"/);
});

test("a bold entry is highlighted", () => {
  const out = render("<ul><li><strong>beacon.yml</strong> # the only file</li><li>cache/</li></ul>");
  assert.equal(out.match(/is-highlighted/g)?.length, 1);
  assert.match(out, /class="file-tree-item is-file is-highlighted"/);
  assert.match(out, /class="file-tree-item is-folder"[^>]*role="treeitem"/);
});

test("the label prop replaces the default accessible name", () => {
  const out = render(NESTED, { label: "Project layout" });
  assert.match(out, /aria-label="Project layout"/);
});

test("the tree and every node get deterministic ids from their paths", () => {
  assert.equal(idBase(undefined), "file-tree");
  assert.equal(idBase("Project layout"), "project-layout");
  assert.equal(nodeId("file-tree", "dist/assets/app.js"), "file-tree-dist-assets-app-js");

  const out = render(NESTED, { id: "layout" });
  assert.match(out, /<ul class="file-tree" role="tree" id="layout"/);
  assert.match(out, /id="layout-beacon-yml"[^>]*data-path="beacon\.yml" data-copy-value="beacon\.yml"/);
  assert.match(out, /id="layout-dist"[^>]*data-path="dist" data-copy-value="dist"/);
  assert.match(out, /id="layout-dist-index-html"[^>]*data-path="dist\/index\.html" data-copy-value="dist\/index\.html"/);
});

test("a treeitem is named by its visible name and described by its note", () => {
  const out = render("<ul><li>config.md # the main file</li><li>cache/</li></ul>");
  assert.match(
    out,
    /id="file-tree-config-md" role="treeitem" tabindex="0"[^>]*aria-labelledby="file-tree-config-md-name" aria-describedby="file-tree-config-md-note"/,
  );
  assert.match(out, /<span class="file-tree-name" id="file-tree-config-md-name">config\.md<\/span>/);
  assert.match(out, /<span class="file-tree-note" id="file-tree-config-md-note">the main file<\/span>/);
  assert.doesNotMatch(out, /id="file-tree-cache"[^>]*aria-describedby/);
});

test("plainText drops markup and decodes entities so a copied path is technical content", () => {
  assert.equal(plainText("<code>dist/</code>"), "dist/");
  assert.equal(plainText("a &amp; b"), "a & b");
  assert.equal(plainText("<em>src</em> &#47; <strong>app</strong>"), "src / app");
  assert.equal(entryPath("", "dist/"), "dist");
  assert.equal(entryPath("dist", "<code>index.html</code>"), "dist/index.html");
  assert.equal(entryPath("a", ""), "a");

  const out = render("<ul><li><code>src/</code><ul><li><code>index.ts</code> # entry</li></ul></li></ul>");
  assert.match(out, /data-copy-value="src\/index\.ts"/);
  assert.doesNotMatch(out, /data-copy-value="[^"]*&lt;/);
});

test("a body without a list is passed through so the page still reads", () => {
  const out = render("<p>No list here.</p>");
  assert.equal(out, '<div class="file-tree"><p>No list here.</p></div>');
});

test("style.css uses only token custom properties from names.json", () => {
  const css = readFileSync(stylePath, "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});

test("style.css gives a focused treeitem a visible focus ring", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.file-tree-item:focus-visible > \.file-tree-row\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
});

test("a folder whose slash sits inside a closing tag is still a folder", () => {
  const out = render("<ul><li><code>dist/</code></li><li><code>app.js</code></li></ul>");
  assert.equal(out.match(/is-folder-icon/g)?.length, 1);
  assert.equal(out.match(/is-file-icon/g)?.length, 1);
});

test("without JavaScript the complete tree is visible and every row is a tab stop", () => {
  const out = render(NESTED);
  assert.equal(out.match(/tabindex="0"/g)?.length, 7, "every row is reachable without the island");
  assert.doesNotMatch(out, /\shidden[="\s>]/);
  assert.doesNotMatch(out, /aria-expanded="false"/);
  assert.equal(out.match(/aria-expanded="true"/g)?.length, 3, "folders with rows start expanded");
});

test("only a folder with nested rows reports an expanded state", () => {
  const out = render(NESTED);
  assert.match(out, /id="file-tree-dist"[^>]*aria-expanded="true"/);
  assert.match(out, /id="file-tree-beacon"[^>]*aria-expanded="true"/);
  assert.doesNotMatch(out, /id="file-tree-beacon-cache"[^>]*aria-expanded/, "an empty folder cannot open");
});

test("repeated paths in separate trees keep separate ids", () => {
  const body = "<ul><li>src/<ul><li>index.ts</li></ul></li></ul>";
  const one = render(body, { id: "one" });
  const two = render(body, { id: "two" });
  const ids = (out: string): string[] => [...out.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
  const all = [...ids(one), ...ids(two)];
  assert.equal(new Set(all).size, all.length);
  assert.match(one, /id="one-src-index-ts" role="treeitem"/);
  assert.match(two, /id="two-src-index-ts" role="treeitem"/);
  assert.match(one, /aria-labelledby="one-src-index-ts-name"/);
  assert.match(two, /aria-labelledby="two-src-index-ts-name"/);
});

test("a path that appears twice in one tree still gets unique ids, and its copy value stays the path", () => {
  const body = "<ul><li>a/<ul><li>x.md</li></ul></li><li>a/<ul><li>x.md</li></ul></li></ul>";
  const out = render(body);
  assert.match(out, /id="file-tree-a-x-md"/);
  assert.match(out, /id="file-tree-a-x-md-2"/);
  assert.match(out, /id="file-tree-a-x-md-2" role="treeitem"[^>]*aria-labelledby="file-tree-a-x-md-2-name"/);
  assert.equal(out.match(/data-copy-value="a\/x\.md"/g)?.length, 2, "source paths are unchanged");
});

test("two default trees with identical content on one page get unique ids", () => {
  const body = "<ul><li>src/<ul><li>index.ts</li></ul></li><li>src/<ul><li>index.ts</li></ul></li></ul>";
  const shared: Page = { ...page };
  const one = render(body, {}, shared);
  const two = render(body, {}, shared);

  const all = [...idsOf(one), ...idsOf(two)];
  assert.equal(new Set(all).size, all.length);
  assert.match(one, /<ul class="file-tree" role="tree" id="file-tree"/);
  assert.match(two, /<ul class="file-tree" role="tree" id="file-tree-2"/);
  assert.match(one, /id="file-tree-src-index-ts"/);
  assert.match(one, /id="file-tree-src-index-ts-2"/);
  assert.match(two, /id="file-tree-2-src-index-ts"/);
  assert.match(two, /id="file-tree-2-src-index-ts-2"/);
  assert.equal(one.match(/data-copy-value="src\/index\.ts"/g)?.length, 2);
  assert.equal(two.match(/data-copy-value="src\/index\.ts"/g)?.length, 2);
});

test("a default tree beside a tree with an explicit id keeps every id unique", () => {
  const body = "<ul><li>src/<ul><li>index.ts</li></ul></li></ul>";
  const shared: Page = { ...page };
  const manual = render(body, { id: "layout" }, shared);
  const automatic = render(body, {}, shared);

  const all = [...idsOf(manual), ...idsOf(automatic)];
  assert.equal(new Set(all).size, all.length);
  assert.match(manual, /<ul class="file-tree" role="tree" id="layout"/);
  assert.match(manual, /id="layout-src-index-ts" role="treeitem"/);
  assert.match(automatic, /<ul class="file-tree" role="tree" id="file-tree"/);
  assert.match(automatic, /id="file-tree-src-index-ts" role="treeitem"/);
});

test("default-tree ids are deterministic on a fresh page", () => {
  const body = "<ul><li>src/<ul><li>index.ts</li></ul></li></ul>";
  const pair = (): string[] => {
    const fresh: Page = { ...page };
    return [render(body, {}, fresh), render(body, {}, fresh)];
  };
  assert.deepEqual(pair(), pair());
});

/* The island, with fakes standing in for the browser's elements. */

type Branch = { name: string; children?: Branch[] };

class FakeElement implements TreeElement {
  hidden = false;
  focused = false;
  readonly attrs = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Array<(event: TreeEvent) => void>>();

  constructor(attrs: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attrs)) this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }

  contains(node: unknown): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  querySelector(selector: string): TreeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((element) => matches(element, selector));
  }

  addEventListener(type: string, listener: (event: TreeEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  fire(type: string, event: Partial<TreeEvent> = {}): void {
    const full: TreeEvent = { target: this, preventDefault: () => {}, ...event };
    for (const listener of this.listeners.get(type) ?? []) listener(full);
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

function matches(element: FakeElement, selector: string): boolean {
  if (selector === ITEM_SELECTOR) return element.getAttribute("role") === "treeitem";
  if (selector === GROUP_SELECTOR) return element.getAttribute("role") === "group";
  throw new Error(`unexpected selector ${selector}`);
}

/** A tree of fake rows, in document order, mirroring `li > ul[role=group] > li`. */
function fakeTree(branches: Branch[]): { root: FakeElement; items: FakeElement[] } {
  const root = new FakeElement({ role: "tree", "data-file-tree": "" });
  const items: FakeElement[] = [];

  const add = (branch: Branch, level: number, list: FakeElement): void => {
    const item = new FakeElement({
      role: "treeitem",
      tabindex: "0",
      "aria-level": String(level),
      ...(branch.children === undefined ? {} : { "aria-expanded": "true" }),
    });
    item.attrs.set("data-name", branch.name);
    list.children.push(item);
    items.push(item);
    if (branch.children !== undefined) {
      const group = new FakeElement({ role: "group" });
      item.children.push(group);
      for (const child of branch.children) add(child, level + 1, group);
    }
  };

  for (const branch of branches) add(branch, 1, root);
  return { root, items };
}

const SPEC: Branch[] = [
  { name: "a", children: [{ name: "a1" }, { name: "a2", children: [{ name: "a2x" }] }] },
  { name: "b" },
  { name: "c" },
];

/** Fires a key on the root as if `item` had focus; returns how often the default was stopped. */
function press(root: FakeElement, item: FakeElement, key: string): number {
  let prevented = 0;
  root.fire("keydown", { key, target: item, preventDefault: () => (prevented += 1) });
  return prevented;
}

/** The row that is currently the tree's tab stop. */
function current(items: FakeElement[]): number {
  return items.findIndex((item) => item.getAttribute("tabindex") === "0");
}

test("the island finds trees by their data attribute", () => {
  assert.equal(TREE_SELECTOR, "[data-file-tree]");
  assert.match(render(NESTED), /<ul class="file-tree" role="tree"[^>]*data-file-tree=""/);
});

test("activate() leaves one row as the tab stop and does not take focus", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);
  assert.equal(root.getAttribute(ENHANCED_ATTR), "");
  assert.deepEqual(
    items.map((item) => item.getAttribute("tabindex")),
    ["0", "-1", "-1", "-1", "-1", "-1"],
  );
  assert.equal(items.some((item) => item.focused), false);
});

test("arrows, Home, and End move through the visible rows and stop at the ends", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);

  assert.equal(press(root, items[0]!, "ArrowDown"), 1);
  assert.equal(current(items), 1);
  assert.equal(items[1]!.focused, true);

  assert.equal(press(root, items[5]!, "ArrowUp"), 1);
  assert.equal(current(items), 4);

  assert.equal(press(root, items[4]!, "End"), 1);
  assert.equal(current(items), 5);
  assert.equal(press(root, items[5]!, "ArrowDown"), 1, "the end is still a handled key");
  assert.equal(current(items), 5, "the tree does not wrap");

  assert.equal(press(root, items[5]!, "Home"), 1);
  assert.equal(current(items), 0);
  assert.equal(press(root, items[0]!, "ArrowUp"), 1);
  assert.equal(current(items), 0, "the start does not wrap");
});

test("ArrowRight moves into a folder, ArrowLeft collapses it and then moves to the parent", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);
  const group = items[0]!.querySelector(GROUP_SELECTOR);
  assert.ok(group);

  press(root, items[0]!, "ArrowRight");
  assert.equal(current(items), 1, "an open folder moves to its first row");
  press(root, items[1]!, "ArrowLeft");
  assert.equal(current(items), 0, "a file moves to its parent");

  press(root, items[0]!, "ArrowLeft");
  assert.equal(items[0]!.getAttribute("aria-expanded"), "false");
  assert.equal(group.hidden, true);

  press(root, items[0]!, "ArrowRight");
  assert.equal(items[0]!.getAttribute("aria-expanded"), "true");
  assert.equal(group.hidden, false);

  press(root, items[0]!, "ArrowLeft");
  press(root, items[0]!, "ArrowLeft");
  assert.equal(current(items), 0, "a root folder has no parent to move to");
});

test("a collapsed subtree is skipped by ArrowDown and comes back when expanded", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);

  press(root, items[0]!, "ArrowLeft");
  press(root, items[0]!, "ArrowDown");
  assert.equal(current(items), 4, "the next visible row is the sibling, not the hidden child");

  press(root, items[0]!, "ArrowRight");
  press(root, items[0]!, "ArrowDown");
  assert.equal(current(items), 1, "the child is reachable again once the folder opens");
});

test("Enter and Space toggle a folder; a file has no action", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);

  assert.equal(press(root, items[0]!, "Enter"), 1);
  assert.equal(items[0]!.getAttribute("aria-expanded"), "false");
  assert.equal(press(root, items[0]!, "Enter"), 1);
  assert.equal(items[0]!.getAttribute("aria-expanded"), "true");
  assert.equal(press(root, items[0]!, " "), 1);
  assert.equal(items[0]!.getAttribute("aria-expanded"), "false");
  assert.equal(press(root, items[4]!, " "), 1, "Space does not scroll the page on a file");
  assert.equal(press(root, items[4]!, "Enter"), 0, "Enter has nothing to follow on a file");
});

test("collapsing a folder returns focus to it, never into hidden rows", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, false);

  press(root, items[0]!, "ArrowRight");
  assert.equal(current(items), 1, "focus sits on the folder's first row");
  press(root, items[0]!, " ");

  assert.equal(items[1]!.getAttribute("tabindex"), "-1");
  assert.equal(items[0]!.getAttribute("tabindex"), "0");
  assert.equal(current(items), 0);
});

test("right-to-left trees reverse ArrowRight and ArrowLeft", () => {
  const { root, items } = fakeTree(SPEC);
  activate(root, true);

  press(root, items[0]!, "ArrowLeft");
  assert.equal(current(items), 1, "left opens the folder and moves into it");
  press(root, items[0]!, "ArrowRight");
  assert.equal(items[0]!.getAttribute("aria-expanded"), "false", "right collapses it");
});

test("two trees on a page keep their own tab stop and do not cross-control", () => {
  const first = fakeTree(SPEC);
  const second = fakeTree(SPEC);
  activate(first.root, false);
  activate(second.root, false);

  press(first.root, first.items[0]!, "ArrowDown");

  assert.equal(current(first.items), 1);
  assert.deepEqual(
    second.items.map((item) => item.getAttribute("tabindex")),
    ["0", "-1", "-1", "-1", "-1", "-1"],
  );
  assert.equal(second.items.some((item) => item.focused), false);
});

test("activate() leaves an empty tree alone", () => {
  const root = new FakeElement({ role: "tree" });
  activate(root, false);
  assert.equal(root.getAttribute(ENHANCED_ATTR), null);
});
