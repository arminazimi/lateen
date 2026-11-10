import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import fileTree, { directive, parseEntries } from "../components/file-tree/index.ts";
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

function render(body: string, props: Record<string, string> = {}): string {
  const componentProps: ComponentProps<Record<string, string>> = { props, page, site, html: body };
  return html(fileTree(componentProps as ComponentProps<{ label?: string }>));
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
  assert.match(out, /<ul class="file-tree" role="tree" aria-label="File tree">/);
  assert.match(out, /role="treeitem" aria-level="1" aria-setsize="3" aria-posinset="1"/);
  assert.match(out, /role="treeitem" aria-level="2" aria-setsize="2" aria-posinset="1"/);
  assert.match(out, /role="treeitem" aria-level="3" aria-setsize="1" aria-posinset="1"/);
  assert.match(out, /<ul class="file-tree-group" role="group">/);
  assert.equal(out.match(/role="group"/g)?.length, 3);
});

test("a folder row is marked expanded; a file row is not", () => {
  const out = render(NESTED);
  assert.match(out, /class="file-tree-item is-folder" role="treeitem" aria-level="1"[^>]*aria-expanded="true"/);
  assert.match(out, /class="file-tree-item is-file" role="treeitem" aria-level="2"/);
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
  assert.match(out, /<span class="file-tree-name">config\.md<\/span>/);
  assert.match(out, /<span class="file-tree-note"><em>important<\/em> step<\/span>/);
});

test("a hash inside a name is not a comment", () => {
  const out = render("<ul><li>notes#2.md</li></ul>");
  assert.match(out, /<span class="file-tree-name">notes#2\.md<\/span>/);
  assert.doesNotMatch(out, /file-tree-note/);
});

test("a bold entry is highlighted", () => {
  const out = render("<ul><li><strong>beacon.yml</strong> # the only file</li><li>cache/</li></ul>");
  assert.equal(out.match(/is-highlighted/g)?.length, 1);
  assert.match(out, /class="file-tree-item is-file is-highlighted"/);
  assert.match(out, /class="file-tree-item is-folder" role="treeitem"/);
});

test("the label prop replaces the default accessible name", () => {
  const out = render(NESTED, { label: "Project layout" });
  assert.match(out, /aria-label="Project layout"/);
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

test("a folder whose slash sits inside a closing tag is still a folder", () => {
  const out = render("<ul><li><code>dist/</code></li><li><code>app.js</code></li></ul>");
  assert.equal(out.match(/is-folder-icon/g)?.length, 1);
  assert.equal(out.match(/is-file-icon/g)?.length, 1);
});
