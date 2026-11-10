import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { Heading, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import changelog, {
  ARTICLE_CLASS,
  BODY_CLASS,
  RELEASES_CLASS,
  TOC_CLASS,
  TOC_LIST_CLASS,
  compareVersions,
  newestFirst,
  releasesOf,
} from "../layouts/changelog.ts";

const pos: SourcePos = { file: "changelog.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function pageWith(
  frontMatter: Record<string, unknown> = {},
  html = "",
  headings: readonly Heading[] = [],
  lang = "en",
): Page {
  return {
    url: "/changelog/",
    source: pos,
    frontMatter,
    title: typeof frontMatter.title === "string" ? frontMatter.title : "Changelog",
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    headings: [...headings],
    html,
    markdown: "",
    kind: "doc",
  };
}

function layoutProps(
  page: Page,
  nav: Site["nav"]["main"] = [],
  config: Partial<SiteConfig> = {},
): LayoutProps {
  const site: Site = { config: configWith(config), pages: [page], nav: { main: nav }, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

type VNode = {
  type: unknown;
  props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown };
};

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

const VOID = new Set(["meta", "link", "input"]);

/** Minimal Preact vnode → HTML string for assertions, with the escaping Preact applies. */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeAttr(String(value))}"`))
    .join("");
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : html(children)}</${tag}>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

const out = (
  frontMatter: Record<string, unknown> = {},
  body = "",
  headings: readonly Heading[] = [],
  lang = "en",
  nav: Site["nav"]["main"] = [],
) => html(changelog(layoutProps(pageWith(frontMatter, body, headings, lang), nav)));

/** The index of a section by id; the TOC links `#id`, so `id="…"` names only the section. */
const sectionAt = (page: string, id: string): number => page.indexOf(`<section class="changelog-entry" id="${id}"`);

test("renders one changelog entry per release, newest version first", () => {
  const page = out({
    releases: [
      { version: "1.0.0", date: "2026-01-01", body: "<p>First.</p>" },
      { version: "2.0.0", date: "2026-02-01", body: "<p>Latest.</p>" },
      { version: "1.9.0", date: "2026-03-01", body: "<p>Middle.</p>" },
    ],
  });

  const order = ["v2-0-0", "v1-9-0", "v1-0-0"].map((id) => sectionAt(page, id));
  assert.ok(order.every((index) => index >= 0), "every release has a section");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "2.0.0, then 1.9.0, then 1.0.0");
  assert.match(page, /<div class="changelog-releases">/);
});

test("the order is numeric, not textual: 1.10.0 comes before 1.9.0", () => {
  assert.ok(compareVersions("1.9.0", "1.10.0") < 0);
  assert.ok(compareVersions("2.0.0-rc.1", "2.0.0") < 0);
  assert.equal(compareVersions("v1.2.0", "1.2.0"), 0);

  const page = out({
    releases: [{ version: "1.9.0" }, { version: "1.10.0" }],
  });
  assert.ok(sectionAt(page, "v1-10-0") < sectionAt(page, "v1-9-0"));
});

test("an unreleased entry leads, and an empty or missing version is not a bare `v`", () => {
  const page = out({
    releases: [{ date: "2026-03-01", body: "<p>Next.</p>" }, { version: "1.0.0" }, { version: "  " }],
  });
  assert.ok(sectionAt(page, "vunversioned") < sectionAt(page, "v1-0-0"));
  assert.match(page, /id="vunversioned"[\s\S]*?>Unreleased<\/span>/);
  assert.doesNotMatch(page, /id="v"/);
});

test("a release renders its date, categories, and body through the changelog entry component", () => {
  const page = out({
    releases: [
      {
        version: "2.0.0",
        date: "2026-02-01",
        categories: ["added", "fixed"],
        body: '<p>See <a href="#v2-0-0">the notes</a>.</p>',
      },
    ],
  });

  assert.match(page, /<section class="changelog-entry" id="v2-0-0"/);
  assert.match(page, /<h2 class="changelog-entry-version"[^>]*><span[^>]*>2\.0\.0<\/span>/);
  assert.match(page, /<time class="changelog-entry-date" datetime="2026-02-01">February 1, 2026<\/time>/);
  assert.match(page, />Added<\/span>/);
  assert.match(page, />Fixed<\/span>/);
  assert.match(page, /<div class="changelog-entry-body"><div><p>See <a href="#v2-0-0">the notes<\/a>\.<\/p><\/div><\/div>/);
});

