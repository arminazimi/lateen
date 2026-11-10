import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import notFound, { SEARCH_ID } from "../layouts/not-found.ts";

const pos: SourcePos = { file: "404.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function layoutProps(config: Partial<SiteConfig> = {}, main: Site["nav"]["main"] = []): LayoutProps {
  const page: Page = {
    url: "/404.html",
    source: pos,
    frontMatter: {},
    title: "Not found",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
  const site: Site = { config: configWith(config), pages: [page], nav: { main }, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: "Not found · Example", meta: [], links: [], jsonLd: [] },
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

const out = (props: LayoutProps) => html(notFound(props));

test("renders a 404 heading and message inside main", () => {
  const page = out(layoutProps());
  assert.match(page, /<main id="main" tabindex="-1"><div class="not-found"><p class="not-found-code" aria-hidden="true">404<\/p><h1>Page not found<\/h1>/i);
});

test("search form is a GET form to the site search page, with a labelled field", () => {
  const page = out(layoutProps({ base: "/docs" }));
  assert.match(page, /<form class="not-found-search" role="search" action="\/docs\/search\/" method="get">/);
  assert.match(page, new RegExp(`<label for="${SEARCH_ID}">Search the docs</label>`));
  assert.match(page, new RegExp(`<input id="${SEARCH_ID}" type="search" name="q"`));
});

test("home link is root-relative and includes the site base", () => {
  const page = out(layoutProps({ base: "/docs" }));
  assert.match(page, /<nav class="not-found-sections" aria-label="Sections"><ul><li><a href="\/docs\/">Home<\/a><\/li>/);
});

test("top-level main navigation links appear after home, without a duplicate home", () => {
  const page = out(
    layoutProps({}, [
      { title: "Home", url: "/" },
      { title: "Reference", url: "/reference/" },
      { title: "Guides", children: [{ title: "Hidden", url: "/guides/x/" }] },
      { title: "Dashboard", url: "/dashboard/" },
    ]),
  );
  const nav = /<nav class="not-found-sections"[^>]*>(.*?)<\/nav>/s.exec(page);
  assert.ok(nav, "section nav present");
  assert.equal(
    nav[1],
    '<ul><li><a href="/">Home</a></li><li><a href="/reference/">Reference</a></li><li><a href="/dashboard/">Dashboard</a></li></ul>',
  );
});

test("404 content sits in the base shell, so the document keeps lang, dir, and the skip link", () => {
  const page = out(layoutProps());
  assert.match(page, /^<html lang="en" dir="ltr"/);
  assert.match(page, /<body><a class="skip-link" href="#main">Skip to content<\/a>/);
});
