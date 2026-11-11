import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import sidebar from "../chrome/sidebar/index.ts";

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

function pageAt(url: string): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Page" },
    title: "Page",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(nav: NavTree, url: string): ChromeProps {
  const page = pageAt(url);
  const site: Site = { config, pages: [page], nav, data: {} };
  return { site, page, trail: [], pager: {} };
}

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

function page(n: number): { title: string; url: string } {
  return { title: `Rule ${n}`, url: `/generated/rule-${String(n).padStart(2, "0")}/` };
}

/** The stable group keys, in render order. */
function groupKeys(out: string): string[] {
  return [...out.matchAll(/data-sidebar-group="([^"]+)"/g)].map((match) => match[1]!);
}

const tree: NavTree = {
  main: [
    { title: "Home", url: "/home/" },
    {
      title: "Guide",
      children: [
        { title: "Install", url: "/guide/install/" },
        { title: "Quickstart", url: "/guide/quickstart/" },
        { title: "Setup", children: [{ title: "Config", url: "/guide/setup/config/" }] },
      ],
    },
    { title: "Rules", url: "/rules/", match: "/rules/" },
    { title: "Generated", children: Array.from({ length: 25 }, (_, i) => page(i + 1)) },
  ],
  docs: [{ title: "Docs home", url: "/docs/" }],
};

test("renders nothing when there is no navigation", () => {
  assert.equal(sidebar(props({}, "/home/")), null);
  assert.equal(sidebar(props({ main: [] }, "/home/")), null);
});

test("renders the main list: leading links, groups as headings, nested groups nested", () => {
  const out = html(sidebar(props(tree, "/home/")));

  assert.match(out, /<nav class="sidebar-nav" aria-label="Site navigation">/);
  assert.match(out, /<ul><li><a href="\/home\/" aria-current="page">Home<\/a><\/li><\/ul>/);
  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="[^"]+" data-sidebar-legacy="Guide" data-sidebar-site="\/example"><summary><h2>Guide<\/h2><\/summary><ul>/,
  );
  assert.match(
    out,
    /<li><details class="sidebar-group" data-sidebar-group="[^"]+" data-sidebar-legacy="Guide\/Setup" data-sidebar-site="\/example"><summary><h3>Setup<\/h3><\/summary><ul><li><a href="\/guide\/setup\/config\/">Config<\/a><\/li><\/ul><\/details><\/li>/,
  );
  assert.match(out, /<a href="\/rules\/">Rules<\/a>/);
  assert.doesNotMatch(out, /Docs home/);
});

test("prefers main, then docs, then the first list by code point", () => {
  const both = html(
    sidebar(props({ docs: [{ title: "D", url: "/d/" }], main: [{ title: "M", url: "/m/" }] }, "/m/")),
  );
  assert.match(both, /href="\/m\/"/);
  assert.doesNotMatch(both, /href="\/d\/"/);

  const fallback = html(
    sidebar(props({ zeta: [{ title: "Z", url: "/z/" }], alpha: [{ title: "A", url: "/a/" }] }, "/a/")),
  );
  assert.match(fallback, /href="\/a\/"/);
  assert.doesNotMatch(fallback, /href="\/z\/"/);
});

test("marks the current page with aria-current=page", () => {
  const out = html(sidebar(props(tree, "/guide/install/")));

  assert.match(out, /<a href="\/guide\/install\/" aria-current="page">Install<\/a>/);
  assert.doesNotMatch(out, /href="\/home\/" aria-current/);
  assert.doesNotMatch(out, /href="\/guide\/quickstart\/" aria-current/);
});

test("marks the active section with aria-current=true, with a segment boundary", () => {
  const under = html(sidebar(props(tree, "/rules/artifacts-003/")));
  assert.match(under, /<a href="\/rules\/" aria-current="true">Rules<\/a>/);

  const at = html(sidebar(props(tree, "/rules/")));
  assert.match(at, /<a href="\/rules\/" aria-current="page">Rules<\/a>/);

  const outside = html(sidebar(props(tree, "/rulesx/")));
  assert.match(outside, /<a href="\/rules\/">Rules<\/a>/);
});

