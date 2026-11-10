import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavItem, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
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

function props(config: SiteConfig): ChromeProps {
  const site: Site = { config, pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager };
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

const render = (config: SiteConfig) => html(header(props(config)));

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
  assert.match(out, /<button type="button" class="header-menu" aria-label="Menu" aria-expanded="false" hidden data-drawer-open>/);
  assert.match(out, /<div class="header-tabs" data-slot="section-tabs">/);
});

test("the header places the section tabs from the main navigation", () => {
  const tabbed: NavItem & { readonly tab: true } = { title: "Guides", url: "/example/guides/", tab: true };
  const site: Site = { config: configWith(), pages: [page], nav: { main: [tabbed] }, data: {} };
  const out = html(header({ site, page, trail, pager }));
  assert.match(
    out,
    /<div class="header-tabs" data-slot="section-tabs"><nav class="section-tabs" aria-label="Sections"><a class="section-tab" href="\/example\/guides\/">Guides<\/a><\/nav><\/div>/,
  );
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
