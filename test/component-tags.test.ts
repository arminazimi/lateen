import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import tags, {
  TAGS_CLASS,
  TAG_CLASS,
  directive,
  parseItems,
  tagOf,
  tagsFor,
  tagsOf,
  type Tag,
  type TagsProps,
} from "../components/tags/index.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 5, endColumn: 1 };

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

/** A page whose front matter holds the given tags. */
function pageWith(frontMatter: Record<string, unknown> = {}): Page {
  return {
    url: "/example/guide/install/",
    source: pos,
    frontMatter: { title: "Install", ...frontMatter },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

const site: Site = { config, pages: [pageWith()], nav: {}, data: {} };

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** Minimal Preact vnode to HTML string for assertions; text is escaped the way the render host escapes it. */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeAttr(String(value))}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

function render(props: TagsProps, frontMatter: Record<string, unknown> = {}): string {
  const page = pageWith(frontMatter);
  return html(tags({ props, page, site, html: "" } as ComponentProps<TagsProps>));
}

/** The labels of the rendered chips, in order. */
function labelsOf(out: string): string[] {
  return [...out.matchAll(/<li class="tag">(?:<span>|<a [^>]*>)([^<]*)</g)].map((match) => match[1]!);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/tags/style.css", import.meta.url), "utf8");

test("default export is the tags component, bound to the tags directive", () => {
  assert.equal(typeof tags, "function");
  assert.equal(directive, "tags");
});

test("a JSON array of strings renders one plain chip each, in order", () => {
  const out = render({ items: '["guide", "api", "release notes"]' });
  assert.match(out, new RegExp(`^<ul class="${TAGS_CLASS}" aria-label="Tags">`));
  assert.deepEqual(labelsOf(out), ["guide", "api", "release notes"]);
  assert.doesNotMatch(out, /<a /);
  assert.equal(out.match(new RegExp(`<li class="${TAG_CLASS}">`, "g"))?.length, 3);
});

test("an object with a safe URL renders a link, and one without a URL plain text", () => {
  const out = render({
    items: '[{"label":"Guides","url":"/guide/"},{"label":"API"},{"label":"Web","url":"https://example.com/api"}]',
  });
  assert.match(out, /<li class="tag"><a href="\/guide\/">Guides<\/a><\/li>/);
  assert.match(out, /<li class="tag"><span>API<\/span><\/li>/);
  assert.match(out, /<li class="tag"><a href="https:\/\/example\.com\/api">Web<\/a><\/li>/);
  assert.deepEqual(labelsOf(out), ["Guides", "API", "Web"]);
});

test("without items, the page's tags front matter is used, as a list or a comma string", () => {
  assert.deepEqual(labelsOf(render({}, { tags: ["release", "guide"] })), ["release", "guide"]);
  assert.deepEqual(labelsOf(render({}, { tags: "release, guide , docs" })), ["release", "guide", "docs"]);
  assert.deepEqual(
    labelsOf(render({ items: "not json" }, { tags: ["fallback"] })),
    ["fallback"],
    "an invalid items prop falls back",
  );
});

test("an items array wins over front matter, even when it is empty", () => {
  assert.equal(render({ items: "[]" }, { tags: ["ignored"] }), "");
});

test("an unsafe URL stays plain text", () => {
  const unsafe = [
    "javascript:alert(1)",
    "mailto:docs@example.com",
    "//evil.example/path",
    "/\\evil.example/path",
    "relative/path",
    "https://example.com/a b",
    'https://example.com/"onmouseover="alert(1)',
  ];
  for (const url of unsafe) {
    const out = render({ items: JSON.stringify([{ label: "Tag", url }]) });
    assert.match(out, /<li class="tag"><span>Tag<\/span><\/li>/, url);
    assert.doesNotMatch(out, /<a /, url);
  }
});

test("no tags at all renders nothing", () => {
  assert.equal(render({}), "");
  assert.equal(render({}, { tags: [] }), "");
  assert.equal(render({}, { tags: "  ,  " }), "");
  assert.equal(render({}, { tags: 42 }), "");
});

test("labels are escaped, so a tag can never inject markup", () => {
  const out = render({ items: JSON.stringify(['<b>bold</b>', "a & b"]) });
  assert.match(out, /<span>&lt;b&gt;bold&lt;\/b&gt;<\/span>/);
  assert.match(out, /<span>a &amp; b<\/span>/);
  assert.doesNotMatch(out, /<b>/);
});

test("order is preserved and duplicates are kept", () => {
  const out = render({ items: '["z","a","m","a"]' });
  assert.deepEqual(labelsOf(out), ["z", "a", "m", "a"]);
  assert.ok(out.indexOf(">z<") < out.indexOf(">a<"));
  assert.ok(out.indexOf(">a<") < out.indexOf(">m<"));
});

test("the helpers accept strings and objects, and reject blanks and non-arrays", () => {
  assert.deepEqual(tagOf("  guide "), { label: "guide" });
  assert.deepEqual(tagOf({ label: " API ", url: " /api/ " }), { label: "API", url: "/api/" });
  assert.equal(tagOf("  "), undefined);
  assert.equal(tagOf({ label: "  " }), undefined);
  assert.equal(tagOf(42), undefined);
  assert.equal(parseItems(undefined), undefined);
  assert.equal(parseItems("{\"a\":1}"), undefined);
  assert.deepEqual(parseItems('["a"]'), [{ label: "a" }]);
  assert.deepEqual(tagsOf(["a", "b"]), [{ label: "a" }, { label: "b" }]);
  assert.deepEqual(tagsOf("a,b"), [{ label: "a" }, { label: "b" }]);
  assert.deepEqual(tagsFor({ items: '["a"]' }, { tags: ["b"] }), [{ label: "a" }]);
  const expected: Tag[] = [{ label: "b" }];
  assert.deepEqual(tagsFor({}, { tags: ["b"] }), expected);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css wraps and uses logical properties only", () => {
  assert.match(css, /\.tags\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.tags\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});
