import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import details, { BODY_CLASS, DEFAULT_SUMMARY, DETAILS_CLASS, SUMMARY_CLASS, type DetailsProps } from "../components/details/index.ts";

const pos: SourcePos = { file: "docs/guide/setup.md", line: 4, column: 1, endLine: 9, endColumn: 1 };

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
  url: "/example/guide/setup/",
  source: pos,
  frontMatter: { title: "Setup" },
  title: "Setup",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const site: Site = { config, pages: [page], nav: {}, data: {} };

function render(props: DetailsProps, body = "<p>Body text.</p>"): string {
  return html(details({ props, page, site, html: body }));
}

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions. Escapes text; `dangerouslySetInnerHTML` is raw. */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeAttr(String(value))}"`))
    .join("");
  const inner = dangerouslySetInnerHTML ? (dangerouslySetInnerHTML as { __html: string }).__html : html(children);
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

test("default export is the details component", () => {
  assert.equal(typeof details, "function");
});

test("renders a closed details element whose first child is the summary", () => {
  const out = render({ summary: "Install steps" });
  assert.match(
    out,
    new RegExp(`^<details class="${DETAILS_CLASS}"><summary class="${SUMMARY_CLASS}">Install steps</summary><div class="${BODY_CLASS}">`),
  );
  assert.doesNotMatch(out, /<details[^>]* open/);
});

test("keeps the rendered Markdown body as raw HTML inside the body region", () => {
  const out = render({ summary: "Notes" }, "<p>See <a href=\"#setup\">setup</a>.</p>");
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}"><p>See <a href="#setup">setup</a>\\.</p></div>`));
});

test("the open prop, valueless as in :::details{open}, starts the block expanded", () => {
  const out = render({ summary: "Open by default", open: "" });
  assert.match(out, new RegExp(`^<details class="${DETAILS_CLASS}" open>`));
});

test("a missing or blank summary falls back to the default label", () => {
  assert.match(render({}), new RegExp(`<summary class="${SUMMARY_CLASS}">${DEFAULT_SUMMARY}</summary>`));
  assert.match(render({ summary: "   " }), new RegExp(`<summary class="${SUMMARY_CLASS}">${DEFAULT_SUMMARY}</summary>`));
});

test("escapes the summary text", () => {
  const out = render({ summary: "<script>alert(1)</script>" });
  assert.doesNotMatch(out, /<script\b[^>]*>/i);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("style.css uses only token custom properties from names.json", () => {
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const allowed = new Set<string>();
  for (const [group, entries] of Object.entries(names)) {
    for (const key of Object.keys(entries)) allowed.add(`--${group}-${key}`);
  }

  const css = readFileSync(new URL("../components/details/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !allowed.has(name));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only, so right-to-left pages work", () => {
  const css = readFileSync(new URL("../components/details/style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\b(margin|padding|border|border-radius)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right)\s*:/);
  assert.match(css, /:dir\(rtl\)/);
});

test("style.css keeps a visible focus ring and the native disclosure", () => {
  const css = readFileSync(new URL("../components/details/style.css", import.meta.url), "utf8");
  assert.match(css, /\.details-summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.doesNotMatch(css, /\.details-body\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\bhidden\b/);
});
