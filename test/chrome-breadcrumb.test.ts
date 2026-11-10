import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavLink, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import breadcrumb from "../chrome/breadcrumb/index.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

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

const page: Page = {
  url: "/example/guide/install/",
  source: pos,
  frontMatter: { title: "Install" },
  title: "Install",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const pager: Pager = {};

const guides: NavLink = { title: "Guides", url: "/example/guide/" };
const gettingStarted: NavLink = { title: "Getting started", url: "/example/guide/getting-started/" };

function props(trail: Trail): ChromeProps {
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

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("renders nothing when the page has no trail", () => {
  assert.equal(breadcrumb(props([])), null);
});

test("renders nothing when the trail has only the current page", () => {
  assert.equal(breadcrumb(props([{ title: "Install", url: "/example/guide/install/" }])), null);
});

test("renders the trail: ancestors as links, the last item as the current page, not a link", () => {
  const out = html(breadcrumb(props([guides, gettingStarted, { title: "Install", url: "/example/guide/install/" }])));

  assert.match(out, /^<nav class="breadcrumb" aria-label="Breadcrumb">/);
  assert.match(out, /<a href="\/example\/guide\/">Guides<\/a>/);
  assert.match(out, /<a href="\/example\/guide\/getting-started\/">Getting started<\/a>/);
  assert.match(out, /<span aria-current="page">Install<\/span>/);
  assert.doesNotMatch(out, /<a [^>]*>Install<\/a>/);
  assert.ok(out.indexOf("Guides") < out.indexOf("Getting started"));
  assert.ok(out.indexOf("Getting started") < out.indexOf("Install"));
});

test("separators sit between the crumbs, are decorative, and mirror under dir=rtl in style.css", () => {
  const out = html(breadcrumb(props([guides, gettingStarted, { title: "Install", url: "/example/guide/install/" }])));
  assert.equal(out.match(/<svg class="breadcrumb-sep" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/g)?.length, 2);
  assert.ok(out.indexOf("breadcrumb-sep") > out.indexOf("Guides"));
  assert.ok(out.indexOf("breadcrumb-sep") < out.indexOf("Install"));

  const css = readFileSync(new URL("../chrome/breadcrumb/style.css", import.meta.url), "utf8");
  assert.match(css, /\[dir="rtl"\] \.breadcrumb-sep \{\n {2}transform: scaleX\(-1\);\n\}/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/breadcrumb/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
