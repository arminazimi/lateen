import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import siteFooter from "../chrome/site-footer/index.ts";

const pos: SourcePos = { file: "index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(options: Readonly<Record<string, unknown>>): SiteConfig {
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
    theme: { options },
    search: { text: 300 },
    redirects: {},
    outputs: {},
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

function props(options: Readonly<Record<string, unknown>>): ChromeProps {
  const site: Site = { config: configWith(options), pages: [page], nav: {}, data: {} };
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

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("renders nothing when the config sets no footer, or sets only empty values", () => {
  assert.equal(siteFooter(props({})), null);
  assert.equal(siteFooter(props({ footer: {} })), null);
  assert.equal(siteFooter(props({ footer: { copyright: "   ", license: "", links: [] } })), null);
  assert.equal(siteFooter(props({ footer: "not an object" })), null);
});

test("shows the copyright and the license only when the config sets them", () => {
  const out = html(siteFooter(props({ footer: { copyright: "© 2026 Armin Azimi", license: "MIT" } })));

  assert.match(out, /^<div class="site-footer"><div class="site-footer-inner">/);
  assert.match(out, /<p class="site-footer-copyright">© 2026 Armin Azimi<\/p>/);
  assert.match(out, /<p class="site-footer-license">MIT<\/p>/);
  assert.doesNotMatch(out, /site-footer-links/);

  const onlyCopyright = html(siteFooter(props({ footer: { copyright: "© 2026 Armin Azimi" } })));
  assert.match(onlyCopyright, /site-footer-copyright/);
  assert.doesNotMatch(onlyCopyright, /site-footer-license/);
});

test("links from the config keep their order, get the site base for root-relative paths, and open absolute URLs safely", () => {
  const out = html(
    siteFooter(
      props({
        footer: {
          links: [
            { title: "Changelog", url: "/changelog/" },
            { title: "Source", url: "https://github.com/arminazimi/slipway" },
            { title: "Write", url: "mailto:hello@example.com" },
          ],
        },
      }),
    ),
  );

  assert.match(out, /<nav class="site-footer-links" aria-label="Footer links"><ul>/);
  assert.ok(out.indexOf("Changelog") < out.indexOf("Source"));
  assert.ok(out.indexOf("Source") < out.indexOf("Write"));
  assert.match(out, /<a href="\/example\/changelog\/">Changelog<\/a>/);
  assert.match(out, /<a href="https:\/\/github\.com\/arminazimi\/slipway" rel="noopener">Source<\/a>/);
  assert.match(out, /<a href="mailto:hello@example\.com">Write<\/a>/);
});

test("drops links with no title, no URL, or an unsafe URL", () => {
  const out = html(
    siteFooter(
      props({
        footer: {
          links: [
            { title: "Script", url: "javascript:alert(1)" },
            { title: "Protocol-relative", url: "//evil.example/" },
            { title: "Relative", url: "guide/" },
            { title: "", url: "/no-title/" },
            { url: "/missing-title/" },
            { title: "No URL" },
            "not a link",
            { title: "Kept", url: "/kept/" },
          ],
        },
      }),
    ),
  );

  assert.equal(out.match(/<li>/g)?.length, 1);
  assert.match(out, /<a href="\/example\/kept\/">Kept<\/a>/);
  assert.doesNotMatch(out, /javascript:|evil\.example|guide\/|no-title|missing-title|No URL/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/site-footer/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css uses logical properties, so the footer mirrors under dir=rtl", () => {
  const css = readFileSync(new URL("../chrome/site-footer/style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\b(?:margin|padding|border)-(?:left|right)\b/);
  assert.doesNotMatch(css, /\b(?:left|right):/);
});