test("an entry without a body shows the component's no-details note", () => {
  const page = out({ releases: [{ version: "1.0.0" }] });
  assert.match(page, /<p class="changelog-entry-empty">No details for this release\.<\/p>/);
});

test("the compact version contents sits above the releases and links to each anchor", () => {
  const page = out({
    releases: [{ version: "1.0.0" }, { version: "2.0.0" }],
  });

  const toc = new RegExp(`<nav class="${TOC_CLASS}" aria-label="Versions">([\\s\\S]*?)<\\/nav>`).exec(page);
  assert.ok(toc, "the version contents is a labelled nav");
  assert.match(toc[1] ?? "", /<h2 class="changelog-toc-title">Versions<\/h2>/);
  assert.match(
    toc[1] ?? "",
    new RegExp(
      `<ul class="${TOC_LIST_CLASS}"><li><a href="#v2-0-0">2\\.0\\.0<\\/a><\\/li><li><a href="#v1-0-0">1\\.0\\.0<\\/a><\\/li><\\/ul>`,
    ),
  );
  assert.ok(page.indexOf(`class="${TOC_CLASS}"`) < sectionAt(page, "v2-0-0"), "the contents comes first");

  for (const match of page.matchAll(/<a href="#([^"]+)"/g)) {
    assert.ok(page.includes(`id="${match[1]}"`), `#${match[1]} should point at a section`);
  }
});

test("mentions no version twice: one contents link and one section anchor per release", () => {
  const page = out({ releases: [{ version: "1.0.0" }, { version: "2.0.0" }] });
  assert.equal(page.match(/href="#v2-0-0"/g)?.length, 2, "the contents link and the entry's self link");
});

test("falls back to the page body when front matter gives no releases", () => {
  const page = out({}, "<p>Hand-written notes.</p>");
  assert.match(
    page,
    new RegExp(
      `<article class="${ARTICLE_CLASS}" data-pagefind-body><h1 class="changelog-title">Changelog</h1><div class="${BODY_CLASS}"><p>Hand-written notes\\.</p></div></article>`,
    ),
  );
  assert.doesNotMatch(page, new RegExp(TOC_CLASS));
  assert.doesNotMatch(page, new RegExp(RELEASES_CLASS));
});

test("an empty or malformed releases list also falls back to the body", () => {
  for (const releases of [[], "not a list", { version: "1.0.0" }, ["not a record", null, 3]]) {
    const page = out({ releases }, "<p>Body.</p>");
    assert.match(page, new RegExp(`<div class="${BODY_CLASS}"><p>Body\\.</p></div>`), JSON.stringify(releases));
    assert.doesNotMatch(page, new RegExp(TOC_CLASS), JSON.stringify(releases));
  }
});

test("the fallback skips its h1 when the body already brings one", () => {
  const page = out({}, "<h1>Changelog</h1><p>Notes.</p>", [heading(1, "Changelog")]);
  assert.doesNotMatch(page, /<h1 class="changelog-title">/);
  assert.match(page, new RegExp(`<div class="${BODY_CLASS}"><h1>Changelog</h1>`));
});

test("malformed release records are dropped without losing the others", () => {
  const page = out({ releases: ["release", null, 3, { version: "1.0.0" }] });
  assert.equal(page.match(/<section class="changelog-entry"/g)?.length, 1);
  assert.equal(releasesOf(pageWith({ releases: ["release", null, 3] })).length, 0);
});

test("releases sharing a version keep the author's order", () => {
  const page = out({
    releases: [
      { version: "1.0.0", body: "<p>First listed.</p>" },
      { version: "1.0.0", body: "<p>Second listed.</p>" },
    ],
  });
  assert.ok(page.indexOf("First listed.") < page.indexOf("Second listed."));
});

