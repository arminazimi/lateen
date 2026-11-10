import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import sidebar from "../chrome/sidebar/index.ts";

// The 550 generated rule pages of the docs-site fixture: one folder, one navigation group.
const rulesDir = new URL("../fixtures/docs-site/rules/", import.meta.url);

const pos: SourcePos = { file: "rules/index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const config: SiteConfig = {
  title: "Beacon",
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
};

function pageAt(url: string): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Page" },
    title: "Page",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(nav: NavTree, url: string): ChromeProps {
  const page = pageAt(url);
  const site: Site = { config, pages: [page], nav, data: {} };
  return { site, page, trail: [], pager: {} };
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
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

/** Every rule page in the fixture, as `{ id, title, url }`, in the order the folder lists them. */
function rulePages(): { id: string; title: string; url: string }[] {
  return readdirSync(rulesDir)
    .filter((name) => /^[a-z]+-\d{3}\.md$/.test(name))
    .sort()
    .map((name) => {
      const id = name.slice(0, -".md".length);
      const text = readFileSync(new URL(name, rulesDir), "utf8");
      const title = text.match(/^title: (.+)$/m)?.[1] ?? text.match(/^# (.+)$/m)?.[1];
      assert.ok(title, `${name} has a title`);
      return { id, title, url: `/rules/${id}/` };
    });
}

const rules = rulePages();

/**
 * The navigation the engine builds for the fixture: the same shape as `_data/navigation.yml`, with the
 * rules folder as one group holding its index and all of its pages.
 */
const tree: NavTree = {
  main: [
    { title: "Home", url: "/" },
    {
      title: "Guide",
      children: [
        { title: "Install", url: "/install/" },
        { title: "Quickstart", url: "/quickstart/" },
      ],
    },
    {
      title: "Rules",
      children: [{ title: "Rules", url: "/rules/" }, ...rules.map(({ title, url }) => ({ title, url }))],
    },
  ],
};

function linkCount(out: string): number {
  return out.match(/<a\b/g)?.length ?? 0;
}

test("the fixture has 550 rule pages", () => {
  assert.equal(rules.length, 550);
});

test("a rule page shows the rules section as one sidebar entry, not 551 links", () => {
  const out = html(sidebar(props(tree, "/rules/secrets-001/")));

  assert.ok(linkCount(out) < 50, `${linkCount(out)} links, expected fewer than 50`);
  assert.doesNotMatch(out, /href="\/rules\/[a-z]+-\d{3}\/"/);
  assert.match(out, /<a href="\/rules\/" aria-current="true">Rules<\/a>/);
});

test("the rules section marks itself active on every one of its pages", () => {
  for (const { url } of rules) {
    const out = html(sidebar(props(tree, url)));

    assert.ok(linkCount(out) < 50, `${url}: ${linkCount(out)} links, expected fewer than 50`);
    assert.match(out, /<a href="\/rules\/" aria-current="true">Rules<\/a>/, `${url} marks the section`);
  }
});

test("the rules index marks the section as the page itself", () => {
  const out = html(sidebar(props(tree, "/rules/")));

  assert.match(out, /<a href="\/rules\/" aria-current="page">Rules<\/a>/);
  assert.ok(linkCount(out) < 50);
});

test("outside the rules section it is one plain link", () => {
  const out = html(sidebar(props(tree, "/install/")));

  assert.ok(linkCount(out) < 50, `${linkCount(out)} links, expected fewer than 50`);
  assert.match(out, /<a href="\/rules\/">Rules<\/a>/);
  assert.doesNotMatch(out, /href="\/rules\/secrets-001\/"/);
  assert.match(out, /<a href="\/install\/" aria-current="page">Install<\/a>/);
});

test("the small groups around it still list every link", () => {
  const out = html(sidebar(props(tree, "/rules/secrets-001/")));

  assert.match(out, /<a href="\/install\/">Install<\/a>/);
  assert.match(out, /<a href="\/quickstart\/">Quickstart<\/a>/);
  assert.match(out, /<a href="\/">Home<\/a>/);
});
