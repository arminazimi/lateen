import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import searchResults, { scriptValue, SEARCH_RESULTS_INPUT_ID } from "../layouts/search-results.ts";
import { patternOf, stringsOf, t } from "../i18n/index.ts";

const pos: SourcePos = { file: "search.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
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
    ...overrides,
  };
}

function layoutProps(config: Partial<SiteConfig> = {}, pageOverrides: Partial<Page> = {}): LayoutProps {
  const page: Page = {
    url: "/search/",
    source: pos,
    frontMatter: {},
    title: "Search results",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
    ...pageOverrides,
  };
  const site: Site = { config: configWith(config), pages: [page], nav: { main: [] }, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: "Search results · Example", meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

type VNode = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

const VOID = new Set(["meta", "link", "input"]);

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : html(children)}</${tag}>`;
}

const out = (config: Partial<SiteConfig> = {}, page: Partial<Page> = {}): string => html(searchResults(layoutProps(config, page)));

/** The text of the one inline module script the layout writes. */
function scriptOf(page: string): string {
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(page);
  assert.ok(match, "the layout writes an inline module script");
  return match[1] ?? "";
}

/** The language and messages the script serializes, parsed back as real JSON. */
function serializedMessages(page: string): Record<string, unknown> {
  const match = /\nconst messages = ([^\n]*);\n/.exec(scriptOf(page));
  assert.ok(match, "the script serializes its messages on one line");
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

/** The count path the script carries, extracted and run against the runtime's real Intl data. */
interface CountPath {
  pluralCategory(count: number): string;
  visibleNumber(count: number): string;
  countMessage(count: number): string;
}

function countPathOf(page: string): CountPath {
  const script = scriptOf(page);
  const setup = /const lang = [^\n]*\nconst messages = [\s\S]*?\n(?=const input)/.exec(script);
  assert.ok(setup, "the script declares the page language and its messages before the count path");
  const block = /\/\* count-path:start[\s\S]*?count-path:end \*\//.exec(script);
  assert.ok(block, "the script keeps the count path in one self-contained block");
  return new Function(`${setup[0]}\n${block[0]}\nreturn { pluralCategory, visibleNumber, countMessage };`)() as CountPath;
}

/** Serializing a page whose language has no catalog warns once; tests keep the output clean. */
function quietOut(config: Partial<SiteConfig> = {}, page: Partial<Page> = {}): string {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    return out(config, page);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test("renders a labelled GET search form, a status region, and a results container", () => {
  const page = out();

  assert.match(page, /<form class="search-results-form" role="search" action="\/search\/" method="get" data-search-form="">/);
  assert.match(page, new RegExp(`<label class="search-results-label" for="${SEARCH_RESULTS_INPUT_ID}">Search<\\/label>`));
  assert.match(
    page,
    new RegExp(`<input class="search-results-input" id="${SEARCH_RESULTS_INPUT_ID}" type="search" name="q" autocomplete="off" data-search-input="">`),
  );
  assert.match(page, /<button class="search-results-submit" type="submit">Search<\/button>/);
  assert.match(page, /<p class="search-results-status" role="status" data-search-status=""><\/p>/);
  assert.match(page, /<ol class="search-results-list" data-search-results=""><\/ol>/);
});

test("the form submits to this page, base included, as a plain GET request", () => {
  const page = out({ base: "/docs" }, { url: "/docs/search/" });

  assert.match(page, /action="\/docs\/search\/"/);
  assert.match(page, /method="get"/);
  assert.match(page, /<h1 class="search-results-title-page">Search results<\/h1>/);
});

test("the inline module reads the query from location.search and handles an empty one", () => {
  const script = scriptOf(out());

  assert.match(script, /new URLSearchParams\(location\.search\)\.get\("q"\)/);
  assert.match(script, /if \(input\) input\.value = query;/);
  assert.match(script, /query\.trim\(\) !== ""/);
});

test("the module loads the Pagefind index from the site base, at the root and under a subfolder", () => {
  const atRoot = scriptOf(out());
  assert.match(atRoot, /const base = "";/);
  assert.match(atRoot, /import\(base\.replace\(\/\\\/\$\/, ""\) \+ "\/pagefind\/pagefind\.js"\)/);

  const under = scriptOf(out({ base: "/docs" }, { url: "/docs/search/" }));
  assert.match(under, /const base = "\/docs";/);
});

test("the module prints the count and renders links with Pagefind excerpts", () => {
  const script = scriptOf(out());

  assert.match(script, /status\.textContent = messages\.loading;/);
  assert.match(script, /messages\.empty\.replace\("\{query\}"/);
  assert.match(script, /status\.textContent = messages\.failed;/);
  assert.match(script, /records\.length === 1\n\s+\? messages\.one\n\s+: countMessage\(records\.length\);/);
  assert.match(script, /link\.setAttribute\("href", href\)/);
  assert.match(script, /record\.excerpt/);
  assert.match(script, /document\.createElement\("mark"\)/);
  assert.match(script, /copyExcerpt\(template\.content, excerpt\)/);
});

test("result links are ordinary anchors, so the keyboard reaches them", () => {
  const script = scriptOf(out());

  assert.match(script, /document\.createElement\(href === undefined \? "span" : "a"\)/);
  assert.doesNotMatch(script, /tabIndex|tabindex/);
  assert.match(script, /safeHref\(record\.url\)/);
});

test("a visitor without JavaScript gets a note and the form still submits", () => {
  const page = out();

  assert.match(page, /<noscript><p class="search-results-nojs">JavaScript is needed to show results on this page\. Submit the form to carry your query in the address\.<\/p><\/noscript>/);
  assert.match(page, /<form class="search-results-form"/);
  assert.doesNotMatch(page, /<form[^>]* hidden/);
});

test("values written into the script are escaped so a base cannot close the tag", () => {
  const page = out({ base: '/docs<"x' });
  const script = scriptOf(page);

  assert.match(script, /const base = "\/docs\\u003c\\"x";/);
  assert.doesNotMatch(script, /<\/script/i);
  assert.equal(scriptValue("/docs<"), '"/docs\\u003c"');
});

test("every message comes from the i18n table", () => {
  const english = scriptOf(out());
  assert.match(english, /"empty":"No results for “\{query\}”\."/);
  assert.match(english, /"one":"1 result"/);
  assert.match(english, /"counts":\{"zero":/);

  const persian = scriptOf(out({ lang: "fa" }, { lang: "fa", dir: "rtl" }));
  assert.match(persian, /"one":"۱ نتیجه"/);
});

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

test("the script serializes all six search_count plural-category messages of every language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const messages = serializedMessages(out({ lang }, { lang }));
    const counts = messages.counts as Record<string, string>;
    assert.deepEqual(Object.keys(counts).sort(), [...PLURAL_CATEGORIES].sort());
    for (const category of PLURAL_CATEGORIES) {
      const key = `search_count_${category}`;
      assert.ok(key in stringsOf(lang), `the ${lang} catalog already ships ${key}`);
      assert.equal(counts[category], patternOf(lang, key), `${lang}.${key} is serialized intact`);
    }
    assert.equal(messages.empty, patternOf(lang, "search_results_empty"));
    assert.equal(messages.loading, t(lang, "search_results_loading"));
    assert.equal(messages.failed, t(lang, "search_results_failed"));
    assert.equal(messages.one, t(lang, "search_results_one"));
  }
});

test("Arabic selects zero/one/two/few/many/other at the CLDR boundaries", () => {
  const path = countPathOf(out({ lang: "ar" }, { lang: "ar", dir: "rtl" }));
  const categories = [0, 1, 2, 3, 10, 11, 99, 100, 101].map((count) => path.pluralCategory(count));
  assert.deepEqual(categories, ["zero", "one", "two", "few", "few", "many", "many", "other", "other"]);
});

test("Persian and English select their own plural categories", () => {
  const persian = countPathOf(out({ lang: "fa" }, { lang: "fa", dir: "rtl" }));
  assert.equal(persian.pluralCategory(1), "one");
  assert.equal(persian.pluralCategory(2), "other");
  assert.equal(persian.countMessage(2), "۲ نتیجه.");
  const english = countPathOf(out());
  assert.deepEqual([0, 1, 2].map((count) => english.pluralCategory(count)), ["other", "one", "other"]);
});

test("each count reads the category's own message with the locale's number", () => {
  const arabic = countPathOf(out({ lang: "ar" }, { lang: "ar", dir: "rtl" }));
  assert.equal(arabic.countMessage(2), `${new Intl.NumberFormat("ar").format(2)} نتيجتان.`);
  assert.equal(arabic.countMessage(3), `${new Intl.NumberFormat("ar").format(3)} نتائج.`);
  assert.equal(arabic.countMessage(11), `${new Intl.NumberFormat("ar").format(11)} نتيجة.`);

  const english = countPathOf(out());
  assert.equal(english.countMessage(1), "1 result.");
  assert.equal(english.countMessage(3), "3 results.");
  assert.equal(english.countMessage(0), "0 results.");
});

test("the visible number follows the locale's numbering system, including a regional tag", () => {
  const persian = countPathOf(out({ lang: "fa" }, { lang: "fa", dir: "rtl" }));
  assert.equal(persian.visibleNumber(5), "۵");
  assert.equal(persian.countMessage(5), "۵ نتیجه.");

  const regional = countPathOf(out({ lang: "fa-IR" }, { lang: "fa-IR", dir: "rtl" }));
  assert.equal(regional.countMessage(5), "۵ نتیجه.");
});

test("tags the Intl runtime cannot use fall back without throwing", () => {
  const malformed = countPathOf(out({ lang: "en_US" }, { lang: "en_US" }));
  assert.equal(malformed.pluralCategory(3), "other");
  assert.equal(malformed.visibleNumber(3), "3");
  assert.equal(malformed.countMessage(3), "3 results.");

  const unknown = countPathOf(quietOut({ lang: "xx" }, { lang: "xx" }));
  assert.equal(unknown.countMessage(3), "3 results.");
});

test("the count path stays safe inside the script and keeps the page markup intact", () => {
  const page = out({ base: '/docs<"x' });
  const script = scriptOf(page);

  assert.match(script, /const base = "\/docs\\u003c\\"x";/);
  assert.doesNotMatch(script, /<\/script/i);
  assert.match(script, /const lang = "en";/);
});

const css = readFileSync(new URL("../layouts/search-results.css", import.meta.url), "utf8");

/** A physical property: the ones the theme's logical-CSS rule rejects. */
const PHYSICAL = [
  /\b(margin|padding|border|scroll-margin|scroll-padding)-(left|right|top|bottom)\b/,
  /\bborder-(top|bottom)-(left|right)-radius\b/,
  /(^|[;{\s])(left|right|top|bottom)\s*:/,
  /\btext-align\s*:\s*(left|right)\b/,
  /\bfloat\s*:\s*(left|right)\b/,
  /\bclear\s*:\s*(left|right)\b/,
  /(?<![\w-])(min-|max-)?(width|height)\s*:/,
];

test("search-results.css uses logical properties only", () => {
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "").split("\n");
  const physical = declarations.flatMap((line, index) => (PHYSICAL.some((rule) => rule.test(line)) ? [`${index + 1}: ${line.trim()}`] : []));
  assert.deepEqual(physical, []);
});

test("search-results.css reads only tokens the theme defines", () => {
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)));
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);
});

test("the stylesheet keeps focus visible and highlights matches", () => {
  assert.match(css, /\.search-results-input:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--state-focus-ring\)/);
  assert.match(css, /\.search-results-submit:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--state-focus-ring\)/);
  assert.match(css, /\.search-results-link:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--state-focus-ring\)/);
  assert.match(css, /\.search-results-excerpt mark\s*\{[\s\S]*background-color: var\(--color-selection\)/);
});