test("escapes the page title and the version text, and keeps the id to a safe slug", () => {
  const page = out({
    title: "Changelog <b>notes</b>",
    releases: [{ version: "<script>alert(1)</script>" }],
  });
  assert.doesNotMatch(page, /<script>alert/i);
  assert.match(page, /<h1 class="changelog-title">Changelog &lt;b&gt;notes&lt;\/b&gt;<\/h1>/);
  assert.match(page, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(page, /id="vscript-alert-1-script"/);
});

test("a Persian page renders the component's Persian labels", () => {
  const page = out(
    { releases: [{ version: "1.0.0", date: "2026-11-09", categories: "added" }] },
    "",
    [],
    "fa",
  );
  assert.match(page, /<html lang="fa" dir="rtl"/);
  assert.match(page, /datetime="2026-11-09">۱۸ آبان ۱۴۰۵<\/time>/);
  assert.match(page, />افزوده‌شده<\/span>/);
});

test("the changelog composes the base shell with the header, drawer, and sidebar", () => {
  const page = out(
    { releases: [{ version: "1.0.0" }] },
    "",
    [],
    "en",
    [{ title: "Guides", children: [{ title: "Changelog", url: "/changelog/" }] }],
  );
  assert.match(page, /^<html lang="en" dir="ltr"/);
  assert.match(page, /<header><header class="header">/);
  assert.match(page, /<aside class="sidebar" id="site-navigation" aria-label="Site navigation">/);
  const drawer = /<dialog class="drawer" data-drawer aria-label="Menu">([\s\S]*?)<\/dialog>/.exec(page);
  assert.ok(drawer, "the mobile drawer is present");
  assert.doesNotMatch(page, /class="breadcrumb"/);
  assert.doesNotMatch(page, /class="pager"/);
  assert.doesNotMatch(page, /class="page-status/);
});

test("the same front matter renders the same HTML", () => {
  const frontMatter = {
    releases: [
      { version: "1.2.0", date: "2026-11-09", categories: ["fixed"], body: "<p>Fixed.</p>" },
      { version: "1.1.0", date: "2026-10-01", body: "<p>Shipped.</p>" },
    ],
  };
  assert.equal(out(frontMatter), out(frontMatter));
});

test("newestFirst sorts a copy and leaves the front matter order alone", () => {
  const releases = releasesOf(
    pageWith({ releases: [{ version: "1.0.0" }, { version: "2.0.0" }, { version: "1.5.0" }] }),
  );
  assert.deepEqual(
    newestFirst(releases).map((release) => release.version),
    ["2.0.0", "1.5.0", "1.0.0"],
  );
  assert.deepEqual(
    releases.map((release) => release.version),
    ["1.0.0", "2.0.0", "1.5.0"],
  );
});

function tokenNames(): Set<string> {
  const names = JSON.parse(
    readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8"),
  ) as Record<string, Record<string, unknown>>;
  const allowed = new Set<string>();
  for (const [group, entries] of Object.entries(names)) {
    for (const key of Object.keys(entries)) allowed.add(`--${group}-${key}`);
  }
  return allowed;
}

const changelogCss = () => readFileSync(new URL("../layouts/changelog.css", import.meta.url), "utf8");

test("changelog.css uses only token custom properties from names.json", () => {
  const allowed = tokenNames();
  const used = [...changelogCss().matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  assert.deepEqual(
    [...new Set(used)].filter((name) => !allowed.has(name)),
    [],
  );
});

test("changelog.css uses logical properties only, so right-to-left pages work", () => {
  const css = changelogCss();
  assert.doesNotMatch(css, /\b(margin|padding|border|border-radius|inset)-(left|right|top|bottom)\b/);
  assert.doesNotMatch(css, /\b(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /:dir\(rtl\)/);
});

test("changelog.css styles the contents and gives its links a visible focus ring", () => {
  const css = changelogCss();
  assert.match(css, new RegExp(`\\.${TOC_CLASS}\\s*\\{`));
  assert.match(css, new RegExp(`\\.${TOC_LIST_CLASS} a:focus-visible\\s*\\{[^}]*outline:\\s*2px solid var\\(--state-focus-ring\\)`, "s"));
  assert.match(css, /\.changelog \.changelog-entry\s*\{[^}]*scroll-margin-block-start:\s*var\(--space-16\)/s);
});
