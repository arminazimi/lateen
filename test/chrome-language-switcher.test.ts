import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, LanguageConfig, LinkTag, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import languageSwitcher, {
  alternateLinks,
  canonicalLink,
  hrefFor,
  pagePaths,
  resolvedLanguages,
} from "../chrome/language-switcher/index.ts";
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

/** The translation group a page belongs to: one page per configured language at its prefix URL. */
function pagesForSite(config: SiteConfig, page: Page): Page[] {
  const { rest } = pagePaths(config, page);
  return resolvedLanguages(config).map((language) => ({
    ...page,
    url: hrefFor(config, language, rest),
    lang: language.code,
    dir: language.code === "fa" || language.code === "ar" ? "rtl" : "ltr",
  }));
}

function props(
  config: SiteConfig,
  page: Page = pageWith(),
  data: Site["data"] = {},
  pages: readonly Page[] = pagesForSite(config, page),
): ChromeProps {
  const site: Site = { config, pages, nav: {}, data };
  return { site, page, trail, pager };
}

function render(config: SiteConfig, page: Page = pageWith(), data: Site["data"] = {}, pages?: readonly Page[]): string {
  const node = languageSwitcher(props(config, page, data, pages));
  return node === null ? "" : renderToString(node as never);
}

/** A page at a URL that does not follow the language prefixes, such as a `translation_key` route. */
function pageAt(url: string, lang: string, overrides: Partial<Page> = {}): Page {
  return pageWith({ url, lang, dir: lang === "fa" || lang === "ar" ? "rtl" : "ltr", ...overrides });
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

  assert.match(out, /^<nav class="language-switcher" aria-label="زبان" data-language-switcher="true">/);
  assert.match(out, /<ul class="language-switcher-list">/);
  assert.deepEqual(
    [...out.matchAll(/<span class="language-switcher-name" dir="auto">([^<]*)<\/span>/g)].map((match) => match[1]),
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

test("marks the current language in the page's language, not the site default's", () => {
  // The English-default site renders a Persian page: guidance is Persian.
  const out = render(configWith());

  assert.match(
    out,
    /<li class="language-switcher-item language-switcher-item--current" data-language-state="current"><a class="language-switcher-link" href="\/docs\/fa\/guide\/install\/" hreflang="fa" lang="fa" aria-current="true"><span class="language-switcher-name" dir="auto">فارسی<\/span><span class="language-switcher-current" lang="fa" dir="rtl"> \(کنونی\)<\/span><\/a><\/li>/,
  );
  assert.equal([...out.matchAll(/aria-current="true"/g)].length, 1);
});

test("marks a translated target as such, and keeps the state word in the page's direction", () => {
  const out = render(configWith({ lang: "fa", dir: "rtl" }));

  assert.equal([...out.matchAll(/data-language-state="translated"/g)].length, 2);
  assert.match(out, /<span class="language-switcher-current" lang="fa" dir="rtl"> \(کنونی\)<\/span>/);
});

test("gives every link hreflang and lang with its language code", () => {
  const out = render(configWith());

  assert.deepEqual(
    [...out.matchAll(/<a [^>]*hreflang="([^"]+)"[^>]*lang="([^"]+)"/g)].map((match) => `${match[1]}:${match[2]}`),
    ["en:en", "fa:fa", "ja:ja"],
  );
});

test("localises the nav label and the current word for the page's language, whatever the site default", () => {
  const ar: LanguageConfig = { code: "ar", name: "العربية", prefix: "/ar" };

  const fa = render(configWith({ lang: "ar", dir: "rtl" }), pageWith());
  assert.match(fa, /aria-label="زبان"/);
  assert.match(fa, /<span class="language-switcher-current" lang="fa" dir="rtl"> \(کنونی\)<\/span>/);

  const arabic = render(configWith({ languages: [EN, FA, ar] }), pageAt("/docs/ar/guide/install/", "ar"));
  assert.match(arabic, /aria-label="اللغة"/);
  assert.match(
    arabic,
    /<span class="language-switcher-current" lang="ar" dir="rtl"> \(الحالية\)<\/span>/,
  );

  const en = render(configWith({ lang: "fa", dir: "rtl" }), pageAt("/docs/guide/install/", "en"));
  assert.match(en, /aria-label="Language"/);
  assert.match(en, /<span class="language-switcher-current" lang="en" dir="ltr"> \(Current\)<\/span>/);
});

test("a regional page tag reads its catalog by primary subtag, and an unshipped page language falls back to stamped English", () => {
  const regional = render(configWith(), pageWith({ url: "/docs/fa/guide/install/", lang: "fa-IR", dir: "rtl" }));
  assert.match(regional, /aria-label="زبان"/);
  assert.match(regional, /<span class="language-switcher-current" lang="fa-IR" dir="rtl"> \(کنونی\)<\/span>/);

  const unshipped = render(configWith(), pageWith({ url: "/docs/ja/guide/install/", lang: "ja-JP", dir: "ltr" }));
  assert.match(unshipped, /aria-label="Language"/);
  assert.match(unshipped, /<span class="language-switcher-current" lang="en" dir="ltr"> \(Current\)<\/span>/);
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

test("links the page the site builds for a language, never a guessed prefix route", () => {
  const fa = pageAt("/docs/fa/راهنما/نصب/", "fa", { frontMatter: { translation_key: "install" } });
  const en = pageAt("/docs/install/", "en", { frontMatter: { translation_key: "install" } });
  const out = render(configWith(), fa, {}, [fa, en]);

  // The current page and the English translation are their real URLs; ja has no page and falls back to English.
  assert.deepEqual(hrefs(out), ["/docs/install/", "/docs/fa/راهنما/نصب/", "/docs/install/"]);
  assert.doesNotMatch(out, /\/docs\/guide\/install\//);
  assert.match(
    out,
    /<li class="language-switcher-item" data-language-state="fallback"><a class="language-switcher-link language-switcher-link--fallback" href="\/docs\/install\/" hreflang="en" lang="ja">/,
  );
});

test("keeps a version segment, so a translation never crosses to another version", () => {
  const config = configWith();
  const page = pageAt("/docs/fa/v2/guide/install/", "fa");
  const enV2 = pageAt("/docs/v2/guide/install/", "en");
  const enV1 = pageAt("/docs/v1/guide/install/", "en");
  const out = render(config, page, {}, [page, enV1, enV2]);

  assert.deepEqual(hrefs(out), ["/docs/v2/guide/install/", "/docs/fa/v2/guide/install/", "/docs/v2/guide/install/"]);
  assert.doesNotMatch(out, /\/docs\/v1\//);
});

test("never links a language with no equivalent page, and says why in the page's language", () => {
  const page = pageAt("/docs/fa/guide/install/", "fa");
  const out = render(configWith(), page, {}, [page]);

  // Only the current page is a link: en and ja have no page and the default chain (en) has none either.
  assert.deepEqual(hrefs(out), ["/docs/fa/guide/install/"]);
  assert.equal([...out.matchAll(/data-language-state="missing"/g)].length, 2);
  assert.match(
    out,
    /<span class="language-switcher-link language-switcher-link--unavailable" lang="en" aria-disabled="true"><span class="language-switcher-name" dir="auto">English<\/span><span class="language-switcher-state" aria-hidden="true">—<\/span><span class="language-switcher-sr" lang="fa" dir="rtl">این صفحه هنوز ترجمه نشده است. آن را به این زبان بخوانید:<\/span><\/span>/,
  );
});

test("follows _data/languages.yml's fallback chain and names the language it really opens", () => {
  const de: LanguageConfig = { code: "de", name: "Deutsch", prefix: "/de" };
  const config = configWith({ languages: [EN, FA, de] });
  const en = pageAt("/docs/guide/install/", "en");
  const fa = pageAt("/docs/fa/guide/install/", "fa");
  const out = render(config, en, { languages: { fallback: ["fa"] } }, [en, fa]);

  assert.deepEqual(hrefs(out), ["/docs/guide/install/", "/docs/fa/guide/install/", "/docs/fa/guide/install/"]);
  assert.match(
    out,
    /<li class="language-switcher-item" data-language-state="fallback"><a class="language-switcher-link language-switcher-link--fallback" href="\/docs\/fa\/guide\/install\/" hreflang="fa" lang="de"><span class="language-switcher-name" dir="auto">Deutsch<\/span><span class="language-switcher-sr" lang="en" dir="ltr">This page hasn't been translated yet. Read it in:<\/span><span class="language-switcher-state" lang="fa" dir="auto"> \(فارسی\)<\/span><\/a><\/li>/,
  );
});

test("a fallback entry names the language actually opened while its guidance stays in the page's language", () => {
  const de: LanguageConfig = { code: "de", name: "Deutsch", prefix: "/de" };
  const config = configWith({ languages: [EN, FA, de] });
  const en = pageAt("/docs/guide/install/", "en");
  const fa = pageAt("/docs/fa/guide/install/", "fa");
  const out = render(config, fa, { languages: { fallback: ["en"] } }, [en, fa]);

  // Reading the Persian page: de has no page and falls back to English. The guidance is Persian (the
  // page's language), while the name and the actually-opened language keep their own lang/dir.
  assert.deepEqual(hrefs(out), ["/docs/guide/install/", "/docs/fa/guide/install/", "/docs/guide/install/"]);
  assert.match(
    out,
    /<a class="language-switcher-link language-switcher-link--fallback" href="\/docs\/guide\/install\/" hreflang="en" lang="de"><span class="language-switcher-name" dir="auto">Deutsch<\/span><span class="language-switcher-sr" lang="fa" dir="rtl">این صفحه هنوز ترجمه نشده است. آن را به این زبان بخوانید:<\/span><span class="language-switcher-state" lang="en" dir="auto"> \(English\)<\/span><\/a>/,
  );
});

test("a regional target falls back to its shorter tag before the site chain", () => {
  const pt: LanguageConfig = { code: "pt", name: "Português", prefix: "/pt" };
  const ptBr: LanguageConfig = { code: "pt-BR", name: "Português (Brasil)", prefix: "/pt-br" };
  const config = configWith({ languages: [EN, pt, ptBr] });
  const en = pageAt("/docs/guide/install/", "en");
  const ptPage = pageAt("/docs/pt/guide/install/", "pt");
  const out = render(config, en, {}, [en, ptPage]);

  assert.deepEqual(hrefs(out), ["/docs/guide/install/", "/docs/pt/guide/install/", "/docs/pt/guide/install/"]);
  assert.match(out, /<li class="language-switcher-item" data-language-state="fallback"><a [^>]*hreflang="pt" lang="pt-BR">/);
  assert.match(out, /<span class="language-switcher-state" lang="pt" dir="auto"> \(Português\)<\/span>/);
});

test("is keyboard operable plain HTML: a nav list of anchors, no hidden control, no client script", () => {
  const out = render(configWith());

  assert.match(out, /^<nav .*><ul .*><li .*><a /);
  assert.doesNotMatch(out, /tabindex=|hidden/);
  assert.ok(!existsSync(new URL("../chrome/language-switcher/client.ts", import.meta.url)), "the switcher must need no client.ts");
  assert.match(out, /aria-label="زبان"/);
});

test("the header places the switcher above a repository link, and omits it for one language", () => {
  const withRepo = configWith({ repository: { url: "https://github.com/example/site" } });
  const out = renderToString(header(props(withRepo)) as never);
  assert.match(out, /<nav class="language-switcher" aria-label="زبان" data-language-switcher="true">/);
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

/** The alternate links the layout would add to this page's head. */
function alternates(
  config: SiteConfig,
  page: Page = pageWith(),
  data: Site["data"] = {},
  pages?: readonly Page[],
): readonly LinkTag[] {
  return alternateLinks(props(config, page, data, pages).site, page);
}

/** Each link as `hreflang:absolute URL`, in document order. */
function hreflangs(links: readonly LinkTag[]): string[] {
  return links.map((link) => `${link.attrs?.["hreflang"] ?? ""}:${link.href}`);
}

test("canonicalLink makes the page URL absolute under the site url, and is absent without one", () => {
  assert.deepEqual(canonicalLink(props(configWith({ url: "https://example.com" })).site, pageWith()), {
    rel: "canonical",
    href: "https://example.com/docs/fa/guide/install/",
  });
  assert.deepEqual(canonicalLink(props(configWith({ url: "https://example.com/" })).site, pageWith()), {
    rel: "canonical",
    href: "https://example.com/docs/fa/guide/install/",
  });
  assert.equal(canonicalLink(props(configWith()).site, pageWith()), undefined);
});

test("emits reciprocal absolute alternates with full regional tags and x-default for the default language", () => {
  const jaJp: LanguageConfig = { code: "ja-JP", name: "日本語", prefix: "/ja-jp" };
  const config = configWith({ url: "https://example.com", languages: [EN, JA, jaJp] });
  const page = pageWith({ url: "/docs/ja-jp/guide/install/", lang: "ja-JP", dir: "ltr" });
  const pages = pagesForSite(config, page);
  const expected = [
    "en:https://example.com/docs/guide/install/",
    "ja:https://example.com/docs/ja/guide/install/",
    "ja-JP:https://example.com/docs/ja-jp/guide/install/",
    "x-default:https://example.com/docs/guide/install/",
  ];

  assert.deepEqual(hreflangs(alternates(config, page, {}, pages)), expected);
  for (const other of pages) {
    assert.deepEqual(hreflangs(alternates(config, other, {}, pages)), expected, `reciprocal from ${other.lang}`);
  }
});

test("keeps translation_key alternates, including absolute ones, and their base", () => {
  const data: Site["data"] = {
    languages: {
      alternates: {
        install: { en: "https://en.example/install/", fa: "/fa/راهنما/نصب/", ja: "https://ja.example/install/" },
      },
    },
  };
  const fa = pageAt("/docs/fa/install/", "fa", { frontMatter: { translation_key: "install" } });
  const en = pageAt("/docs/install/", "en", { frontMatter: { translation_key: "install" } });

  assert.deepEqual(hreflangs(alternates(configWith({ url: "https://example.com" }), fa, data, [fa, en])), [
    "en:https://en.example/install/",
    "fa:https://example.com/docs/fa/راهنما/نصب/",
    "ja:https://ja.example/install/",
    "x-default:https://en.example/install/",
  ]);
});

test("keeps a nested base in every absolute URL", () => {
  const config = configWith({ url: "https://example.com", base: "/a/b" });
  const page = pageWith({ url: "/a/b/fa/guide/install/" });

  assert.deepEqual(hreflangs(alternates(config, page)), [
    "en:https://example.com/a/b/guide/install/",
    "fa:https://example.com/a/b/fa/guide/install/",
    "ja:https://example.com/a/b/ja/guide/install/",
    "x-default:https://example.com/a/b/guide/install/",
  ]);
});

test("keeps a version segment, so an alternate never crosses to another version", () => {
  const config = configWith({ url: "https://example.com" });
  const fa = pageAt("/docs/fa/v2/guide/install/", "fa");
  const enV2 = pageAt("/docs/v2/guide/install/", "en");
  const enV1 = pageAt("/docs/v1/guide/install/", "en");

  assert.deepEqual(hreflangs(alternates(config, fa, {}, [fa, enV1, enV2])), [
    "en:https://example.com/docs/v2/guide/install/",
    "fa:https://example.com/docs/fa/v2/guide/install/",
    "x-default:https://example.com/docs/v2/guide/install/",
  ]);
});

test("never advertises a missing page or a fallback as a translation", () => {
  const de: LanguageConfig = { code: "de", name: "Deutsch", prefix: "/de" };
  const config = configWith({ url: "https://example.com", languages: [EN, FA, de] });
  const en = pageAt("/docs/guide/install/", "en");
  const fa = pageAt("/docs/fa/guide/install/", "fa");

  // de has no page and the fallback chain points it at fa: only the real pages are alternates.
  assert.deepEqual(hreflangs(alternates(config, en, { languages: { fallback: ["fa"] } }, [en, fa])), [
    "en:https://example.com/docs/guide/install/",
    "fa:https://example.com/docs/fa/guide/install/",
    "x-default:https://example.com/docs/guide/install/",
  ]);

  // With no page in the default language there is no x-default, only the page that exists.
  assert.deepEqual(hreflangs(alternates(configWith({ url: "https://example.com" }), fa, {}, [fa])), [
    "fa:https://example.com/docs/fa/guide/install/",
  ]);
});

test("writes no alternates without a site url, or with a single language", () => {
  assert.deepEqual(alternates(configWith()), []);
  assert.deepEqual(alternates(configWith({ url: "https://example.com", languages: [EN] }), pageWith({ url: "/docs/guide/", lang: "en" })), []);
});

test("escapes metadata attributes, so a hostile tag cannot break out", () => {
  const hostile: LanguageConfig = { code: 'x" onload="alert(1)', name: "X", prefix: "/xx" };
  const config = configWith({ url: "https://example.com", languages: [EN, hostile] });
  const en = pageAt("/docs/guide/", "en");
  const xx = pageAt("/docs/xx/guide/", 'x" onload="alert(1)');
  const links = alternates(config, en, {}, [en, xx]);
  const out = renderToString(
    h("head", null, ...links.map((link) => h("link", { ...link.attrs, rel: link.rel, href: link.href }))) as never,
  );

  assert.match(out, /hreflang="x&quot; onload=&quot;alert\(1\)"/);
  assert.doesNotMatch(out, /onload="alert/);
});
