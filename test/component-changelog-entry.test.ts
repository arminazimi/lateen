import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import changelogEntry, {
  BODY_CLASS,
  CATEGORY_CLASS,
  CATEGORIES_CLASS,
  DATE_CLASS,
  EMPTY_CLASS,
  HEADING_CLASS,
  META_CLASS,
  SECTION_CLASS,
  VERSION_CLASS,
  categoriesOf,
  idOf,
  slugOf,
  type ChangelogEntryProps,
} from "../components/changelog-entry/index.ts";

const pos: SourcePos = { file: "docs/changelog.md", line: 1, column: 1, endLine: 9, endColumn: 1 };

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

function pageFor(lang = "en"): Page {
  return {
    url: "/example/changelog/",
    source: pos,
    frontMatter: { title: "Changelog" },
    title: "Changelog",
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

const site: Site = { config, pages: [pageFor()], nav: {}, data: {} };

function render(props: ChangelogEntryProps, body = "<p>Body text.</p>", lang = "en"): string {
  const page = pageFor(lang);
  return html(changelogEntry({ props, page, site, html: body }));
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

const entry = (props: ChangelogEntryProps, body = "<p>Body text.</p>") =>
  render({ version: "1.2.0", date: "2026-11-09", ...props }, body);

test("default export is the changelog entry component", () => {
  assert.equal(typeof changelogEntry, "function");
});

test("renders a section with a deterministic id and an h2 whose version links to itself", () => {
  const out = entry({});
  assert.match(out, new RegExp(`^<section class="${SECTION_CLASS}" id="v1-2-0" aria-labelledby="changelog-version-v1-2-0">`));
  assert.match(
    out,
    new RegExp(
      `<h2 class="${HEADING_CLASS}" aria-labelledby="changelog-version-v1-2-0"><span id="changelog-version-v1-2-0" class="${VERSION_CLASS}">1\\.2\\.0</span><a class="changelog-entry-anchor" href="#v1-2-0" aria-label="Link to release 1\\.2\\.0">`,
    ),
  );
});

test("the date is machine readable and shows the page's calendar", () => {
  const out = entry({});
  assert.match(out, new RegExp(`<time class="${DATE_CLASS}" datetime="2026-11-09">November 9, 2026</time>`));
});

test("a missing or invalid date falls back to clear text and never a time element", () => {
  for (const date of [undefined, "", "not a date", "2026-02-30", "11/09/2026"]) {
    const out = date === undefined ? render({ version: "1.2.0" }) : entry({ date });
    assert.doesNotMatch(out, /<time\b/, `date ${String(date)} should not render a time element`);
    assert.match(out, new RegExp(`<span class="${DATE_CLASS}">Date unknown</span>`), String(date));
  }
});

test("every category renders an icon and a text label, in author order and without repeats", () => {
  const out = entry({ categories: "security, added,fixed,added,unknown,changed,removed" });
  assert.match(out, new RegExp(`<ul class="${CATEGORIES_CLASS}" aria-label="Categories">`));
  const order = ["security", "added", "fixed", "changed", "removed"];
  let offset = 0;
  for (const category of order) {
    const index = out.indexOf(`<li class="${CATEGORY_CLASS} ${CATEGORY_CLASS}-${category}">`, offset);
    assert.ok(index >= offset, `${category} should follow the previous category`);
    offset = index + 1;
  }
  assert.equal(out.match(new RegExp(`<li class="${CATEGORY_CLASS} `, "g"))?.length, order.length);
  assert.match(
    out,
    new RegExp(
      `<li class="${CATEGORY_CLASS} ${CATEGORY_CLASS}-added"><svg[^>]*aria-hidden="true"[^>]*>.*<span class="changelog-entry-category-label">Added</span></li>`,
      "s",
    ),
  );
  assert.doesNotMatch(out, /category-unknown/);
});

test("categories may be a JSON array and are matched without case or spaces", () => {
  assert.deepEqual(categoriesOf('["added", " FIXED ", "unknown", 3]'), ["added", "fixed"]);
  assert.deepEqual(categoriesOf("Added, security"), ["added", "security"]);
  assert.deepEqual(categoriesOf(""), []);
  assert.deepEqual(categoriesOf(undefined), []);
});

test("categories are optional; no category list is rendered when there are none", () => {
  const out = entry({ categories: "unknown" });
  assert.doesNotMatch(out, new RegExp(CATEGORIES_CLASS));
});

test("missing version text becomes Unreleased, never a bare v", () => {
  const out = entry({ version: "   " });
  assert.match(out, /id="vunversioned"/);
  assert.match(out, />Unreleased<\/span>/);
  assert.doesNotMatch(out, /<h2[^>]*><span[^>]*>v<\/span>/);
  assert.doesNotMatch(out, /id="v"/);
});

test("escapes the version text and keeps the id to a safe slug", () => {
  const out = entry({ version: "<script>alert(1)</script>" });
  assert.doesNotMatch(out, /<script\b/i);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(out, /id="vscript-alert-1-script"/);
});

test("an empty body keeps the heading and shows a clear no-details paragraph", () => {
  const out = render({ version: "1.2.0", date: "2026-11-09", categories: "fixed" }, "");
  assert.match(out, new RegExp(`<section class="${SECTION_CLASS}" id="v1-2-0"`));
  assert.match(out, /<span[^>]*>1\.2\.0<\/span>/);
  assert.match(out, new RegExp(`<p class="${EMPTY_CLASS}">No details for this release\\.</p>`));
});

test("renders the body as raw HTML inside the body region", () => {
  const out = entry({}, "<p>See <a href=\"#setup\">setup</a>.</p>");
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}"><div><p>See <a href="#setup">setup</a>\\.</p></div></div>`));
});

test("the ids are deterministic: lower case, dots to dashes, a leading v stripped", () => {
  assert.equal(slugOf("1.2.0"), "1-2-0");
  assert.equal(idOf("1.2.0"), "v1-2-0");
  assert.equal(idOf("V1.2.0"), idOf("1.2.0"));
  assert.equal(idOf("v2.0.0-rc.1"), "v2-0-0-rc-1");
  assert.equal(idOf("1 2/3"), "v1-2-3");
  assert.equal(idOf(""), "vunversioned");
  assert.equal(idOf(undefined), "vunversioned");
  assert.equal(idOf("1.2.0"), idOf("1.2.0"));
});

test("a Persian page shows the Jalali date and Persian category labels", () => {
  const out = render({ version: "1.2.0", date: "2026-11-09", categories: "added" }, "<p>متن.</p>", "fa");
  assert.match(out, /datetime="2026-11-09">۱۸ آبان ۱۴۰۵<\/time>/);
  assert.match(out, />افزوده‌شده<\/span>/);
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

  const css = readFileSync(new URL("../components/changelog-entry/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !allowed.has(name));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only, so right-to-left pages work", () => {
  const css = readFileSync(new URL("../components/changelog-entry/style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\b(margin|padding|border|border-radius)-(left|right|top|bottom)\b/);
  assert.doesNotMatch(css, /\b(left|right|top|bottom)\s*:/);
  assert.match(css, /:dir\(rtl\)/);
});

test("style.css pairs every category color with the label, never color alone", () => {
  const css = readFileSync(new URL("../components/changelog-entry/style.css", import.meta.url), "utf8");
  for (const category of ["added", "changed", "fixed", "removed", "security"]) {
    assert.match(css, new RegExp(`\\.changelog-entry-category-${category}\\s*\\{[^}]*color:\\s*var\\(--color-`), category);
  }
  assert.doesNotMatch(css, /\.changelog-entry-category-label\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.changelog-entry-anchor:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
});
