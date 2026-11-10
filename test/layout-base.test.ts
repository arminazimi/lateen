import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import base, { MAIN_ID, THEME_KEY, THEME_SCRIPT } from "../layouts/base.ts";

const pos: SourcePos = { file: "docs/index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const config: SiteConfig = {
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
};

function layoutProps(overrides: Partial<Page> = {}): LayoutProps {
  const page: Page = {
    url: "/",
    source: pos,
    frontMatter: {},
    title: "Home",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Body</p>",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
  const site: Site = { config, pages: [page], nav: {}, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: {
      title: "Home · Example",
      meta: [
        { name: "description", content: "A page" },
        { name: "og:title", content: "Home", property: true },
      ],
      links: [
        { rel: "canonical", href: "https://example.com/" },
        { rel: "alternate", href: "/fa/", attrs: { hreflang: "fa" } },
      ],
      jsonLd: [{ "@type": "WebPage", name: "</script><b>" }],
    },
    islands: [{ name: "copy", src: "/assets/copy.js" }],
  };
}

type VNode = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

const VOID = new Set(["meta", "link"]);

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
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

const out = (props: Parameters<typeof base>[0]) => html(base(props));

test("html carries lang and dir from the page", () => {
  assert.match(out(layoutProps()), /^<html lang="en" dir="ltr"/);
  assert.match(out(layoutProps({ lang: "fa", dir: "rtl" })), /^<html lang="fa" dir="rtl"/);
});

test("head renders title, meta, links, and escaped JSON-LD", () => {
  const html = out(layoutProps());
  assert.match(html, /<title>Home · Example<\/title>/);
  assert.match(html, /<meta name="description" content="A page"/);
  assert.match(html, /<meta property="og:title" content="Home"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/"/);
  assert.match(html, /<link hreflang="fa" rel="alternate" href="\/fa\/">/);
  assert.match(html, /<meta charset="utf-8"/);
  assert.match(html, /<meta name="viewport"/);
  const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
  assert.ok(ld, "JSON-LD script present");
  assert.equal(JSON.parse(ld[1]!)["@type"], "WebPage");
  assert.ok(!ld[1]!.includes("</script>"));
});

test("theme script runs in head before the title and any stylesheet", () => {
  const html = out(layoutProps());
  const script = html.indexOf(THEME_SCRIPT);
  assert.ok(script > html.indexOf("<head>"));
  assert.ok(script < html.indexOf("<title>"));
  assert.ok(script < html.indexOf("<link"));
  assert.ok(html.indexOf("</head>") > script);
});

function runThemeScript(stored: string | null | "throw", systemLight: boolean): string | null {
  const attrs: Record<string, string> = {};
  const g = globalThis as Record<string, unknown>;
  const names = ["document", "localStorage", "matchMedia"];
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(g, name)] as const);
  for (const name of names) Object.defineProperty(g, name, { configurable: true, writable: true, value: undefined });
  g.document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  g.localStorage = {
    getItem: (key: string) => {
      assert.equal(key, THEME_KEY);
      if (stored === "throw") throw new Error("denied");
      return stored;
    },
  };
  g.matchMedia = () => ({ matches: systemLight });
  try {
    new Function(THEME_SCRIPT)();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, name, descriptor);
      else delete g[name];
    }
  }
  return attrs["data-theme"] ?? null;
}

test("theme script: first visit is dark, stored choice wins, system follows the OS", () => {
  assert.equal(runThemeScript(null, true), "dark");
  assert.equal(runThemeScript("light", false), "light");
  assert.equal(runThemeScript("dark", true), "dark");
  assert.equal(runThemeScript("system", true), "light");
  assert.equal(runThemeScript("system", false), "dark");
  assert.equal(runThemeScript("bogus", true), "dark");
  assert.equal(runThemeScript("throw", true), "dark");
});

test("skip link is the first element in body and targets main", () => {
  const html = out(layoutProps());
  assert.match(html, new RegExp(`<body><a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`));
  assert.match(html, new RegExp(`<main id="${MAIN_ID}" tabindex="-1">`, "i"));
});

test("main always renders; page HTML is the default content", () => {
  const html = out(layoutProps());
  assert.match(html, /<main[^>]*><div><p>Body<\/p><\/div><\/main>/);
  assert.doesNotMatch(html, /<header|<footer|class="sidebar"|class="aside"/);
});

test("slots land in their landmarks in document order", () => {
  const html = out({
    ...layoutProps(),
    header: h("span", null, "H"),
    sidebar: h("nav", null, "S"),
    main: h(Fragment, null, "M"),
    aside: h("nav", null, "A"),
    footer: h("span", null, "F"),
  });
  assert.match(html, /<header><span>H<\/span><\/header>/);
  assert.match(html, /<aside class="sidebar" id="site-navigation" aria-label="Site navigation"><nav>S<\/nav><\/aside>/);
  assert.match(html, /<main[^>]*>M<\/main>/);
  assert.match(html, /<aside class="aside" aria-label="On this page"><nav>A<\/nav><\/aside>/);
  assert.match(html, /<footer><span>F<\/span><\/footer>/);
  const order = ["<header>", 'class="sidebar"', "<main", 'class="aside"', "<footer>"].map((s) => html.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("islands load as modules at the end of body", () => {
  const html = out(layoutProps());
  assert.match(html, /<script type="module" src="\/assets\/copy\.js"><\/script><\/body>/);
});
