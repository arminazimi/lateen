import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type {
  ChromeProps,
  Heading,
  Page,
  RepositoryConfig,
  Site,
  SiteConfig,
  SourcePos,
} from "@velella/mizzen/contracts";
import editPage, {
  editHref,
  editLinkFromData,
  editUrlOf,
  headingLinksEnabled,
  headingLinksOf,
  hostOf,
  suggestEditUrl,
} from "../chrome/edit-page/index.ts";

const source: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const github: RepositoryConfig = { url: "https://github.com/arminazimi/slipway/", dir: "docs" };

function configWith(
  options: Readonly<Record<string, unknown>> = {},
  repository?: RepositoryConfig,
  lang = "en",
): SiteConfig {
  return {
    title: "Example",
    base: "/example",
    lang,
    dir: lang === "fa" || lang === "ar" ? "rtl" : "ltr",
    languages: [],
    source: ".",
    include: [],
    exclude: [],
    navigation: "_data/navigation.yml",
    defaults: [],
    ...(repository === undefined ? {} : { repository }),
    theme: { options },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

function headingWith(text: string, line: number, id = text.toLowerCase().replace(/\s+/g, "-"), file = source.file): Heading {
  return { depth: 2, text, id, pos: { file, line, column: 1, endLine: line, endColumn: 1 } };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/example/guide/install/",
    source,
    frontMatter: { title: "Install" },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [headingWith("Run the build", 5), headingWith("Configure the cache", 12)],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

function props(
  page: Page = pageWith(),
  repository: RepositoryConfig | null = github,
  options: Readonly<Record<string, unknown>> = {},
  data: Site["data"] = {},
): ChromeProps {
  const site: Site = {
    config: configWith(options, repository === null ? undefined : repository, page.lang),
    pages: [page],
    nav: {},
    data,
  };
  return { site, page, trail: [], pager: {} };
}

/** The block's HTML, or an empty string when it renders nothing. */
function render(input: ChromeProps = props()): string {
  const node = editPage(input);
  return node === null ? "" : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("GitHub: the edit link points at the source on main, with the trailing slash dropped and rel=noopener", () => {
  const out = render();

  assert.match(
    out,
    /<a class="edit-page-link" href="https:\/\/github\.com\/arminazimi\/slipway\/edit\/main\/docs\/guide\/install\.md" rel="noopener">Edit this page<\/a>/,
  );
});

test("GitLab: the edit link uses the /-/edit path", () => {
  assert.equal(
    editUrlOf({ url: "https://gitlab.com/acme/docs/" }, "docs/guide/install.md"),
    "https://gitlab.com/acme/docs/-/edit/main/docs/guide/install.md",
  );
});

test("a self-hosted GitLab and an enterprise GitHub host are recognised", () => {
  assert.equal(hostOf({ url: "https://gitlab.example.com/team/docs.git/" }), "gitlab");
  assert.equal(hostOf({ url: "https://github.example.com/team/docs" }), "github");
});

test("a configured branch and directory are used, and the directory is not added twice", () => {
  const repository: RepositoryConfig = { url: "https://github.com/o/r", branch: "release/2.0", dir: "docs" };
  const url = editUrlOf(repository, "docs/my guide/install #2.md");

  assert.equal(url, "https://github.com/o/r/edit/release%2F2.0/docs/my%20guide/install%20%232.md");
  assert.doesNotMatch(url ?? "", /docs\/docs/);
});

test("an unknown forge, an unparseable URL, and an empty source path give no edit URL", () => {
  assert.equal(editUrlOf({ url: "https://codeberg.org/acme/site" }, "docs/install.md"), undefined);
  assert.equal(editUrlOf({ url: "git@github.com:acme/site.git" }, "docs/install.md"), undefined);
  assert.equal(editUrlOf({ url: "ftp://github.com/acme/site" }, "docs/install.md"), undefined);
  assert.equal(editUrlOf(github, ""), undefined);
  assert.equal(editUrlOf(github, "  "), undefined);
});

test("without a repository the block renders nothing at all (AC3)", () => {
  assert.equal(render(props(pageWith(), null)), "");
  assert.equal(editHref({ config: configWith(), pages: [pageWith()], nav: {}, data: {} }, pageWith()), undefined);
});

test("a non-document page gets no edit block", () => {
  assert.equal(render(props(pageWith({ kind: "asset" }))), "");
  assert.equal(render(props(pageWith({ kind: "app" }))), "");
});

test("localised label: the footer link reads in the page language", () => {
  assert.match(render(props(pageWith({ lang: "fa", dir: "rtl" }))), />ویرایش این صفحه<\/a>/);
  assert.match(render(props(pageWith({ lang: "ar", dir: "rtl" }))), />تحرير هذه الصفحة<\/a>/);
});

test("site data wins over the computed URL, keyed by page URL as a string", () => {
  const data = { "edit-links": { "/example/guide/install/": "https://github.com/o/r/edit/trunk/guide/install.md" } };
  const out = render(props(pageWith(), github, {}, data));

  assert.match(out, /href="https:\/\/github\.com\/o\/r\/edit\/trunk\/guide\/install\.md"/);
  assert.doesNotMatch(out, /arminazimi/);
});

test("site data also reads the engine's array of edit links and an object with editUrl", () => {
  const list = {
    "edit-links": [{ url: "/example/guide/install/", source: "guide/install.md", editUrl: "https://github.com/o/r/edit/main/guide/install.md" }],
  };
  assert.match(render(props(pageWith(), github, {}, list)), /href="https:\/\/github\.com\/o\/r\/edit\/main\/guide\/install\.md"/);

  const record = {
    editLinks: { "/example/guide/install/": { editUrl: "https://gitlab.com/o/r/-/edit/main/guide/install.md" } },
  };
  assert.match(render(props(pageWith(), github, {}, record)), /href="https:\/\/gitlab\.com\/o\/r\/-\/edit\/main\/guide\/install\.md"/);
});

test("an unsafe or non-web data value is ignored, and the computed URL is used instead", () => {
  const data = { "edit-links": { "/example/guide/install/": "javascript:alert(1)" } };

  assert.equal(editLinkFromData(data["edit-links"], "/example/guide/install/"), undefined);
  assert.match(render(props(pageWith(), github, {}, data)), /\/edit\/main\/docs\/guide\/install\.md"/);
});

test("data with no entry for the page falls back to the repository", () => {
  const data = { "edit-links": { "/other/": "https://github.com/o/r/edit/main/other.md" } };

  assert.match(render(props(pageWith(), github, {}, data)), /arminazimi\/slipway\/edit\/main/);
});

test("heading helper: GitHub's new-issue URL carries the page, source line, and heading id", () => {
  const page = pageWith();
  const url = suggestEditUrl(github, page, page.headings[0]);

  assert.ok(url !== undefined);
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://github.com/arminazimi/slipway/issues/new");
  assert.equal(parsed.searchParams.get("title"), "Suggest edit: Install — Run the build");
  assert.equal(
    parsed.searchParams.get("body"),
    "Suggest an edit to this heading.\n\nPage: /example/guide/install/\nSource: docs/guide/install.md:5\nHeading: run-the-build\n",
  );
});

test("heading helper: GitLab uses its own new-issue path and query keys", () => {
  const page = pageWith();
  const url = suggestEditUrl({ url: "https://gitlab.com/acme/docs/" }, page, page.headings[1]);

  assert.ok(url !== undefined);
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://gitlab.com/acme/docs/-/issues/new");
  assert.equal(parsed.searchParams.get("issue[title]"), "Suggest edit: Install — Configure the cache");
  assert.match(parsed.searchParams.get("issue[description]") ?? "", /Heading: configure-the-cache\n$/);
});

test("heading helper: no repository, no page URL, an unknown heading, or no source position gives nothing", () => {
  const page = pageWith();
  const generated = pageWith({ headings: [headingWith("Generated", 1, "generated", "")] });

  assert.equal(suggestEditUrl(undefined, page, page.headings[0]), undefined);
  assert.equal(suggestEditUrl(github, pageWith({ url: "" }), page.headings[0]), undefined);
  assert.equal(suggestEditUrl(github, page, { ...page.headings[0]!, id: "missing" }), undefined);
  assert.equal(suggestEditUrl(github, page, { ...page.headings[0]!, id: "" }), undefined);
  assert.equal(suggestEditUrl(github, generated, generated.headings[0]), undefined);
});

test("heading links are opt-in and off by default", () => {
  assert.equal(headingLinksEnabled(configWith()), false);
  assert.equal(headingLinksEnabled(configWith({ editPage: { headingLinks: "yes" } })), false);
  assert.deepEqual(headingLinksOf(props().site, pageWith()), []);

  const out = render();
  assert.doesNotMatch(out, /edit-page-headings/);
  assert.doesNotMatch(out, /suggest an edit/i);
});

test("with theme.options.editPage.headingLinks the footer lists one issue link per heading", () => {
  const out = render(props(pageWith(), github, { editPage: { headingLinks: true } }));

  assert.match(out, /<ul class="edit-page-headings">/);
  assert.match(out, /href="https:\/\/github\.com\/arminazimi\/slipway\/issues\/new\?[^"]*"/);
  assert.match(out, /aria-label="Suggest an edit to “Run the build”">Run the build<\/a>/);
  assert.match(out, /aria-label="Suggest an edit to “Configure the cache”">Configure the cache<\/a>/);
  assert.equal((out.match(/<li>/g) ?? []).length, 2);
});

test("heading links skip a generated heading and appear only when a URL exists", () => {
  const page = pageWith({ headings: [headingWith("Generated", 1, "generated", ""), headingWith("Real", 8)] });
  const out = render(props(page, github, { editPage: { headingLinks: true } }));

  assert.doesNotMatch(out, />Generated<\/a>/);
  assert.match(out, />Real<\/a>/);
});

test("heading links do not appear without a repository, and the block stays hidden", () => {
  assert.equal(render(props(pageWith(), null, { editPage: { headingLinks: true } })), "");
});

test("heading link URLs are capped below the 8 KB request-line limit", () => {
  const long = "A".repeat(4000);
  const page = pageWith({ headings: [headingWith(long, 2)] });
  const url = suggestEditUrl(github, page, page.headings[0]);

  assert.ok(url !== undefined);
  assert.ok(url.length <= 8000, `URL is ${url.length} characters`);
});

test("text and attribute values are escaped, so content stays text", () => {
  const page = pageWith({
    title: 'A & B "quoted"',
    headings: [headingWith("<script>alert(\"x\")</script>", 4, "script")],
  });
  const out = render(props(page, github, { editPage: { headingLinks: true } }));

  assert.match(out, /title=Suggest%20edit%3A%20A%20%26%20B%20%22quoted%22/);
  assert.match(out, /aria-label="Suggest an edit to “&lt;script>alert\(&quot;x&quot;\)&lt;\/script>”/);
  assert.match(out, />&lt;script>alert\(&quot;x&quot;\)&lt;\/script><\/a>/);
});

test("each link carries rel=noopener, including heading links", () => {
  const out = render(props(pageWith(), github, { editPage: { headingLinks: true } }));

  assert.equal((out.match(/ rel="noopener"/g) ?? []).length, 3);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/edit-page/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css keeps a heading link hidden until hover or focus, and uses logical properties", () => {
  const css = readFileSync(new URL("../chrome/edit-page/style.css", import.meta.url), "utf8");

  assert.match(css, /\.doc-body :is\(h2, h3, h4\) \.edit-page-heading-link \{[^}]*opacity: 0;/);
  assert.match(css, /\.doc-body :is\(h2, h3, h4\):hover \.edit-page-heading-link/);
  assert.match(css, /\.doc-body :is\(h2, h3, h4\):focus-within \.edit-page-heading-link/);
  assert.match(css, /@media \(hover: none\)/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
