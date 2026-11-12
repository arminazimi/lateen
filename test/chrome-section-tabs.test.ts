import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavItem, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import sectionTabs from "../chrome/section-tabs/index.ts";
import { languages, stringsOf } from "../i18n/index.ts";

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

/** True for the right-to-left page languages the theme ships catalogs for, including regional codes. */
function isRtl(lang: string): boolean {
  return /^(fa|ar)([-_]|$)/.test(lang);
}

function pageAt(url: string, lang = "en"): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang,
    dir: isRtl(lang) ? "rtl" : "ltr",
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

function propsWith(
  url: string,
  trail: Trail,
  items: readonly NavItem[] | undefined,
  lang = "en",
  siteLang = "en",
): ChromeProps {
  const page = pageAt(url, lang);
  const site: Site = {
    config: { ...config, lang: siteLang },
    pages: [page],
    nav: items === undefined ? {} : { main: items },
    data: {},
  };
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

/** Count the non-overlapping matches of `pattern` in `text`. */
function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

const render = (
  url: string,
  trail: Trail,
  items: readonly NavItem[] = nav,
  lang = "en",
  siteLang = "en",
) => html(sectionTabs(propsWith(url, trail, items, lang, siteLang)));

test("renders only top-level items marked tab: true, in order, linking groups to their first leaf", () => {
  const out = render("/example/install/", [{ title: "Guide", url: "/example/install/" }]);
  assert.match(out, /<nav class="section-tabs" aria-label="Sections">/);
  assert.match(
    out,
    /<a class="section-tab" href="\/example\/"><bdi>Home<\/bdi><\/a><a class="section-tab" href="\/example\/install\/" aria-current="page"><bdi>Guide<\/bdi><\/a><a class="section-tab" href="\/example\/reference\/"><bdi>Reference<\/bdi><\/a>/,
  );
  assert.doesNotMatch(out, /Operations|Features/);
});

test("the tab whose title roots the trail is current, like the active section of the navigation tree", () => {
  const out = render("/example/reference/api/", [{ title: "Reference", url: "/example/reference/" }]);
  assert.match(out, /<a class="section-tab" href="\/example\/reference\/" aria-current="page"><bdi>Reference<\/bdi><\/a>/);
  assert.doesNotMatch(out, /href="\/example\/" aria-current/);
  assert.match(out, /<a class="section-tab" href="\/example\/"><bdi>Home<\/bdi><\/a>/);
});

test("a group tab is current while a page under it is active", () => {
  const out = render("/example/quickstart/", [{ title: "Guide", url: "/example/quickstart/" }]);
  assert.match(out, /href="\/example\/install\/" aria-current="page"><bdi>Guide<\/bdi><\/a>/);
});

test("no tab is current when the trail is empty (the page is not in the navigation)", () => {
  const out = render("/example/unlisted/", []);
  assert.doesNotMatch(out, /aria-current/);
  assert.match(out, /<a class="section-tab" href="\/example\/"><bdi>Home<\/bdi><\/a>/);
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
  assert.match(out, /<a class="section-tab" href="\/example\/real\/" aria-current="page"><bdi>Real<\/bdi><\/a>/);
});

test("renders nothing when every tab-marked group only leads to empty groups", () => {
  const unusable: readonly NavSource[] = [
    { title: "Hollow", children: [{ title: "Deeper", children: [{ title: "Empty", children: [] }] }], tab: true },
  ];
  assert.equal(sectionTabs(propsWith("/example/", [], unusable)), null);
});

test("a nested group tab still links to its first leaf and keeps tab order", () => {
  const nested: readonly NavSource[] = [
    {
      title: "Outer",
      children: [
        { title: "Inner", children: [{ title: "Deep", url: "/example/deep/" }, { title: "Later", url: "/example/later/" }] },
        { title: "Sibling", url: "/example/sibling/" },
      ],
      tab: true,
    },
    { title: "Other", url: "/example/other/", tab: true },
  ];
  const out = render("/example/deep/", [{ title: "Outer", url: "/example/deep/" }], nested);
  assert.match(
    out,
    /<a class="section-tab" href="\/example\/deep\/" aria-current="page"><bdi>Outer<\/bdi><\/a><a class="section-tab" href="\/example\/other\/"><bdi>Other<\/bdi><\/a>/,
  );
  assert.doesNotMatch(out, /\/example\/sibling\/<\/a>/);
});

test("the landmark follows the page language, not the site default", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["en", "en"],
    ["fa", "fa"],
    ["ar", "ar"],
    ["fa-IR", "fa"],
    ["ar-EG", "ar"],
  ];
  for (const [lang, catalog] of cases) {
    const label = stringsOf(catalog as (typeof languages)[number]).not_found_sections;
    const out = render("/example/install/", [{ title: "Guide", url: "/example/install/" }], nav, lang, "fa");
    assert.ok(out.includes(`aria-label="${label}"`), `${lang} landmark`);
  }
});

test("mixed-direction and neutral-only titles are isolated without changing text, order, URLs or the current tab", () => {
  const mixed: readonly NavSource[] = [
    { title: "راهنما", url: "/example/fa/", tab: true },
    { title: "v1.2.3", url: "/example/versions/", tab: true },
    { title: "الأدلة", url: "/example/ar/", tab: true },
    { title: "Guide", url: "/example/guide/", tab: true },
  ];
  const out = render("/example/guide/", [{ title: "Guide", url: "/example/guide/" }], mixed, "fa");

  // One isolating <bdi> per authored title, including a neutral-only run like a version string.
  assert.equal(count(out, /<bdi>/g), mixed.length);
  for (const item of mixed) {
    assert.ok(out.includes(`<bdi>${item.title}</bdi>`), item.title);
    if ("url" in item) assert.ok(out.includes(`href="${item.url}"`), item.url);
  }

  // Authored order survives the mixed directions, and only the tab rooting the trail is current.
  assert.ok(out.indexOf("راهنما") < out.indexOf("v1.2.3"));
  assert.ok(out.indexOf("v1.2.3") < out.indexOf("الأدلة"));
  assert.ok(out.indexOf("الأدلة") < out.indexOf("Guide"));
  assert.equal(count(out, /aria-current="page"/g), 1);
  assert.match(out, /href="\/example\/guide\/" aria-current="page"><bdi>Guide<\/bdi><\/a>/);
});

test("every shipped catalog already names the landmark, so no catalog change is needed", () => {
  for (const lang of languages) {
    const label = stringsOf(lang).not_found_sections ?? "";
    assert.notEqual(label.trim(), "", `${lang}.not_found_sections is not empty`);
    const out = render("/example/install/", [{ title: "Guide", url: "/example/install/" }], nav, lang);
    assert.ok(out.includes(`aria-label="${label}"`), `${lang} landmark comes from the catalog`);
  }
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
