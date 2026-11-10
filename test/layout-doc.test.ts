import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { Heading, LayoutProps, Page, RepositoryConfig, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import doc from "../layouts/doc.ts";

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function heading(depth: 1 | 2 | 3, text: string): Heading {
  return { depth, text, id: text.toLowerCase(), pos };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Run the build.</p>",
    markdown: "Run the build.",
    kind: "doc",
    ...overrides,
  };
}

function layoutProps(
  page: Page,
  nav: Site["nav"]["main"] = [],
  trail: LayoutProps["trail"] = [],
  data: Site["data"] = {},
  repository?: RepositoryConfig,
): LayoutProps {
  const site: Site = {
    config: configWith(repository === undefined ? {} : { repository }),
    pages: [page],
    nav: { main: nav },
    data,
  };
  return {
    site,
    page,
    trail,
    pager: { prev: { title: "Overview", url: "/guide/" }, next: { title: "Configure", url: "/guide/configure/" } },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
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

const out = (page: Page, nav: Site["nav"]["main"] = [], trail: LayoutProps["trail"] = []) => html(doc(layoutProps(page, nav, trail)));

test("the article carries data-pagefind-body and sits in the main landmark", () => {
  const page = out(pageWith());
  assert.match(page, /<main id="main" tabIndex="-1"><article class="doc" data-pagefind-body>/);
});

test("the layout renders the h1 when the body has no top-level heading", () => {
  const page = out(pageWith());
  assert.match(page, /<article class="doc"[^>]*><h1>Install<\/h1>/);
});

test("the layout skips its h1 when a depth-1 heading exists, even with a front-matter title", () => {
  const page = out(
    pageWith({
      title: "From front matter",
      frontMatter: { title: "From front matter" },
      headings: [heading(1, "Install"), heading(2, "Pick a mode")],
    }),
  );
  assert.doesNotMatch(page, /<h1>/);
});

test("the body, page footer, and pager follow the title inside the article", () => {
  const page = out(pageWith());
  const article = /<article class="doc"[^>]*>(.*?)<\/article>/s.exec(page);
  assert.ok(article, "article present");
  assert.match(
    article[1] ?? "",
    /<div class="doc-body"><p>Run the build.<\/p><\/div><div class="doc-actions"><div class="page-footer">[\s\S]*<nav class="pager" aria-label="Previous and next pages"><a class="pager-link pager-prev" href="\/guide\/" rel="prev">/,
  );
});

test("the copy-Markdown control follows the page footer and stays before the pager", () => {
  const page = out(pageWith());
  const article = /<article class="doc"[^>]*>(.*?)<\/article>/s.exec(page);
  assert.ok(article, "article present");
  assert.match(
    article[1] ?? "",
    /<div class="page-footer">[\s\S]*<\/div><div class="copy-markdown" data-copy-markdown>[\s\S]*data-copy-markdown-button[\s\S]*<nav class="pager"/,
  );
});

test("the breadcrumb leads the article and repeats the trail, end at the current page", () => {
  const trail = [
    { title: "Guides", url: "/guide/" },
    { title: "Install", url: "/guide/install/" },
  ];
  const page = out(pageWith(), [], trail);
  assert.match(page, /<article class="doc"[^>]*><nav class="breadcrumb" aria-label="Breadcrumb"><a href="\/guide\/">Guides<\/a>/);
  assert.match(page, /<span aria-current="page">Install<\/span><\/nav><h1>Install<\/h1>/);
});

test("the sidebar renders in the site-navigation aside and the toc in the on-this-page aside", () => {
  const nav = [{ title: "Guides", children: [{ title: "Install", url: "/guide/install/" }] }];
  const page = out(pageWith({ headings: [heading(2, "Pick a mode"), heading(3, "Gem")] }), nav);
  assert.match(page, /<aside class="sidebar" id="site-navigation" aria-label="Site navigation"><nav class="sidebar-nav"/);
  assert.match(page, /<aside class="aside" aria-label="On this page"><aside class="toc" aria-label="On this page">/);
  assert.match(page, /<details class="toc-fold"><summary>On this page<\/summary>/);
});

test("the header and the drawer share the header slot", () => {
  const nav = [{ title: "Guides", children: [{ title: "Install", url: "/guide/install/" }] }];
  const page = out(pageWith(), nav);
  assert.match(page, /<header><header class="header">/);
  const drawer = /<dialog class="drawer" data-drawer aria-label="Menu">([\s\S]*?)<\/dialog>/.exec(page);
  assert.ok(drawer, "drawer dialog present");
  assert.match(drawer?.[1] ?? "", /data-drawer-close/);
  assert.match(drawer?.[1] ?? "", /<nav class="sidebar-nav"/);
});

test("empty navigation leaves the sidebar and drawer out without breaking the page", () => {
  const page = out(pageWith());
  assert.doesNotMatch(page, /aside class="sidebar"/);
  assert.doesNotMatch(page, /dialog class="drawer"/);
  assert.doesNotMatch(page, /aside class="toc"/);
  assert.match(page, /^<html lang="en" dir="ltr"/);
  assert.match(page, /<a class="skip-link" href="#main">Skip to content<\/a>/);
});

test("the drift banner from site.data sits above the status banner and the title", () => {
  const data = { drift: { "/guide/install/": [{}, {}] } };
  const page = html(doc(layoutProps(pageWith({ frontMatter: { status: "beta" } }), [], [], data)));
  assert.match(page, /<aside class="drift-banner" role="note"><span class="drift-banner-message">2 drift findings<\/span><\/aside>/);
  assert.ok(
    page.indexOf('class="drift-banner"') < page.indexOf('class="page-status'),
    "the drift banner comes before the status banner",
  );
  assert.ok(page.indexOf('class="drift-banner"') < page.indexOf("<h1>"), "the drift banner comes before the title");
  assert.doesNotMatch(html(doc(layoutProps(pageWith()))), /class="drift-banner"/);
});

test("the trust panel from site.data sits under the title and before the reading time", () => {
  const data = { trust: { "/guide/install/": { level: "verified", reasons: ["All examples passed."] } } };
  const page = html(doc(layoutProps(pageWith(), [], [], data)));
  assert.match(page, /<h1>Install<\/h1><details class="trust-panel trust-panel-verified"/);
  assert.doesNotMatch(html(doc(layoutProps(pageWith()))), /class="trust-panel"/);
});

test("the status banner from front matter sits between the breadcrumb and the title", () => {
  const page = out(pageWith({ frontMatter: { status: "beta" } }));
  assert.match(
    page,
    /<article class="doc"[^>]*><div class="page-status page-status-beta" role="note"><strong class="page-status-label">Beta<\/strong>[\s\S]*?<\/div><h1>Install<\/h1>/,
  );
});

test("the edit link sits between the body and the page footer, and is absent without a repository", () => {
  const page = pageWith();
  const rendered = html(doc(layoutProps(page, [], [], {}, { url: "https://github.com/o/r" })));

  assert.match(
    rendered,
    /<div class="doc-body"><p>Run the build\.<\/p><\/div><div class="edit-page" data-edit-page><a class="edit-page-link" href="https:\/\/github\.com\/o\/r\/edit\/main\/guide\/install\.md" rel="noopener">Edit this page<\/a><\/div><div class="doc-actions"><div class="page-footer">/,
  );
  assert.doesNotMatch(html(doc(layoutProps(page))), /class="edit-page"/);
});

test("the banner shows `since`, and a deprecated page links to its replacement", () => {
  const page = out(
    pageWith({ frontMatter: { status: "deprecated", since: "0.3.0", replaced_by: "/guide/new-install/" } }),
  );
  assert.match(page, /<span class="page-status-since">Since 0\.3\.0<\/span>/);
  assert.match(
    page,
    /<a class="page-status-replacement" href="\/guide\/new-install\/">Go to the replacement<\/a>/,
  );
});

test("the banner renders above the body's own h1, which the layout still leaves out", () => {
  const page = out(
    pageWith({ frontMatter: { status: "experimental" }, headings: [heading(1, "Install")] }),
  );
  assert.match(page, /class="page-status page-status-experimental"/);
  assert.doesNotMatch(page, /<h1>/);
});

test("a status with no banner, and a non-string `since`, leave the page as they found it", () => {
  const page = out(pageWith({ frontMatter: { status: "accepted", since: 3 } }));
  assert.doesNotMatch(page, /page-status/);
  assert.match(page, /<article class="doc"[^>]*><h1>Install<\/h1>/);
});
