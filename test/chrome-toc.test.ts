import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, Heading, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import toc from "../chrome/toc/index.ts";

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
const pager: Pager = {};

function pageWith(headings: Heading[]): Page {
  return {
    url: "/example/guide/install/",
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings,
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(headings: Heading[]): ChromeProps {
  const page = pageWith(headings);
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

function heading(depth: Heading["depth"], id: string, text: string): Heading {
  return { depth, id, text, pos };
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("hidden when the page has fewer than two h2/h3 headings", () => {
  assert.equal(toc(props([])), null);
  assert.equal(toc(props([heading(2, "one", "One")])), null);
  assert.equal(toc(props([heading(1, "title", "Title"), heading(2, "one", "One")])), null);
});

test("lists h2 and h3 from page.headings, nested on the aside and flat in the fold", () => {
  const out = html(
    toc(
      props([
        heading(1, "title", "Title"),
        heading(2, "pick", "Pick a mode"),
        heading(3, "gem", "Gem"),
        heading(2, "build", "Build"),
        heading(4, "deep", "Deep"),
      ]),
    ),
  );

  assert.match(out, /<aside class="toc" aria-label="On this page">/);
  assert.match(out, /<details class="toc-fold">/);
  assert.match(out, /<summary>On this page<\/summary>/);
  assert.doesNotMatch(out, /#title|#deep/);
  assert.match(
    out,
    /<aside[\s\S]*<ul><li><a href="#pick">Pick a mode<\/a><ul><li><a href="#gem">Gem<\/a><\/li><\/ul><\/li><li><a href="#build">Build<\/a><\/li><\/ul>/,
  );
  assert.match(
    out,
    /<details[\s\S]*<ul><li><a href="#pick">Pick a mode<\/a><\/li><li><a href="#gem">Gem<\/a><\/li><li><a href="#build">Build<\/a><\/li><\/ul>/,
  );
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/toc/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
