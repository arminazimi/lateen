import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavItem, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import sectionTabs from "../chrome/section-tabs/index.ts";

/** Navigation items as navigation.yml carries them: the contract fields plus authoring marks like `tab`. */
type NavSource = NavItem & { readonly tab?: unknown };

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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
    frontMatter: { title: "Install" },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

/** Navigation data as the engine's tree carries it: `tab` rides along as an extra key from navigation.yml. */
const nav: readonly NavSource[] = [
  { title: "Home", url: "/example/", tab: true },
  {
    title: "Guide",
    children: [
      { title: "Install", url: "/example/install/" },
      { title: "Quickstart", url: "/example/quickstart/" },
    ],
    tab: true,
  },
  { title: "Operations", children: [{ title: "Security", url: "/example/security/" }] },
  { title: "Reference", url: "/example/reference/", match: "/example/reference/", tab: true },
  { title: "Features", url: "/example/features/" },
];

function propsWith(url: string, trail: Trail, items: readonly NavItem[] | undefined): ChromeProps {
  const page = pageAt(url);
  const site: Site = { config, pages: [page], nav: items === undefined ? {} : { main: items }, data: {} };
  return { site, page, trail, pager: {} satisfies Pager };
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
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

const render = (url: string, trail: Trail, items: readonly NavItem[] = nav) => html(sectionTabs(propsWith(url, trail, items)));

test("renders only top-level items marked tab: true, in order, linking groups to their first leaf", () => {
  const out = render("/example/install/", [{ title: "Guide", url: "/example/install/" }]);
  assert.match(out, /<nav class="section-tabs" aria-label="Sections">/);
  assert.match(
    out,
    /<a class="section-tab" href="\/example\/">Home<\/a><a class="section-tab" href="\/example\/install\/" aria-current="page">Guide<\/a><a class="section-tab" href="\/example\/reference\/">Reference<\/a>/,
  );
  assert.doesNotMatch(out, /Operations|Features/);
});

test("the tab whose title roots the trail is current, like the active section of the navigation tree", () => {
  const out = render("/example/reference/api/", [{ title: "Reference", url: "/example/reference/" }]);
  assert.match(out, /<a class="section-tab" href="\/example\/reference\/" aria-current="page">Reference<\/a>/);
  assert.doesNotMatch(out, /href="\/example\/" aria-current/);
  assert.match(out, /<a class="section-tab" href="\/example\/">Home<\/a>/);
});

test("a group tab is current while a page under it is active", () => {
  const out = render("/example/quickstart/", [{ title: "Guide", url: "/example/quickstart/" }]);
  assert.match(out, /href="\/example\/install\/" aria-current="page">Guide<\/a>/);
});

test("no tab is current when the trail is empty (the page is not in the navigation)", () => {
  const out = render("/example/unlisted/", []);
  assert.doesNotMatch(out, /aria-current/);
  assert.match(out, /<a class="section-tab" href="\/example\/">Home<\/a>/);
});

test("renders nothing without a main navigation list", () => {
  assert.equal(sectionTabs(propsWith("/example/", [], undefined)), null);
});

test("renders nothing when no top-level item is marked tab: true", () => {
  const plain: readonly NavSource[] = [{ title: "Only", url: "/example/only/" }];
  assert.equal(sectionTabs(propsWith("/example/", [], plain)), null);
});

test("skips a tab-marked group that has no leaf to link to", () => {
  const empty: readonly NavSource[] = [
    { title: "Hollow", children: [], tab: true },
    { title: "Real", url: "/example/real/", tab: true },
  ];
  const out = render("/example/real/", [{ title: "Real", url: "/example/real/" }], empty);
  assert.doesNotMatch(out, /Hollow/);
  assert.match(out, /<a class="section-tab" href="\/example\/real\/" aria-current="page">Real<\/a>/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  const css = readFileSync(new URL("../chrome/section-tabs/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css scrolls the tab row horizontally instead of wrapping", () => {
  const css = readFileSync(new URL("../chrome/section-tabs/style.css", import.meta.url), "utf8");
  assert.match(css, /\.section-tabs\s*\{[^}]*overflow-inline:\s*auto/);
  assert.match(css, /white-space:\s*nowrap/);
});
