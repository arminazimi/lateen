import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { h } from "preact";
import type { ChromeProps, LayoutProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import skipLinks, { MAIN_ID, NAVIGATION_ID } from "../chrome/skip-links/index.ts";
import base from "../layouts/base.ts";
import home from "../layouts/home.ts";
import notFound from "../layouts/not-found.ts";

const pos: SourcePos = { file: "docs/index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "",
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
    ...overrides,
  };
}

function pageAt(lang = "en"): Page {
  return {
    url: "/",
    source: pos,
    frontMatter: {},
    title: "Home",
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    headings: [],
    html: "<p>Body</p>",
    markdown: "",
    kind: "doc",
  };
}

const tree: NavTree = {
  main: [
    { title: "Home", url: "/" },
    { title: "Guide", children: [{ title: "Install", url: "/guide/install/" }] },
  ],
};

function props(nav: NavTree, lang = "en"): LayoutProps {
  const page = pageAt(lang);
  const site: Site = { config: configWith({ lang, dir: lang === "en" ? "ltr" : "rtl" }), pages: [page], nav, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

function chromeProps(nav: NavTree, lang = "en"): ChromeProps {
  const { site, page, trail, pager } = props(nav, lang);
  return { site, page, trail, pager };
}

type VNode = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

const VOID = new Set(["meta", "link", "input"]);

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : html(children)}</${tag}>`;
}

/** Every in-page link must lead to an element that exists. */
function assertTargets(document: string): void {
  for (const match of document.matchAll(/href="#([^"]+)"/g)) {
    assert.match(document, new RegExp(`id="${match[1]}"`), `#${match[1]} has no target`);
  }
}

test("the first link is always the content link", () => {
  assert.equal(html(skipLinks(chromeProps({}))), `<a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`);
});

test("the navigation link appears only when the site has navigation", () => {
  assert.doesNotMatch(html(skipLinks(chromeProps({}))), new RegExp(NAVIGATION_ID));
  assert.doesNotMatch(html(skipLinks(chromeProps({ main: [] }))), new RegExp(NAVIGATION_ID));

  const out = html(skipLinks(chromeProps(tree)));
  assert.match(out, new RegExp(`<a class="skip-link" href="#${NAVIGATION_ID}">Skip to navigation</a>`));
});

test("content comes before navigation", () => {
  const out = html(skipLinks(chromeProps(tree)));
  assert.ok(out.indexOf(`#${MAIN_ID}`) < out.indexOf(`#${NAVIGATION_ID}`));
});

test("the labels follow the page language", () => {
  const fa = html(skipLinks(chromeProps(tree, "fa")));
  assert.match(fa, />رفتن به محتوا</);
  assert.match(fa, />رفتن به ناوبری</);

  const ar = html(skipLinks(chromeProps(tree, "ar")));
  assert.match(ar, />انتقال إلى المحتوى</);
  assert.match(ar, />انتقال إلى التنقل</);
});

test("the base shell places both links and gives the sidebar the navigation id", () => {
  const out = html(base({ ...props(tree), sidebar: h("nav", null, "S") }));
  assert.match(out, new RegExp(`<body><a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`));
  assert.match(out, new RegExp(`<a class="skip-link" href="#${NAVIGATION_ID}">Skip to navigation</a>`));
  assert.match(out, new RegExp(`<aside class="sidebar" id="${NAVIGATION_ID}" aria-label="Site navigation">`));
  assert.match(out, new RegExp(`<main id="${MAIN_ID}"`));
  assertTargets(out);
});

test("the base shell leaves out the navigation link when it places no sidebar", () => {
  const out = html(base(props(tree)));
  assert.doesNotMatch(out, new RegExp(NAVIGATION_ID));
  assertTargets(out);
});

test("home and 404 keep every skip link target", () => {
  for (const layout of [home, notFound]) {
    const out = html(layout(props(tree)));
    assert.match(out, new RegExp(`<a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`));
    assert.doesNotMatch(out, new RegExp(NAVIGATION_ID));
    assertTargets(out);
  }
});

test("style.css keeps the links out of sight until focus, with token values only", () => {
  const css = readFileSync(new URL("../chrome/skip-links/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);

  assert.match(css, /\.skip-link \{[\s\S]*transform: translateY\(-200%\);/);
  assert.match(css, /\.skip-link:focus \{\n {2}transform: none;\n\}/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
});
