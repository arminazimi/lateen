import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { LanguageConfig, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
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
    header: h("header", { class: "header" }, h("span", null, "H")),
    sidebar: h("nav", { "aria-label": "Site navigation" }, "S"),
    main: h(Fragment, null, "M"),
    aside: h("nav", { "aria-label": "On this page" }, "A"),
    footer: h("span", null, "F"),
  });
  assert.match(html, /<header class="header"><span>H<\/span><\/header>/);
  assert.match(html, /<div class="sidebar" id="site-navigation"><nav aria-label="Site navigation">S<\/nav><\/div>/);
  assert.match(html, /<main[^>]*>M<\/main>/);
  assert.match(html, /<div class="aside"><nav aria-label="On this page">A<\/nav><\/div>/);
  assert.match(html, /<footer><span>F<\/span><\/footer>/);
  const order = ['<header class="header"', 'class="sidebar"', "<main", 'class="aside"', "<footer>"].map((s) => html.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("the shell leaves the banner and the side navigation to the slots, so each landmark appears once", () => {
  const html = out({
    ...layoutProps(),
    header: h("header", { class: "header" }, "H"),
    sidebar: h("nav", { "aria-label": "Site navigation" }, "S"),
    aside: h("nav", { "aria-label": "On this page" }, "A"),
  });
  assert.equal(html.match(/<header/g)?.length, 1, "one banner landmark");
  assert.equal(html.match(/<main/g)?.length, 1, "one main landmark");
  assert.equal(html.match(/aria-label="Site navigation"/g)?.length, 1, "the navigation landmark is named once");
  assert.doesNotMatch(html, /<aside/, "no extra complementary landmark around the slots");
});

test("islands load as modules at the end of body", () => {
  const html = out(layoutProps());
  assert.match(html, /<script type="module" src="\/assets\/copy\.js"><\/script><\/body>/);
});

test("the favicon option adds icon links under the site base, and nothing when unset", () => {
  const props = layoutProps();
  const withIcons: LayoutProps = {
    ...props,
    site: {
      ...props.site,
      config: {
        ...config,
        base: "/docs",
        theme: { options: { favicon: { svg: "/brand/favicon.svg", ico: "/brand/favicon.ico", apple: "/brand/apple-touch-icon.png" } } },
      },
    },
  };
  const out = JSON.stringify(base(withIcons));
  assert.match(out, /"rel":"icon","href":"\/docs\/brand\/favicon\.ico"/);
  assert.match(out, /"type":"image\/svg\+xml"/);
  assert.match(out, /"rel":"apple-touch-icon","href":"\/docs\/brand\/apple-touch-icon\.png"/);
  assert.doesNotMatch(JSON.stringify(base(props)), /"rel":"icon"/);
});

const EN: LanguageConfig = { code: "en", name: "English", prefix: "" };
const FA: LanguageConfig = { code: "fa", name: "فارسی", prefix: "/fa" };

/** A two-language site under `base`, with the current page given, and no canonical link in the head. */
function multilingual(current: Page, overrides: Partial<SiteConfig> = {}): LayoutProps {
  const props = layoutProps();
  const en: Page = { ...props.page, url: "/docs/guide/", lang: "en", dir: "ltr" };
  const fa: Page = { ...props.page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" };
  return {
    ...props,
    page: current,
    head: { ...props.head, links: [] },
    site: {
      config: { ...config, base: "/docs", url: "https://example.com", languages: [EN, FA], ...overrides },
      pages: [en, fa],
      nav: {},
      data: {},
    },
  };
}

test("writes one canonical: the head's own, or one from the site url when the head has none", () => {
  const given = out(layoutProps());
  assert.equal(given.match(/rel="canonical"/g)?.length, 1);
  assert.match(given, /<link rel="canonical" href="https:\/\/example\.com\/">/);

  const added = out(multilingual({ ...layoutProps().page, url: "/docs/guide/", lang: "en" }));
  assert.equal(added.match(/rel="canonical"/g)?.length, 1);
  assert.match(added, /<link rel="canonical" href="https:\/\/example\.com\/docs\/guide\/">/);

  const props = multilingual({ ...layoutProps().page, url: "/docs/guide/", lang: "en" }, { url: "" });
  assert.doesNotMatch(out(props), /rel="canonical"/);
});

test("adds absolute hreflang alternates and x-default from the translation model", () => {
  const html = out(multilingual({ ...layoutProps().page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" }));

  assert.match(html, /<link hreflang="en" rel="alternate" href="https:\/\/example\.com\/docs\/guide\/">/);
  assert.match(html, /<link hreflang="fa" rel="alternate" href="https:\/\/example\.com\/docs\/fa\/guide\/">/);
  assert.match(html, /<link hreflang="x-default" rel="alternate" href="https:\/\/example\.com\/docs\/guide\/">/);
  assert.equal(html.match(/rel="alternate"/g)?.length, 3);
});

test("keeps the engine's hreflang alternates and adds no duplicate", () => {
  const props = multilingual({ ...layoutProps().page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" });
  const engineLinks = [
    { rel: "alternate", href: "https://example.com/docs/guide/", attrs: { hreflang: "en" } },
    { rel: "alternate", href: "https://example.com/docs/fa/guide/", attrs: { hreflang: "fa" } },
    { rel: "alternate", href: "https://example.com/docs/guide/", attrs: { hreflang: "x-default" } },
  ];
  const html = out({ ...props, head: { ...props.head, links: engineLinks } });

  for (const hreflang of ["en", "fa", "x-default"]) {
    assert.equal(html.match(new RegExp(`<link hreflang="${hreflang}" rel="alternate"`, "g"))?.length, 1, `one ${hreflang} link`);
  }
  assert.equal(html.match(/rel="alternate"/g)?.length, 3);
});

test("writes no canonical or alternate without a site url, even for an absolute mapped alternate", () => {
  const props = multilingual({ ...layoutProps().page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" }, { url: "" });
  const html = out({
    ...props,
    site: {
      ...props.site,
      data: {
        languages: {
          alternates: {
            "/guide/": {
              en: "https://example.com/docs/guide/",
              fa: "https://example.com/docs/fa/guide/",
            },
          },
        },
      },
    },
  });

  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /hreflang=/);
  assert.doesNotMatch(html, /rel="alternate"/);
});

test("omits x-default and every alternate when the default language has no page or the site has no url", () => {
  const onlyFa = multilingual({ ...layoutProps().page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" });
  const single = { ...onlyFa, site: { ...onlyFa.site, pages: [onlyFa.page] } };
  const html = out(single);
  assert.match(html, /<link hreflang="fa" rel="alternate"/);
  assert.doesNotMatch(html, /x-default/);
  assert.doesNotMatch(html, /hreflang="en"/);

  const noUrl = multilingual({ ...layoutProps().page, url: "/docs/fa/guide/", lang: "fa", dir: "rtl" }, { url: "" });
  assert.doesNotMatch(out(noUrl), /hreflang=/);
});

test("escapes canonical and alternate URLs, so metadata cannot break out of its attribute", () => {
  const hostile = 'https://example.com/"><script>alert(1)</script>';
  const html = renderToString(base(multilingual({ ...layoutProps().page, url: "/docs/guide/", lang: "en" }, { url: hostile })) as never);

  assert.match(html, /&quot;>&lt;script>alert\(1\)&lt;\/script>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /rel="canonical" href="https:\/\/example\.com\/">/);
});