test("marks the ancestor groups of the current page", () => {
  const out = html(sidebar(props(tree, "/guide/setup/config/")));

  assert.match(out, /<h2 aria-current="true">Guide<\/h2>/);
  assert.match(out, /<h3 aria-current="true">Setup<\/h3>/);
  assert.doesNotMatch(out, /href="\/guide\/install\/" aria-current/);
});

test("a large section renders as one link, active on any of its pages", () => {
  const out = html(sidebar(props(tree, "/generated/rule-07/")));

  const generated = out.match(/href="\/generated\//g) ?? [];
  assert.equal(generated.length, 1);
  assert.match(out, /<a href="\/generated\/rule-01\/" aria-current="true">Generated<\/a>/);

  // Small groups still list every child.
  assert.match(out, /href="\/guide\/install\/"/);
  assert.match(out, /href="\/guide\/quickstart\/"/);

  const first = html(sidebar(props(tree, "/generated/rule-01/")));
  assert.match(first, /<a href="\/generated\/rule-01\/" aria-current="page">Generated<\/a>/);
});

test("groups are native disclosures: no control opts out of the tab order, and a closed group's links leave it", () => {
  type Element = {
    tagName: string;
    open?: boolean;
    firstElementChild: Element | null;
    querySelector(selector: string): Element | null;
    querySelectorAll(selector: string): ArrayLike<Element>;
  };
  const dom = new JSDOM(html(sidebar(props(tree, "/guide/install/"))));
  const nav = dom.window.document.querySelector("nav.sidebar-nav") as unknown as Element;

  // The summary is the browser's own disclosure button: Enter and Space toggle it, and it takes focus.
  const groups = Array.from(nav.querySelectorAll("details.sidebar-group"));
  assert.ok(groups.length > 0);
  for (const group of groups) assert.equal(group.firstElementChild?.tagName, "SUMMARY");

  // Everything interactive is a link or a summary, both focusable by default.
  const controls = Array.from(nav.querySelectorAll("a, summary, button, input, select, textarea"));
  assert.equal(controls.length, Array.from(nav.querySelectorAll("a, summary")).length);
  assert.equal(Array.from(nav.querySelectorAll("[tabindex]")).length, 0, "no control is taken out of the tab order");

  // The page's own group is open so its links are reachable; the reader's others stay closed, which
  // is what keeps their links out of the tab order until the disclosure opens.
  const current = nav.querySelector("details[data-current]");
  assert.equal(current?.open, true);
  const closed = groups.find((group) => group.open !== true);
  assert.ok(closed, "a group the reader is not in starts closed");
  assert.ok(closed.querySelector("a[href]"), "its links are still inside, hidden by the closed disclosure");
});

test("identical group titles at one level get distinct stable keys", () => {
  const duplicated: NavTree = {
    main: [
      { title: "Notes", children: [{ title: "A", url: "/a/" }] },
      { title: "Notes", children: [{ title: "B", url: "/b/" }] },
    ],
  };
  const keys = groupKeys(html(sidebar(props(duplicated, "/a/"))));
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);

  // The same title nested under different parents stays apart too.
  const nested: NavTree = {
    main: [
      { title: "One", children: [{ title: "Notes", children: [{ title: "X", url: "/one/x/" }] }] },
      { title: "Two", children: [{ title: "Notes", children: [{ title: "Y", url: "/two/y/" }] }] },
    ],
  };
  const nestedKeys = groupKeys(html(sidebar(props(nested, "/one/x/"))));
  assert.equal(new Set(nestedKeys).size, nestedKeys.length);
});

test("the same navigation structure keeps its keys when titles are translated", () => {
  const english: NavTree = {
    main: [{ title: "Guide", children: [{ title: "Install", url: "/guide/install/" }] }],
  };
  const translated: NavTree = {
    main: [{ title: "Anleitung", children: [{ title: "Installation", url: "/guide/install/" }] }],
  };
  assert.deepEqual(
    groupKeys(html(sidebar(props(translated, "/guide/install/")))),
    groupKeys(html(sidebar(props(english, "/guide/install/")))),
  );
});

test("groups without pages are left out", () => {
  const out = html(sidebar(props({ main: [{ title: "Empty", children: [] }] }, "/home/")));
  assert.doesNotMatch(out, /data-sidebar-legacy="Empty"/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/sidebar/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
