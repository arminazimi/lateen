import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, LanguageConfig, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import languageSwitcher, { hrefFor, pagePaths, resolvedLanguages } from "../chrome/language-switcher/index.ts";
import header from "../chrome/header/index.ts";

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const EN: LanguageConfig = { code: "en", name: "English", prefix: "" };
const FA: LanguageConfig = { code: "fa", name: "فارسی", prefix: "/fa" };
const JA: LanguageConfig = { code: "ja", name: "日本語", prefix: "/ja" };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "/docs",
    lang: "en",
    dir: "ltr",
    languages: [EN, FA, JA],
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

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/docs/fa/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "fa",
    dir: "rtl",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

const trail: Trail = [];
const pager: Pager = {};

function props(config: SiteConfig, page: Page = pageWith(), data: Site["data"] = {}): ChromeProps {
  const site: Site = { config, pages: [page], nav: {}, data };
  return { site, page, trail, pager };
}

function render(config: SiteConfig, page: Page = pageWith(), data: Site["data"] = {}): string {
  const node = languageSwitcher(props(config, page, data));
  return node === null ? "" : renderToString(node as never);
}

/** The `href` of every link, in list order. */
function hrefs(out: string): string[] {
  return [...out.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

test("renders nothing when the site has one language, whether from config or by default", () => {
  assert.equal(render(configWith({ languages: [] })), "");
  assert.equal(render(configWith({ languages: [EN] })), "");
});

test("resolvedLanguages falls back to the site language alone and keeps config order", () => {
  assert.deepEqual(resolvedLanguages(configWith({ languages: [] })), [{ code: "en", name: "en", prefix: "" }]);
  assert.deepEqual(resolvedLanguages(configWith()), [
    { code: "en", name: "English", prefix: "" },
    { code: "fa", name: "فارسی", prefix: "/fa" },
    { code: "ja", name: "日本語", prefix: "/ja" },
  ]);
});

test("lists every language as a link, in config order, named in its own language", () => {
  const out = render(configWith());

  assert.match(out, /^<nav class="language-switcher" aria-label="Language" data-language-switcher="true">/);
  assert.match(out, /<ul class="language-switcher-list">/);
  assert.deepEqual(
    [...out.matchAll(/<span class="language-switcher-name">([^<]*)<\/span>/g)].map((match) => match[1]),
    ["English", "فارسی", "日本語"],
  );
});

test("removes the current prefix and adds the target one, keeping the rest of the path", () => {
  assert.deepEqual(hrefs(render(configWith())), [
    "/docs/guide/install/",
    "/docs/fa/guide/install/",
    "/docs/ja/guide/install/",
  ]);
});

test("keeps the path at the home page, with just the prefixes changing", () => {
  const page = pageWith({ url: "/docs/fa/", lang: "fa" });
  assert.deepEqual(hrefs(render(configWith(), page)), ["/docs/", "/docs/fa/", "/docs/ja/"]);
});

test("preserves a nested base, and works at a domain root", () => {
  const nested = pageWith({ url: "/a/b/fa/guide/install/" });
  assert.deepEqual(hrefs(render(configWith({ base: "/a/b" }), nested)), [
    "/a/b/guide/install/",
    "/a/b/fa/guide/install/",
    "/a/b/ja/guide/install/",
  ]);

  const root = pageWith({ url: "/fa/guide/install/" });
  assert.deepEqual(hrefs(render(configWith({ base: "" }), root)), [
    "/guide/install/",
    "/fa/guide/install/",
    "/ja/guide/install/",
  ]);
});

test("marks the current language with aria-current and a visible word, not colour alone", () => {
  const out = render(configWith());

  assert.match(
    out,
    /<li class="language-switcher-item language-switcher-item--current"><a class="language-switcher-link" href="\/docs\/fa\/guide\/install\/" hreflang="fa" lang="fa" aria-current="true"><span class="language-switcher-name">فارسی<\/span><span class="language-switcher-current"> \(Current\)<\/span><\/a><\/li>/,
  );
  assert.equal([...out.matchAll(/aria-current="true"/g)].length, 1);
});

test("gives every link hreflang and lang with its language code", () => {
  const out = render(configWith());

  assert.deepEqual(
    [...out.matchAll(/<a [^>]*hreflang="([^"]+)"[^>]*lang="([^"]+)"/g)].map((match) => `${match[1]}:${match[2]}`),
    ["en:en", "fa:fa", "ja:ja"],
  );
});

test("localises the nav label and the current word in Persian and Arabic", () => {
  const fa = render(configWith({ lang: "fa" }));
  assert.match(fa, /aria-label="زبان"/);
  assert.match(fa, /\(کنونی\)/);

  const ar = render(configWith({ lang: "ar" }));
  assert.match(ar, /aria-label="اللغة"/);
  assert.match(ar, /\(الحالية\)/);
});

test("escapes language names and marks current by code when the URL is mislabelled", () => {
  const hostile: LanguageConfig = { code: "xx", name: '<script>alert("x")</script> & more', prefix: "/xx" };
  const out = render(configWith({ languages: [EN, hostile] }), pageWith({ url: "/docs/guide/", lang: "en" }));

  assert.match(out, /&lt;script>alert\(&quot;x&quot;\)&lt;\/script> &amp; more/);
  assert.doesNotMatch(out, /<script>/);
  assert.equal(hrefs(out)[1], "/docs/xx/guide/");
});

test("the longest matching prefix wins, so /ja-jp/ is not split at /ja", () => {
  const jaJp: LanguageConfig = { code: "ja-JP", name: "日本語", prefix: "/ja-jp" };
  const config = configWith({ languages: [EN, JA, jaJp] });
  const page = pageWith({ url: "/docs/ja-jp/guide/", lang: "ja-JP" });

  assert.deepEqual(hrefs(render(config, page)), ["/docs/guide/", "/docs/ja/guide/", "/docs/ja-jp/guide/"]);
  assert.equal(pagePaths(config, page).rest, "/guide/");
});

test("a page language outside the config still matches by URL prefix", () => {
  const page = pageWith({ url: "/docs/ja/guide/", lang: "de" });
  const { current, rest } = pagePaths(configWith(), page);

  assert.equal(current?.code, "ja");
  assert.equal(rest, "/guide/");
  assert.deepEqual(hrefs(render(configWith(), page)), ["/docs/guide/", "/docs/fa/guide/", "/docs/ja/guide/"]);
});

test("prefers _data/languages.yml alternates, by translation_key and by shared path", () => {
  const data: Site["data"] = {
    languages: {
      alternates: {
        install: { en: "/guide/install/", fa: "/fa/راهنما/نصب/", ja: "https://ja.example/install/" },
        "/guide/configure/": { en: "/guide/configure/", fa: "/fa/guide/configure/" },
      },
    },
  };

  const keyed = render(configWith(), pageWith({ frontMatter: { translation_key: "install" } }), data);
  assert.deepEqual(hrefs(keyed), [
    "/docs/guide/install/",
    "/docs/fa/راهنما/نصب/",
    "https://ja.example/install/",
  ]);

  const byPath = render(configWith(), pageWith({ url: "/docs/fa/guide/configure/", frontMatter: {} }), data);
  assert.deepEqual(hrefs(byPath), [
    "/docs/guide/configure/",
    "/docs/fa/guide/configure/",
    "/docs/ja/guide/configure/",
  ]);
});

test("ignores an alternate URL that is not http(s) or root-relative", () => {
  const data: Site["data"] = {
    languages: { alternates: { install: { en: "javascript:alert(1)", fa: "//evil.example/fa/" } } },
  };
  const out = render(configWith(), pageWith({ frontMatter: { translation_key: "install" } }), data);
  const links = hrefs(out);

  assert.equal(links[0], "/docs/guide/install/");
  assert.equal(links[1], "/docs/fa/guide/install/");
  assert.doesNotMatch(out, /javascript:|evil\.example/);
});

test("is keyboard operable plain HTML: a nav list of anchors, no hidden control, no client script", () => {
  const out = render(configWith());

  assert.match(out, /^<nav .*><ul .*><li .*><a /);
  assert.doesNotMatch(out, /tabindex=|hidden/);
  assert.ok(!existsSync(new URL("../chrome/language-switcher/client.ts", import.meta.url)), "the switcher must need no client.ts");
  assert.match(out, /aria-label="Language"/);
});

test("the header places the switcher above a repository link, and omits it for one language", () => {
  const withRepo = configWith({ repository: { url: "https://github.com/example/site" } });
  const out = renderToString(header(props(withRepo)) as never);
  assert.match(out, /<nav class="language-switcher" aria-label="Language" data-language-switcher="true">/);
  assert.ok(out.indexOf("language-switcher") < out.indexOf("header-repo"));

  const oneLanguage = renderToString(header(props(configWith({ languages: [] }))) as never);
  assert.doesNotMatch(oneLanguage, /language-switcher/);
});

test("hrefFor builds a URL from a normalised prefix and the rest of the path", () => {
  assert.equal(hrefFor(configWith(), { code: "fa", name: "فارسی", prefix: "/fa" }, "/guide/install/"), "/docs/fa/guide/install/");
  assert.equal(hrefFor(configWith(), { code: "en", name: "English", prefix: "" }, "/"), "/docs/");
  assert.equal(hrefFor(configWith({ base: "" }), { code: "fa", name: "فارسی", prefix: "/fa" }, "/"), "/fa/");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  const css = readFileSync(new URL("../chrome/language-switcher/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);
});

test("style.css uses logical properties only", () => {
  const css = readFileSync(new URL("../chrome/language-switcher/style.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /padding-inline:/);
  assert.match(css, /margin-inline-start|padding-inline/);
});
