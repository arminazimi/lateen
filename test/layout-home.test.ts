import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import home from "../layouts/home.ts";

const pos: SourcePos = { file: "index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function layoutProps(frontMatter: Record<string, unknown> = {}, html = ""): LayoutProps {
  const page: Page = {
    url: "/",
    source: pos,
    frontMatter,
    title: "Home",
    lang: "en",
    dir: "ltr",
    headings: [],
    html,
    markdown: "",
    kind: "doc",
  };
  const site: Site = { config: configWith(), pages: [page], nav: {}, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: "Home · Example", meta: [], links: [], jsonLd: [] },
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

const out = (frontMatter: Record<string, unknown> = {}, body = "") => html(home(layoutProps(frontMatter, body)));

test("the hero renders the eyebrow, title, and lead from front matter", () => {
  const page = out({ hero: { eyebrow: "v0.3.0 · 12 pages", title: "Docs you can trust.", lead: "One line." } });
  assert.match(
    page,
    /<div class="home-hero"><p class="home-eyebrow"><i aria-hidden="true"><\/i>v0\.3\.0 · 12 pages<\/p><h1 class="home-title">Docs you can trust\.<\/h1><p class="home-lead">One line\.<\/p>/,
  );
});

test("the hero title falls back to the page title", () => {
  const page = out({ hero: { lead: "One line." } });
  assert.match(page, /<h1 class="home-title">Home<\/h1>/);
  assert.doesNotMatch(page, /home-eyebrow/);
});

test("actions render as buttons; the primary one is filled and carries the arrow", () => {
  const page = out({
    actions: [
      { label: "Get started", url: "/guide/", primary: true },
      { label: "Browse the API", url: "/reference/" },
    ],
  });
  assert.match(page, /<div class="home-actions"><a class="home-btn home-btn-primary" href="\/guide\/">Get started<svg class="home-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"><\/path><\/svg><\/a>/);
  assert.match(page, /<a class="home-btn home-btn-quiet" href="\/reference\/">Browse the API<\/a>/);
});

test("an action without a label or a URL is dropped, and an empty list renders no row", () => {
  const dropped = out({ actions: [{ url: "/x/" }, { label: "No URL" }] });
  assert.doesNotMatch(dropped, /home-actions/);
  const empty = out({ actions: [] });
  assert.doesNotMatch(empty, /home-actions/);
});

test("sections render as a grid of cards with heading links, descriptions, and link lists", () => {
  const page = out({
    sections: [
      {
        title: "Guides",
        url: "/guide/",
        description: "Task-based pages.",
        icon: "M4 5h7a3 3 0 0 1 3 3v11",
        links: [
          { title: "Install", url: "/guide/install/", meta: "3 min" },
          { title: "Deploy", url: "/guide/deploy/" },
        ],
      },
    ],
  });
  assert.match(page, /<div class="home-sections"><div class="home-section"><h2 class="home-section-title"><span class="home-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 5h7a3 3 0 0 1 3 3v11"><\/path><\/svg><\/span><a href="\/guide\/">Guides<\/a><\/h2><p class="home-section-description">Task-based pages\.<\/p><ul class="home-section-links">/);
  assert.match(page, /<li><a href="\/guide\/install\/"><span>Install<\/span><span class="home-link-meta">3 min<\/span><\/a><\/li>/);
  assert.match(page, /<li><a href="\/guide\/deploy\/"><span>Deploy<\/span><\/a><\/li>/);
});

test("a section without a URL has a plain heading, and one without links has no list", () => {
  const page = out({ sections: [{ title: "Components", description: "Callouts, tabs, cards." }] });
  assert.match(page, /<h2 class="home-section-title">Components<\/h2>/);
  assert.doesNotMatch(page, /home-section-links/);
});

test("the page body renders after the hero and the section grids", () => {
  const page = out(
    {
      hero: { title: "Docs." },
      sections: [{ title: "Guides", url: "/guide/" }],
    },
    "<p>More about the project.</p>",
  );
  const hero = page.indexOf("home-hero");
  const sections = page.indexOf("home-sections");
  const body = page.indexOf("<p>More about the project.</p>");
  assert.ok(hero >= 0 && sections > hero && body > sections, `hero ${hero} < sections ${sections} < body ${body}`);
});

test("front matter that does not match the shape is dropped without throwing", () => {
  const page = out({ hero: "nope", actions: 42, sections: ["x", 7, null] });
  assert.match(page, /<h1 class="home-title">Home<\/h1>/);
  assert.doesNotMatch(page, /home-actions/);
  assert.doesNotMatch(page, /home-sections/);
});

test("sections and links with non-string fields are skipped", () => {
  const page = out({
    sections: [{ title: 9, url: "/x/" }, { title: "Guides", links: [{ title: "Install" }, { url: "/y/" }, { title: "Notes", url: 5 }] }],
  });
  assert.doesNotMatch(page, /href="\/x\/"/);
  assert.match(page, /<h2 class="home-section-title">Guides<\/h2>/);
  assert.doesNotMatch(page, /home-section-links/);
});

test("the home content sits in the base shell, so the document keeps lang, dir, and the skip link", () => {
  const page = out();
  assert.match(page, /^<html lang="en" dir="ltr"/);
  assert.match(page, /<body><a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(page, /<main id="main" tabindex="-1"><div class="home-hero">/i);
});
