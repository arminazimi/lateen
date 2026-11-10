import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavLink, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import pager from "../chrome/pager/index.ts";

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

const trail: Trail = [];

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

const prev: NavLink = { title: "Overview", url: "/example/guide/" };
const next: NavLink = { title: "Configure", url: "/example/guide/configure/" };

function props(links: Pager): ChromeProps {
  const site: Site = { config, pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager: links };
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

test("renders nothing when the page has neither a previous nor a next page", () => {
  assert.equal(pager(props({})), null);
});

test("links previous and next with rel=prev and rel=next, previous first", () => {
  const out = html(pager(props({ prev, next })));

  assert.match(out, /^<nav class="pager" aria-label="Previous and next pages">/);
  assert.match(out, /<a class="pager-link pager-prev" href="\/example\/guide\/" rel="prev">/);
  assert.match(out, /<a class="pager-link pager-next" href="\/example\/guide\/configure\/" rel="next">/);
  assert.match(out, /<span class="pager-title">Overview<\/span>/);
  assert.match(out, /<span class="pager-title">Configure<\/span>/);
  assert.ok(out.indexOf("pager-prev") < out.indexOf("pager-next"));
});

test("shows only the card that exists, in the next column", () => {
  const onlyPrev = html(pager(props({ prev })));
  assert.match(onlyPrev, /rel="prev"/);
  assert.doesNotMatch(onlyPrev, /rel="next"/);
  assert.doesNotMatch(onlyPrev, /pager-next/);

  const onlyNext = html(pager(props({ next })));
  assert.match(onlyNext, /<a class="pager-link pager-next" href="\/example\/guide\/configure\/" rel="next">/);
  assert.doesNotMatch(onlyNext, /rel="prev"/);
});

test("arrows are decorative and mirror under dir=rtl in style.css", () => {
  const out = html(pager(props({ prev, next })));
  assert.equal(out.match(/<svg class="pager-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/g)?.length, 2);

  const css = readFileSync(new URL("../chrome/pager/style.css", import.meta.url), "utf8");
  assert.match(css, /\[dir="rtl"\] \.pager-arrow \{\n {2}transform: scaleX\(-1\);\n\}/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/pager/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
