import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Heading, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import versions, { hrefOf, statusOf, versionHome, versionsOf } from "../layouts/versions.ts";

const pos: SourcePos = { file: "versions.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

type Options = {
  readonly url?: string;
  readonly source?: string;
  readonly title?: string;
  readonly html?: string;
  readonly lang?: string;
  readonly dir?: "ltr" | "rtl";
  readonly base?: string;
  readonly frontMatter?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly headings?: readonly Heading[];
};

function layoutProps(options: Options = {}): LayoutProps {
  const page: Page = {
    url: options.url ?? "/versions/",
    source: { ...pos, file: options.source ?? "versions.md" },
    frontMatter: { ...(options.frontMatter ?? {}) },
    title: options.title ?? "Versions",
    lang: options.lang ?? "en",
    dir: options.dir ?? "ltr",
    headings: options.headings ?? [],
    html: options.html ?? "",
    markdown: "",
    kind: "doc",
  };
  const site: Site = {
    config: configWith({
      base: options.base ?? "",
      lang: options.lang ?? "en",
      dir: options.dir ?? "ltr",
    }),
    pages: [page],
    nav: {},
    data: options.data ?? {},
  };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

const out = (options: Options = {}) => renderToString(versions(layoutProps(options)) as never);

/** `<li>` rows of the rendered list, in order. */
function rows(html: string): string[] {
  const list = /<ol class="versions-list">([\s\S]*?)<\/ol>/.exec(html);
  assert.ok(list, "the versions list is present");
  return [...(list[1] ?? "").matchAll(/<li class="versions-item[^"]*"[^>]*>[\s\S]*?<\/li>/g)].map((match) => match[0]);
}

test("the data file's pages list gives the current page's versions only", () => {
  const data = {
    versions: {
      pages: [
        { page: "/guide/install/", versions: [{ version: "v2", url: "/v2/guide/install/", status: "latest" }] },
        { page: "/guide/deploy/", versions: [{ version: "v1", url: "/v1/guide/deploy/" }] },
      ],
    },
  };
  const html = out({ url: "/guide/install/", source: "guide/install.md", data });
  assert.equal(rows(html).length, 1);
  assert.match(html, /data-version="v2"/);
  assert.doesNotMatch(html, /data-version="v1"/);
});

test("a page to versions map uses the URL, source path, or source path without .md as the key", () => {
  const list = [{ version: "v3", url: "/v3/guide/install/" }];
  for (const versions of [{ "/guide/install/": list }, { pages: { "/guide/install/": list } }]) {
    const html = out({ url: "/guide/install/", source: "guide/install.md", data: { versions } });
    assert.equal(rows(html).length, 1, JSON.stringify(versions));
    assert.match(html, /data-version="v3"/, JSON.stringify(versions));
  }
  for (const key of ["/guide/install/", "guide/install", "guide/install.md"]) {
    const html = out({ url: "/guide/install/", source: "guide/install.md", data: { versions: { [key]: list } } });
    assert.equal(rows(html).length, 1, key);
    assert.match(html, /data-version="v3"/, key);
  }
});

test("a bare version list in the data file is used as written", () => {
  const html = out({
    data: { versions: [{ version: "v1", url: "/v1/versions/" }, { version: "v2", url: "/v2/versions/" }] },
  });
  assert.deepEqual(
    rows(html).map((row) => /data-version="([^"]+)"/.exec(row)?.[1]),
    ["v1", "v2"],
  );
});

test("without data, the versions front matter key supplies the list", () => {
  const html = out({
    frontMatter: { versions: [{ version: "v2", url: "/v2/versions/", status: "latest" }] },
  });
  assert.match(html, /data-version="v2"/);
  assert.match(html, /Latest/);
});

test("a page entry without a page key is the default when no entry names this page", () => {
  const html = out({
    url: "/unlisted/",
    source: "unlisted.md",
    data: { versions: { pages: [{ versions: [{ version: "v9" }] }] } },
  });
  assert.match(html, /data-version="v9"/);
});

test("statuses show as text and an icon: Latest, Deprecated, and Dev", () => {
  const html = out({
    frontMatter: {
      versions: [
        { version: "v3", url: "/v3/versions/", status: "latest" },
        { version: "v2", url: "/v2/versions/", status: "old" },
        { version: "v4", url: "/v4/versions/", status: "dev" },
      ],
    },
  });
  assert.match(
    html,
    /<span class="versions-status versions-status-latest"><span class="versions-icon" aria-hidden="true">↑<\/span><span class="versions-status-label">Latest<\/span><\/span>/,
  );
  assert.match(
    html,
    /<span class="versions-status versions-status-deprecated"><span class="versions-icon" aria-hidden="true">!<\/span><span class="versions-status-label">Deprecated<\/span><\/span>/,
  );
  assert.match(
    html,
    /<span class="versions-status versions-status-dev"><span class="versions-icon" aria-hidden="true">~<\/span><span class="versions-status-label">Dev<\/span><\/span>/,
  );
  assert.match(html, /class="versions-item versions-item-latest"/);
  assert.match(html, /class="versions-item versions-item-deprecated"/);
});

test("an unknown status, and a row with none, show no status", () => {
  const html = out({
    frontMatter: { versions: [{ version: "v2", url: "/v2/", status: "beta" }, { version: "v1", url: "/v1/" }] },
  });
  assert.doesNotMatch(html, /versions-status/);
  assert.equal(rows(html).length, 2);
});

test("the status vocabulary accepts case and spaces, and reads old as deprecated", () => {
  assert.equal(statusOf(" Latest "), "latest");
  assert.equal(statusOf("DEPRECATED"), "deprecated");
  assert.equal(statusOf("old"), "deprecated");
  assert.equal(statusOf("dev"), "dev");
  assert.equal(statusOf("beta"), undefined);
  assert.equal(statusOf(undefined), undefined);
});

test("each row links to the same page in its version, under the site base", () => {
  const html = out({
    base: "/docs",
    url: "/docs/guide/install/",
    source: "guide/install.md",
    frontMatter: { versions: [{ version: "v1", url: "/v1/guide/install/" }] },
  });
  assert.match(html, /href="\/docs\/v1\/guide\/install\/"/);
  assert.equal(hrefOf("/docs", { version: "v1", url: "/v1/guide/install/" }), "/docs/v1/guide/install/");
});

test("a row without a safe same-page URL falls back to the version home", () => {
  const html = out({
    frontMatter: {
      versions: [
        { version: "v1" },
        { version: "v2", url: "javascript:alert(1)" },
        { version: "v3", url: "//evil.example/v3/" },
      ],
    },
  });
  assert.deepEqual(
    rows(html).map((row) => /href="([^"]+)"/.exec(row)?.[1]),
    ["/v1/", "/v2/", "/v3/"],
  );
  assert.equal(versionHome("/docs", "v4"), "/docs/v4/");
  assert.equal(versionHome("", "v4"), "/v4/");
});

test("an https same-page URL is kept as written", () => {
  const html = out({ frontMatter: { versions: [{ version: "v2", url: "https://example.com/v2/install/" }] } });
  assert.match(html, /href="https:\/\/example\.com\/v2\/install\/"/);
});

test("the version whose URL is the current page is marked, in text and with aria-current", () => {
  const html = out({
    base: "/docs",
    url: "/docs/v2/guide/install/",
    source: "guide/install.md",
    data: {
      versions: {
        "/v2/guide/install/": [
          { version: "v2", url: "/v2/guide/install/", status: "latest" },
          { version: "v1", url: "/v1/guide/install/" },
        ],
      },
    },
  });
  const [current, older] = rows(html);
  assert.ok(current !== undefined && older !== undefined);
  assert.match(current, /class="versions-item versions-item-latest versions-item-current"/);
  assert.match(current, /aria-current="page"/);
  assert.match(current, /<span class="versions-current">Current version<\/span>/);
  assert.doesNotMatch(older, /aria-current|versions-current/);
});

test("a trailing slash does not stop the current mark", () => {
  const html = out({
    url: "/guide/install",
    frontMatter: { versions: [{ version: "v2", url: "/guide/install/" }] },
  });
  assert.match(html, /aria-current="page"/);
});

test("no versions gives the empty state, not an empty list", () => {
  const html = out();
  assert.match(html, /<article class="versions" data-pagefind-body="true" data-empty="true">/);
  assert.match(html, /<p class="versions-empty">No versions are published yet\.<\/p>/);
  assert.doesNotMatch(html, /versions-list/);
});

test("the empty state is localised, and an empty front matter list counts as none", () => {
  const html = out({ lang: "fa", dir: "rtl", frontMatter: { versions: [] } });
  assert.match(html, /<p class="versions-empty">هنوز نسخه‌ای منتشر نشده است\.<\/p>/);
  assert.match(html, /<html lang="fa" dir="rtl"/);
});

test("the layout renders the page body after the list, and leaves the h1 to the body when it has one", () => {
  const withBody = out({
    html: "<p>Pick the release you use.</p>",
    frontMatter: { versions: [{ version: "v2", url: "/v2/" }] },
  });
  assert.ok(withBody.indexOf("</ol>") < withBody.indexOf("<p>Pick the release you use.</p>"));
  assert.match(withBody, /<h1 class="versions-title">Versions<\/h1>/);

  const headed = out({ headings: [{ depth: 1, text: "Versions", id: "versions", pos }] });
  assert.doesNotMatch(headed, /versions-title/);
});

test("version names and the page title stay text, never markup", () => {
  const html = out({
    title: "Versions <script>alert(1)</script>",
    frontMatter: { versions: [{ version: "v2 <b>beta</b>", url: "https://example.com/v2?a=1&b=2" }] },
  });
  assert.match(html, /<h1 class="versions-title">Versions &lt;script>alert\(1\)&lt;\/script><\/h1>/);
  assert.match(html, /<span class="versions-name">v2 &lt;b>beta&lt;\/b><\/span>/);
  assert.doesNotMatch(html, /<b>beta<\/b>/);
  assert.match(html, /href="https:\/\/example\.com\/v2\?a=1&amp;b=2"/);
});

test("the layout sits in the base shell with lang, dir, the skip link, and the main landmark", () => {
  const html = out({ frontMatter: { versions: [{ version: "v2" }] } });
  assert.match(html, /^<html lang="en" dir="ltr"/);
  assert.match(html, /<a class="skip-link" href="#main">Skip to content<\/a>/);
  assert.match(html, /<main id="main" tabindex="-1"><article class="versions" data-pagefind-body="true">/);
});

test("versionsOf prefers the data file and falls back to front matter", () => {
  const page = layoutProps({
    data: { versions: [{ version: "v2" }] },
    frontMatter: { versions: [{ version: "v1" }] },
  });
  assert.deepEqual(
    versionsOf(page.site, page.page).map((entry) => entry.version),
    ["v2"],
  );

  const front = layoutProps({ frontMatter: { versions: [{ version: "v1" }] } });
  assert.deepEqual(
    versionsOf(front.site, front.page).map((entry) => entry.version),
    ["v1"],
  );
});

/** Comments become spaces (newlines kept) so line numbers and offsets stay useful. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

/** One `property: value` declaration in a block body. */
function declarations(text: string): { property: string; value: string }[] {
  const found: { property: string; value: string }[] = [];
  for (const block of stripComments(text).matchAll(/\{([^{}]*)\}/g)) {
    for (const part of (block[1] ?? "").split(";")) {
      const match = /^\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([\s\S]+?)\s*$/.exec(part);
      if (match !== null) found.push({ property: match[1] ?? "", value: match[2] ?? "" });
    }
  }
  return found;
}

const css = readFileSync(new URL("../layouts/versions.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)\s*\(/i;
const RAW_LENGTH = /(?:^|[^\w-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|pt|pc|cm|mm|in|q|fr)\b/i;
const withoutTokens = (value: string): string => value.replace(/var\(\s*--[a-z0-9-]+\s*(?:,[^)]*)?\)/gi, " ");

/** The physical properties `tools/theme/logical-css.ts` rejects, kept in step with it. */
const PHYSICAL = [
  /\b(margin|padding|border|scroll-margin|scroll-padding)-(left|right|top|bottom)\b/,
  /\bborder-(top|bottom)-(left|right)-radius\b/,
  /(^|[;{\s])(left|right|top|bottom)\s*:/,
  /\btext-align\s*:\s*(left|right)\b/,
  /\bfloat\s*:\s*(left|right)\b/,
  /\bclear\s*:\s*(left|right)\b/,
  /(?<![\w-])(min-|max-)?(width|height)\s*:/,
];

test("versions.css uses logical properties only", () => {
  const lines = stripComments(css)
    .split("\n")
    .flatMap((line, index) => (PHYSICAL.some((rule) => rule.test(line)) ? [`${index + 1}: ${line.trim()}`] : []));
  assert.deepEqual(lines, []);
});

test("versions.css uses tokens for every colour and every length but a hairline", () => {
  const colored = declarations(css)
    .filter((declaration) => RAW_COLOR.test(declaration.value))
    .map((declaration) => `${declaration.property}: ${declaration.value}`);
  assert.deepEqual(colored, []);

  const raw = declarations(css)
    .filter((declaration) => RAW_LENGTH.test(withoutTokens(declaration.value.replace(/\b1px\b/g, " "))))
    .map((declaration) => `${declaration.property}: ${declaration.value}`);
  assert.deepEqual(raw, []);

  const defined = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? ""));
  const referenced = [...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1] ?? "");
  assert.ok(referenced.length > 0, "versions.css reads tokens");
  for (const token of referenced) assert.ok(defined.has(token), `versions.css reads ${token}, which tokens.css does not define`);
});

test("the stylesheet gives the current and status states a non-colour cue", () => {
  assert.match(css, /\.versions-link\[aria-current="page"\] \.versions-name\s*\{[^}]*text-decoration:\s*underline/);
  assert.match(css, /\.versions-current\s*\{/);
  for (const status of ["latest", "deprecated", "dev"]) assert.match(css, new RegExp(`\\.versions-status-${status}\\s*\\{`));
});
