import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Heading, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import api, { examplesOf } from "../layouts/api.ts";

const persian = stringsOf("fa");

const pos: SourcePos = { file: "reference/charges.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const css = readFileSync(new URL("../layouts/api.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
const docCss = readFileSync(new URL("../layouts/doc.css", import.meta.url), "utf8");

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

function heading(depth: 1 | 2 | 3, text: string): Heading {
  return { depth, text, id: text.toLowerCase(), pos };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/reference/charges/",
    source: pos,
    frontMatter: { layout: "api" },
    title: "Charges",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Create and list charges.</p>",
    markdown: "Create and list charges.",
    kind: "doc",
    ...overrides,
  };
}

function layoutProps(page: Page, nav: Site["nav"]["main"] = [], trail: LayoutProps["trail"] = []): LayoutProps {
  const site: Site = { config: configWith(), pages: [page], nav: { main: nav }, data: {} };
  return {
    site,
    page,
    trail,
    pager: { prev: { title: "Overview", url: "/reference/" }, next: { title: "Refunds", url: "/reference/refunds/" } },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

const out = (page: Page, nav: Site["nav"]["main"] = [], trail: LayoutProps["trail"] = []): string =>
  renderToString(api(layoutProps(page, nav, trail)) as never);

test("the article carries data-pagefind-body and sits in the main landmark", () => {
  const page = out(pageWith());
  assert.match(page, /<main id="main" tabindex="-1"><div class="api-page"><article class="doc" data-pagefind-body="true">/);
  assert.match(page, /<div class="doc-body"><p>Create and list charges\.<\/p><\/div><\/article>/);
});

test("the layout renders the h1 from the page title when the body has no top-level heading", () => {
  const page = out(pageWith());
  assert.match(page, /<article class="doc"[^>]*><h1>Charges<\/h1>/);
});

test("the layout skips its h1 when a depth-1 heading exists, even with a front-matter title", () => {
  const page = out(
    pageWith({
      title: "From front matter",
      frontMatter: { layout: "api", title: "From front matter" },
      headings: [heading(1, "Charges"), heading(2, "Create a charge")],
    }),
  );
  assert.doesNotMatch(page, /<h1>/);
});

test("the examples panel lists each example under one heading, beside the article", () => {
  const page = out(
    pageWith({
      frontMatter: {
        layout: "api",
        examples: [
          { title: "Create a charge", lang: "bash", code: "curl -X POST /v1/charges" },
          { title: "List charges", lang: "json", code: '{"data": []}' },
        ],
      },
    }),
  );
  assert.match(page, /<aside class="api-examples" aria-labelledby="api-examples-title"><h2 class="api-examples-title" id="api-examples-title">Examples<\/h2>/);
  assert.match(page, /<li class="api-example"><h3 class="api-example-title">Create a charge<\/h3><p class="api-example-lang">bash<\/p><pre class="api-example-code"><code class="language-bash">curl -X POST \/v1\/charges<\/code><\/pre><\/li>/);
  assert.match(page, /<h3 class="api-example-title">List charges<\/h3><p class="api-example-lang">json<\/p>/);
  const article = page.indexOf('<article class="doc"');
  const aside = page.indexOf('<aside class="api-examples"');
  assert.ok(article >= 0 && aside > article, `article ${article} precedes the panel ${aside}`);
});

test("an example without a title is numbered, and one without a language has no language note", () => {
  const page = out(pageWith({ frontMatter: { layout: "api", examples: [{ code: "GET /v1/charges" }] } }));
  assert.match(page, /<h3 class="api-example-title">Example 1<\/h3>/);
  assert.doesNotMatch(page, /api-example-lang/);
  assert.match(page, /<code>GET \/v1\/charges<\/code>/);
});

test("a lone `example` string fills the panel when `examples` has nothing usable", () => {
  const page = out(pageWith({ frontMatter: { layout: "api", example: "GET /v1/charges" } }));
  assert.match(page, /<h3 class="api-example-title">Example 1<\/h3>/);
  assert.match(page, /<code>GET \/v1\/charges<\/code>/);

  const empty = out(pageWith({ frontMatter: { layout: "api", examples: [], example: "GET /v1/refunds" } }));
  assert.match(empty, /GET \/v1\/refunds/);
});

test("a page without examples renders no panel and no aside landmark for it", () => {
  const page = out(pageWith());
  assert.doesNotMatch(page, /api-examples/);
  assert.match(page, /<div class="api-page"><article class="doc"/);
});

test("examples that do not match the shape are dropped without throwing", () => {
  const page = out(
    pageWith({
      frontMatter: {
        layout: "api",
        examples: ["GET /v1/charges", { title: "No code" }, { code: 42 }, 7, null, { title: "Ping", code: "GET /ping" }],
      },
    }),
  );
  assert.match(page, /GET \/v1\/charges/);
  assert.match(page, /<h3 class="api-example-title">Ping<\/h3>/);
  assert.doesNotMatch(page, /No code/);
  assert.equal([...page.matchAll(/class="api-example"/g)].length, 2);

  const notAList = out(pageWith({ frontMatter: { layout: "api", examples: "GET /x" } }));
  assert.doesNotMatch(notAList, /api-examples/);
});

test("the sidebar, breadcrumb trail, and on-this-page aside keep their landmarks", () => {
  const nav = [{ title: "Reference", children: [{ title: "Charges", url: "/reference/charges/" }] }];
  const trail = [
    { title: "Reference", url: "/reference/" },
    { title: "Charges", url: "/reference/charges/" },
  ];
  const page = out(pageWith({ headings: [heading(2, "Create"), heading(2, "List")] }), nav, trail);
  assert.match(page, /<aside class="sidebar" id="site-navigation" aria-label="Site navigation"><nav class="sidebar-nav"/);
  assert.match(page, /<nav class="breadcrumb" aria-label="Breadcrumb"><a href="\/reference\/">Reference<\/a>/);
  assert.match(page, /<span aria-current="page">Charges<\/span><\/nav><h1>Charges<\/h1>/);
  assert.match(page, /<aside class="aside" aria-label="On this page"><aside class="toc" aria-label="On this page">/);
  assert.match(page, /<header><header class="header">/);
});

test("titles, example titles, and code are escaped into the markup", () => {
  const page = out(
    pageWith({
      title: "Charges <beta>",
      frontMatter: {
        layout: "api",
        examples: [{ title: "<b>Create</b>", code: '<img src=x onerror=alert(1)>' }],
      },
    }),
  );
  assert.match(page, /<h1>Charges &lt;beta><\/h1>/);
  assert.match(page, /<h3 class="api-example-title">&lt;b>Create&lt;\/b><\/h3>/);
  assert.match(page, /&lt;img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(page, /<img src=x/);
});

test("the panel labels and numbering come from the page's language", () => {
  const page = out(pageWith({ lang: "fa", frontMatter: { layout: "api", examples: [{ code: "GET /v1" }] } }));
  const title = (persian.api_example ?? "").replace("{n}", "1");
  assert.ok(page.includes(`<h2 class="api-examples-title" id="api-examples-title">${persian.api_examples}</h2>`));
  assert.ok(page.includes(`<h3 class="api-example-title">${title}</h3>`));
});

test("examplesOf reads front matter without touching the page", () => {
  assert.deepEqual(examplesOf({ example: "GET /x" }, "en"), [{ title: "Example 1", lang: "", code: "GET /x" }]);
  assert.deepEqual(examplesOf({ examples: [{ lang: "bash", code: "ls" }] }, "en"), [{ title: "Example 1", lang: "bash", code: "ls" }]);
  assert.deepEqual(examplesOf({}, "en"), []);
});

test("api.css stacks the columns by default and makes them two wide ones with a sticky panel", () => {
  const base = /\.api-page\s*\{([^}]*)\}/.exec(css);
  assert.ok(base, "api.css has the .api-page rule");
  assert.match(base[1] ?? "", /grid-template-columns:\s*minmax\(0,\s*1fr\);/);

  const wide = /@media \(min-width: 80rem\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(wide, "api.css has the wide-screen media query");
  assert.match(wide[1] ?? "", /grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--api-examples-w\);/);
  assert.match(wide[1] ?? "", /\.api-examples\s*\{[\s\S]*position:\s*sticky;[\s\S]*inset-block-start:/);

  assert.match(css, /\.layout:has\(> main > \.api-page\)\s*\{\s*grid-template-columns:\s*var\(--doc-side-w\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 767\.98px\) \{[\s\S]*\.layout:has\(> main > \.api-page\)/);
});

test("api.css uses logical properties only", () => {
  const physical = [
    /\b(margin|padding|border|scroll-margin|scroll-padding)-(left|right|top|bottom)\b/,
    /\bborder-(top|bottom)-(left|right)-radius\b/,
    /(^|[;{\s])(left|right|top|bottom)\s*:/,
    /\btext-align\s*:\s*(left|right)\b/,
    /\bfloat\s*:\s*(left|right)\b/,
    /\bclear\s*:\s*(left|right)\b/,
  ];
  const lines = css
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .split("\n")
    .filter((line) => !/^\s*@(media|container|supports)/.test(line))
    .filter((line) => physical.some((rule) => rule.test(line)))
    .map((line) => line.trim());
  assert.deepEqual(lines, []);
});

test("api.css reads only tokens that exist, or columns doc.css already defines", () => {
  const defined = new Set([
    ...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g),
    ...docCss.matchAll(/(--[a-z0-9-]+)\s*:/g),
    ...css.matchAll(/(--[a-z0-9-]+)\s*:/g),
  ].map((match) => match[1] ?? ""));
  const referenced = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1] ?? "");
  assert.ok(referenced.length > 0);
  for (const token of referenced) assert.ok(defined.has(token), `api.css reads ${token}, which no stylesheet defines`);
});
