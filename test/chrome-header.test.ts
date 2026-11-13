import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, LanguageConfig, NavItem, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import { stringsOf } from "../i18n/index.ts";
import header from "../chrome/header/index.ts";

const pos: SourcePos = { file: "index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
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
    ...overrides,
  };
}

const page: Page = {
  url: "/example/",
  source: pos,
  frontMatter: { title: "Home" },
  title: "Home",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const trail: Trail = [];
const pager: Pager = {};

function props(config: SiteConfig, current: Page = page): ChromeProps {
  const site: Site = { config, pages: [current], nav: {}, data: {} };
  return { site, page: current, trail, pager };
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

const render = (config: SiteConfig, current: Page = page) => html(header(props(config, current)));

/** The current page in another language and direction, at the URL that language would use. */
function pageIn(lang: string, dir: "ltr" | "rtl" = "ltr"): Page {
  return { ...page, url: lang === "en" ? page.url : `${page.url}${lang}/`, lang, dir };
}

/** The shipped catalogs, as the tests' source of truth for the two control names. */
const LABELS = { en: stringsOf("en"), fa: stringsOf("fa"), ar: stringsOf("ar") };

const EN_LANGUAGE: LanguageConfig = { code: "en", name: "English", prefix: "" };
const FA_LANGUAGE: LanguageConfig = { code: "fa", name: "فارسی", prefix: "/fa" };
const VERSIONS = [
  { version: "v1", url: "/example/v1/" },
  { version: "v2", url: "/example/v2/" },
];

test("shows the site title and links home under base", () => {
  const out = render(configWith());
  assert.match(out, /<a class="header-home" href="\/example\/">/);
  assert.match(out, /<span class="header-title">Example<\/span>/);
});

test("renders light and dark logos from theme options, prefixed with base, and marks the split", () => {
  const out = render(
    configWith({ theme: { options: { logo: { light: "/assets/logo.svg", dark: "/assets/logo-dark.svg" } } } }),
  );
  assert.match(out, /class="header-home header-home--split"/);
  assert.match(out, /<img class="header-logo header-logo-light" src="\/example\/assets\/logo\.svg"/);
  assert.match(out, /<img class="header-logo header-logo-dark" src="\/example\/assets\/logo-dark\.svg"/);
});

test("renders one logo without the split class when only a light logo is set", () => {
  const out = render(configWith({ theme: { options: { logo: { light: "https://cdn.example/logo.svg" } } } }));
  assert.doesNotMatch(out, /header-home--split/);
  assert.match(out, /src="https:\/\/cdn\.example\/logo\.svg"/);
  assert.doesNotMatch(out, /header-logo-dark/);
});

test("renders no logo image without theme logo options", () => {
  assert.doesNotMatch(render(configWith()), /<img/);
});

test("repository link appears only when the site sets a repository", () => {
  const withRepo = render(
    configWith({ repository: { url: "https://github.com/example/site" } }),
  );
  assert.match(withRepo, /<a class="header-repo" href="https:\/\/github\.com\/example\/site" rel="noopener" aria-label="GitHub repository"><svg class="header-repo-mark"/);
  const elsewhere = render(configWith({ repository: { url: "https://git.example.org/example/site" } }));
  assert.match(elsewhere, /<a class="header-repo" href="https:\/\/git\.example\.org\/example\/site" rel="noopener" aria-label="Repository">/);
  assert.doesNotMatch(elsewhere, /header-repo-mark/);
  assert.doesNotMatch(render(configWith()), /header-repo/);
});

test("search and menu buttons start hidden for JavaScript to enable; the section tabs slot is present", () => {
  const out = render(configWith());
  assert.match(out, /<button type="button" class="header-search" aria-label="Search" hidden data-search-open>/);
  assert.ok(
    out.includes(`<button type="button" class="header-menu" aria-label="${LABELS.en.main_nav}" aria-expanded="false" hidden data-drawer-open>`),
  );
  assert.match(out, /<div class="header-tabs" data-slot="section-tabs">/);
});

test("search and drawer control names follow the page language, not the site default", () => {
  const english = render(configWith({ lang: "en" }), pageIn("en"));
  assert.ok(
    english.includes(`class="header-search" aria-label="${LABELS.en.search}" hidden data-search-open`),
    "English search name",
  );
  assert.ok(
    english.includes(`class="header-menu" aria-label="${LABELS.en.main_nav}" aria-expanded="false" hidden data-drawer-open`),
    "English drawer name",
  );

  for (const [tag, dir, messages] of [
    ["fa", "rtl", LABELS.fa],
    ["ar", "rtl", LABELS.ar],
  ] as const) {
    const out = render(configWith({ lang: "en" }), pageIn(tag, dir));
    assert.ok(
      out.includes(`class="header-search" aria-label="${messages.search}" hidden data-search-open`),
      `${tag} search name`,
    );
    assert.ok(
      out.includes(`class="header-menu" aria-label="${messages.main_nav}" aria-expanded="false" hidden data-drawer-open`),
      `${tag} drawer name`,
    );
    // The icons stay decorative and the controls stay hidden with their island hooks.
    assert.ok(out.includes('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'), `${tag} search icon`);
    assert.ok(out.includes('<span aria-hidden="true">☰</span>'), `${tag} drawer icon`);
  }
});

test("regional and underscored page tags read their primary catalog's control names", () => {
  for (const [tag, dir, messages] of [
    ["fa-IR", "rtl", LABELS.fa],
    ["AR-eg", "rtl", LABELS.ar],
    ["en-GB", "ltr", LABELS.en],
    ["fa_IR", "rtl", LABELS.fa],
  ] as const) {
    const out = render(configWith({ lang: "ar", dir: "rtl" }), pageIn(tag, dir));
    assert.ok(
      out.includes(`class="header-search" aria-label="${messages.search}" hidden data-search-open`),
      `${tag} search name`,
    );
    assert.ok(
      out.includes(`class="header-menu" aria-label="${messages.main_nav}" aria-expanded="false" hidden data-drawer-open`),
      `${tag} drawer name`,
    );
  }
});

test("a page language with no catalog falls back to English control names", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const out = render(configWith({ lang: "fa", dir: "rtl" }), pageIn("ja-JP"));
    assert.ok(out.includes(`class="header-search" aria-label="${LABELS.en.search}" hidden data-search-open`));
    assert.ok(
      out.includes(`class="header-menu" aria-label="${LABELS.en.main_nav}" aria-expanded="false" hidden data-drawer-open`),
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("logo, title, repository, version, language, and theme actions keep their markup and destinations across page languages", () => {
  const shared = configWith({
    repository: { url: "https://github.com/example/site" },
    languages: [EN_LANGUAGE, FA_LANGUAGE],
  });
  const enPage: Page = { ...page, frontMatter: { title: "Home", versions: VERSIONS } };
  const faPage: Page = { ...page, lang: "fa", dir: "rtl", frontMatter: { title: "Home", versions: VERSIONS } };
  const en = render(shared, enPage);
  const fa = render(shared, faPage);

  const anchor = (out: string, className: string) =>
    out.match(new RegExp(`<a class="${className}"[^>]*>[\\s\\S]*?</a>`))?.[0];
  assert.ok(anchor(en, "header-home"), "home link is rendered");
  assert.equal(anchor(fa, "header-home"), anchor(en, "header-home"));
  assert.ok(anchor(en, "header-repo"), "repository link is rendered");
  assert.equal(anchor(fa, "header-repo"), anchor(en, "header-repo"));

  const linksIn = (out: string, className: string) =>
    [...out.matchAll(new RegExp(`class="${className}[^"]*" href="([^"]*)"`, "g"))].map((match) => match[1] ?? "");
  assert.deepEqual(linksIn(fa, "version-switcher-link"), linksIn(en, "version-switcher-link"));
  assert.deepEqual(linksIn(fa, "language-switcher-link"), linksIn(en, "language-switcher-link"));

  for (const marker of [
    'class="header-tabs" data-slot="section-tabs"',
    'class="version-switcher"',
    'class="language-switcher"',
    'class="theme-toggle"',
    "data-theme-toggle",
  ]) {
    assert.ok(en.includes(marker), `English header keeps ${marker}`);
    assert.ok(fa.includes(marker), `Persian header keeps ${marker}`);
  }
});

test("the header places the section tabs from the main navigation", () => {
  const tabbed: NavItem & { readonly tab: true } = { title: "Guides", url: "/example/guides/", tab: true };
  const site: Site = { config: configWith(), pages: [page], nav: { main: [tabbed] }, data: {} };
  const out = html(header({ site, page, trail, pager }));
  assert.match(
    out,
    /<div class="header-tabs" data-slot="section-tabs"><nav class="section-tabs" aria-label="[^"]+">/,
  );
  assert.match(out, /<a class="section-tab" href="\/example\/guides\/">(?:<bdi>)?Guides(?:<\/bdi>)?<\/a>/);
  assert.match(out, /<\/nav><\/div>/);
});

test("the narrow header wraps its actions instead of scrolling the page at 320px", () => {
  const css = readFileSync(new URL("../chrome/header/style.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 40rem\)[\s\S]*?\.header-inner \{[^}]*flex-wrap: wrap/s);
  assert.match(css, /@media \(max-width: 40rem\)[\s\S]*?\.header-actions \{[^}]*flex-wrap: wrap[^}]*min-inline-size: 0/s);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  const css = readFileSync(new URL("../chrome/header/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
