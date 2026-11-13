// Complete multilingual and RTL journeys (issue #30): a real doc page in English, Persian, and
// Arabic carries the same controls with its own language; the version context survives a language
// switch; prose stays right to left while technical runs and authored names are isolated; search and
// the variables form speak the page language; a catalog falls back the documented way; and the
// stylesheets keep navigation logical and mirror only the arrows that point the way the reader moves.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type {
  ChromeProps,
  ComponentProps,
  LanguageConfig,
  LayoutProps,
  NavItem,
  Page,
  Site,
  SiteConfig,
  SourcePos,
} from "@velella/mizzen/contracts";
import doc from "../layouts/doc.ts";
import variablesForm from "../components/variables-form/index.ts";
import search from "../chrome/search/index.ts";
import versionSwitcher, { versionsOf } from "../chrome/version-switcher/index.ts";
import { hrefFor, pagePaths, resolvedLanguages } from "../chrome/language-switcher/index.ts";
import { optionList, safeHref } from "../chrome/search/options.ts";
import { patternOf, stringsOf, t } from "../i18n/index.ts";
import { calendarDate } from "../src/dates.ts";

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const EN: LanguageConfig = { code: "en", name: "English", prefix: "" };
const FA: LanguageConfig = { code: "fa", name: "فارسی", prefix: "/fa" };
const AR: LanguageConfig = { code: "ar", name: "العربية", prefix: "/ar" };
const LANGUAGES = [EN, FA, AR];

type Lang = "en" | "fa" | "ar";

/** Navigation items as navigation.yml carries them: the contract fields plus authoring marks like `tab`. */
type NavSource = NavItem & { readonly tab?: unknown };

const TITLE: Readonly<Record<Lang, string>> = { en: "Install", fa: "نصب", ar: "التثبيت" };
const PROSE: Readonly<Record<Lang, string>> = {
  en: "<p>Run the build.</p>",
  fa: "<p>برای نصب، فرمان زیر را اجرا کنید.</p>",
  ar: "<p>لتثبيت الحزمة، نفّذ الأمر التالي.</p>",
};
const REASON: Readonly<Record<Lang, string>> = {
  en: "All examples passed.",
  fa: "همهٔ نمونه‌ها موفق بودند.",
  ar: "نجحت كل الأمثلة.",
};
const URL_OF: Readonly<Record<Lang, string>> = {
  en: "/docs/v2/guide/install/",
  fa: "/docs/fa/v2/guide/install/",
  ar: "/docs/ar/v2/guide/install/",
};

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "/docs",
    lang: "en",
    dir: "ltr",
    languages: LANGUAGES,
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

function pageWith(lang: Lang, overrides: Partial<Page> = {}): Page {
  return {
    url: URL_OF[lang],
    source: { ...pos, file: `guide/install.${lang}.md` },
    frontMatter: {
      title: TITLE[lang],
      last_modified_at: "2026-01-15",
      variables: [
        { name: "api_key", default: "YOUR_KEY" },
        { name: "host", default: "https://api.example.com" },
      ],
    },
    title: TITLE[lang],
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    headings: [{ depth: 2, text: TITLE[lang], id: "install", pos }],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

/** One page per configured language, so the switcher resolves real translations rather than fallbacks. */
function translationPages(): Page[] {
  return LANGUAGES.map((language) => pageWith(language.code as Lang));
}

/** The N17 versions shape for this language, with the page's own prefix kept in every URL. */
function versionsFor(lang: Lang): Readonly<Record<string, unknown>> {
  const prefix = lang === "en" ? "" : `/${lang}`;
  return {
    pages: [
      {
        path: `guide/install.${lang}.md`,
        versions: [
          { version: "v1", url: `${prefix}/v1/guide/install/` },
          { version: "v2", url: `${prefix}/v2/guide/install/` },
        ],
      },
    ],
  };
}

/** The variables form as the engine embeds it in the page body. */
function formFor(page: Page): string {
  const node = variablesForm({ props: {}, page, site: { data: {} }, html: "" } as unknown as ComponentProps<never>);
  return node === null ? "" : renderToString(node as never);
}

function docProps(lang: Lang): LayoutProps {
  const authored = pageWith(lang);
  const form = formFor(authored);
  const page: Page = {
    ...authored,
    html: `${PROSE[lang]}<pre><code class="language-sh">npm ci\n</code></pre>${form}`,
  };
  const site: Site = {
    config: configWith(),
    pages: translationPages(),
    nav: {
      main: [
        { title: TITLE[lang], tab: true, children: [{ title: TITLE[lang], url: page.url }] } as NavSource,
      ],
    },
    data: {
      versions: versionsFor(lang),
      trust: { [page.url]: { level: "verified", reasons: [REASON[lang]], lastReviewer: "Sara" } },
      build: { asOf: "2026-02-01" },
    },
  };
  return {
    site,
    page,
    trail: [
      { title: TITLE[lang], url: "/docs/" },
      { title: TITLE[lang], url: page.url },
    ],
    pager: {
      prev: { title: TITLE[lang], url: "/docs/v2/guide/" },
      next: { title: "API", url: "/docs/v2/api/" },
    },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

function renderDoc(lang: Lang): string {
  return renderToString(doc(docProps(lang)) as never);
}

function chromeProps(lang: Lang): ChromeProps {
  const page = pageWith(lang);
  return {
    site: { config: configWith(), pages: [page], nav: { main: [] }, data: { versions: versionsFor(lang) } },
    page,
    trail: [],
    pager: {},
  };
}

/** One navigation landmark from a rendered page, with its own markup only. */
function navHtml(out: string, className: string): string {
  const match = new RegExp(`<nav class="${className}"[^>]*>[\\s\\S]*?</nav>`).exec(out);
  assert.ok(match, `the page has no ${className} navigation`);
  return match[0];
}

/** The `href` of every link, in list order. */
function hrefs(out: string): string[] {
  return [...out.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** Runs `run` while collecting everything written to `console.warn`. */
function warningsFrom(run: () => void): string[] {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    run();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

/** Runs `run` with `NODE_ENV` set to `value`, then restores the previous value. */
function withNodeEnv<T>(value: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test("an English doc page renders the whole journey on a left-to-right route", () => {
  const out = renderDoc("en");

  assert.match(out, /^<html lang="en" dir="ltr"/);
  assert.ok(out.includes(`aria-label="${t("en", "language")}"`), "the language switcher is named in the page language");
  assert.ok(out.includes(`href="${URL_OF.en}"`), "the current language keeps the page's own URL");
  assert.ok(out.includes(`aria-label="${t("en", "versions")}"`), "the version switcher is present and named");
  assert.match(out, /<span class="version-switcher-value" dir="ltr">v2<\/span>/);
  assert.ok(out.includes(`aria-label="${t("en", "search")}"`), "the search control is named");
  assert.match(out, /<dialog class="search"/);
  assert.match(out, /data-search-lang="en"/);
  assert.match(navHtml(out, "sidebar-nav"), new RegExp(`href="${URL_OF.en}"`), "the navigation links the route being read");
  assert.match(out, /<pre class="code"[^>]*data-lang="sh"/);
  assert.match(out, /<details class="trust-panel trust-panel-verified"/);
  assert.match(out, /<fieldset class="variables-form" data-variables-form>/);
  assert.ok(out.includes(`>${t("en", "variables_form_legend")}</legend>`));
  assert.match(out, /<a class="skip-link" href="#main">Skip to content<\/a>/);
});

test("Persian and Arabic doc pages carry the same journey right to left, named in their own language", () => {
  for (const lang of ["fa", "ar"] as const) {
    const out = renderDoc(lang);

    assert.match(out, new RegExp(`^<html lang="${lang}" dir="rtl"`), `${lang} html lang/dir`);
    assert.ok(out.includes(`aria-label="${t(lang, "language")}"`), `${lang} language switcher name`);
    assert.ok(out.includes(`aria-label="${t(lang, "versions")}"`), `${lang} version switcher name`);
    assert.ok(out.includes(`aria-label="${t(lang, "search")}"`), `${lang} search name`);
    assert.match(out, new RegExp(`data-search-lang="${lang}"`));
    assert.ok(out.includes(`aria-label="${t(lang, "breadcrumbs")}"`), `${lang} breadcrumb name`);
    assert.ok(out.includes(`aria-label="${t(lang, "pager")}"`), `${lang} pager name`);
    assert.ok(out.includes(`aria-label="${t(lang, "not_found_sections")}"`), `${lang} section-tab name`);
    assert.match(out, /<nav class="sidebar-nav"/);
    assert.match(out, /<pre class="code"[^>]*data-lang="sh"/);
    assert.match(out, /<details class="trust-panel trust-panel-verified"/);
    assert.ok(out.includes(t(lang, "trust_level_verified")), `${lang} trust level is translated`);
    assert.match(out, /<fieldset class="variables-form" data-variables-form>/);
    assert.ok(out.includes(`>${t(lang, "variables_form_legend")}</legend>`), `${lang} form legend`);
    assert.ok(
      navHtml(out, "language-switcher").includes(`href="${URL_OF[lang]}"`),
      `${lang} route is kept in the switcher`,
    );

    // English names for keys that exist are not leaking into an RTL page.
    for (const english of ['aria-label="Search"', 'aria-label="Versions"', 'aria-label="Breadcrumbs"', 'aria-label="Previous and next"']) {
      assert.ok(!out.includes(english), `${lang} leaks ${english}`);
    }
  }
});

test("switching language keeps the route and its version segment", () => {
  const config = configWith();
  for (const lang of ["en", "fa", "ar"] as const) {
    const out = renderDoc(lang);
    const switcher = navHtml(out, "language-switcher");
    const { rest } = pagePaths(config, pageWith(lang));
    const expected = resolvedLanguages(config).map((language) => hrefFor(config, language, rest));

    assert.equal(rest, "/v2/guide/install/", `${lang} rest keeps the version segment`);
    assert.deepEqual(hrefs(switcher), expected, `${lang} switcher links`);
    for (const href of expected) assert.ok(href.includes("/v2/"), `${lang} link ${href} left the version`);
  }

  // The English v2 page switches to the Persian v2 page, never to another version.
  const english = hrefs(navHtml(renderDoc("en"), "language-switcher"));
  assert.equal(english[1], "/docs/fa/v2/guide/install/");
  assert.ok(!english[1]!.includes("/docs/fa/guide/install/"));
});

test("the version switcher for a Persian page under /v2/ keeps the language prefix and marks the current version", () => {
  const props = chromeProps("fa");
  const out = renderToString(versionSwitcher(props) as never);

  assert.equal(out.startsWith(`<nav class="version-switcher" aria-label="${t("fa", "versions")}">`), true);
  assert.deepEqual(hrefs(out), ["/docs/fa/v1/guide/install/", "/docs/fa/v2/guide/install/"]);
  assert.match(out, /<span class="version-switcher-value" dir="ltr">v2<\/span>/);
  assert.match(out, /<span class="version-switcher-version" dir="ltr">v1<\/span>/);
  assert.match(out, /<span class="version-switcher-version" dir="ltr">v2<\/span>/);
  assert.match(out, /href="\/docs\/fa\/v2\/guide\/install\/" data-version-target="page" aria-current="true">/);
  assert.doesNotMatch(out, /href="\/docs\/fa\/v1\/guide\/install\/"[^>]*aria-current/);
  assert.doesNotMatch(out, /\/docs\/v1\//, "a Persian version link never loses its language prefix");
  assert.equal(out.match(/aria-current="true"/g)?.length, 1);

  const links = versionsOf(props.site, props.page);
  assert.equal(links?.find((link) => link.version === "v2")?.current, true);
  assert.equal(links?.find((link) => link.version === "v1")?.current, false);
});

test("mixed direction: prose stays RTL while versions, names, and code runs are isolated", () => {
  const out = renderDoc("fa");

  assert.match(out, /^<html lang="fa" dir="rtl"/);
  // Prose takes the page direction; the layout does not stamp a direction on the body copy.
  assert.match(out, /<div class="doc-body">/);
  assert.ok(out.includes("برای نصب، فرمان زیر را اجرا کنید."), "the Persian prose is the page body");

  // Version values are machine text and say so.
  assert.match(out, /<span class="version-switcher-value" dir="ltr">v2<\/span>/);
  assert.equal([...out.matchAll(/<span class="version-switcher-version" dir="ltr">/g)].length, 2);
  // A language is named in its own script with `dir="auto"`, and the current word is the page's.
  assert.match(out, /<span class="language-switcher-name" dir="auto">English<\/span>/);
  assert.match(out, /<span class="language-switcher-name" dir="auto">فارسی<\/span>/);
  assert.match(out, /<span class="language-switcher-current" lang="fa" dir="rtl"> \(کنونی\)<\/span>/);
  // Authored page titles on the pager, breadcrumb, and last-updated line are `<bdi>` islands.
  assert.match(navHtml(out, "pager"), /<span class="pager-title"><bdi>/);
  assert.match(navHtml(out, "breadcrumb"), /<bdi class="breadcrumb-title">/);
  assert.match(out, /<span class="last-updated-date"[^>]*>[\s\S]*?<bdi>/);

  // The technical fence is a left-to-right block of its own, with the exact command text.
  assert.match(out, /<pre class="code"[^>]*data-lang="sh"[^>]*><code>[\s\S]*?npm/);
});

test("dates come from the page's calendar catalog and are wrapped where the code wraps them", () => {
  const fa = renderDoc("fa");
  const ar = renderDoc("ar");
  const faDate = calendarDate("2026-01-15", "fa");
  const arDate = calendarDate("2026-01-15", "ar");
  const faBuild = calendarDate("2026-02-01", "fa");
  const arBuild = calendarDate("2026-02-01", "ar");
  assert.ok(faDate && arDate && faBuild && arBuild);

  // The last-updated line shows the Jalali/Hijri text inside `<bdi>`, with the ISO value and the
  // exact localized date on the `<time>` element.
  assert.match(fa, /<span class="last-updated-date"[^>]*>[\s\S]*?<time datetime="2026-01-15"/);
  assert.ok(fa.includes(`title="${faDate.text}"`), "the Persian date is the localized one");
  assert.ok(!fa.includes("January 15, 2026"), "the Persian page does not show an English date");
  assert.match(fa, /<time datetime="2026-01-15"[^>]*>[\s\S]*?<bdi>/);

  assert.ok(ar.includes(`title="${arDate.text}"`), "the Arabic date is the localized one");
  assert.ok(!ar.includes("January 15, 2026"), "the Arabic page does not show an English date");

  // The trust panel's generated date is localized too, and keeps its machine-readable value.
  assert.ok(fa.includes(`<time datetime="2026-02-01" title="${faBuild.text}"`));
  assert.ok(ar.includes(`<time datetime="2026-02-01" title="${arBuild.text}"`));
});

test("search speaks the page's language and only builds safe result links", () => {
  const records = [
    { url: "/docs/fa/v2/guide/install/", excerpt: "", meta: { title: "نصب" }, filters: { section: ["راهنما"] } },
    { url: "javascript:alert(1)", excerpt: "", meta: { title: "بد" } },
  ];

  for (const lang of ["fa", "ar"] as const) {
    const out = renderToString(search(chromeProps(lang)) as never);

    assert.ok(out.includes(`aria-label="${t(lang, "search")}"`), `${lang} dialog name`);
    assert.ok(out.includes(`placeholder="${t(lang, "search_placeholder")}"`), `${lang} field placeholder`);
    assert.ok(out.includes(`aria-label="${t(lang, "search_close")}"`), `${lang} close name`);
    assert.ok(out.includes(`<label class="search-label" for="search-input">${t(lang, "search")}</label>`));
    assert.ok(out.includes(`aria-label="${t(lang, "search")}"`), `${lang} listbox name`);
    assert.ok(out.includes(`data-search-lang="${lang}"`));
    assert.ok(out.includes(`data-search-empty="${patternOf(lang, "search_results_empty")}"`));
    assert.ok(out.includes(`data-search-count-one="${patternOf(lang, "search_count_one")}"`));
    assert.ok(out.includes(`data-search-other-section="${t(lang, "search_other_section")}"`));

    // An input that states a direction states a safe one; the search field is a text field and
    // stays associated with its label in either direction.
    for (const [, attrs] of out.matchAll(/<input\b([^>]*)>/g)) {
      const dir = /dir="([^"]+)"/.exec(attrs ?? "")?.[1];
      if (dir !== undefined) assert.ok(dir === "ltr" || dir === "auto", `${lang} input dir ${dir}`);
    }

    const list = optionList(records, [], { otherSection: t(lang, "search_other_section") });
    assert.deepEqual(
      list.groups.map((group) => group.heading),
      ["راهنما", t(lang, "search_other_section")],
      `${lang} group headings`,
    );
    assert.equal(list.rows[0]?.href, "/docs/fa/v2/guide/install/");
    assert.equal(list.rows[1]?.href, undefined, "an unsafe index URL is not a link");
    assert.equal(safeHref("javascript:alert(1)"), undefined);
    assert.equal(safeHref("data:text/html,x"), undefined);
    assert.equal(safeHref("/docs/fa/v2/guide/install/"), "/docs/fa/v2/guide/install/");
  }
});

test("the variables form keeps localized names and working associations on an RTL page", () => {
  for (const lang of ["fa", "ar"] as const) {
    const page = pageWith(lang);
    const out = formFor(page);
    assert.ok(out, `${lang} form rendered`);

    assert.ok(out.includes(`>${t(lang, "variables_form_legend")}</legend>`));
    assert.ok(out.includes(`>${t(lang, "variables_form_hint")}</p>`));
    assert.ok(out.includes(`>${t(lang, "variables_form_reset")}</button>`));
    const hintId = /id="([^"]+-hint)"/.exec(out)?.[1];
    assert.ok(hintId, `${lang} hint id`);

    // Every label points at its own input, and every input is described by the localized hint.
    const ids = [...out.matchAll(/\bid="([^"]*)"/g)].map((match) => match[1]!);
    assert.equal(new Set(ids).size, ids.length, `${lang} ids stay unique`);
    for (const [, id] of out.matchAll(/<label class="variables-form-label" for="([^"]+)"/g)) {
      assert.ok(ids.includes(id!), `${lang} label for ${id} resolves`);
      assert.match(out, new RegExp(`<input class="variables-form-input" id="${id}"`));
    }
    assert.equal([...out.matchAll(new RegExp(`aria-describedby="${hintId}"`, "g"))].length, 2);

    // Technical values are carried through unchanged, never rewritten by the page direction.
    assert.match(out, /name="api_key" type="text" value="YOUR_KEY" placeholder="YOUR_KEY"/);
    assert.match(out, /value="https:\/\/api\.example\.com" placeholder="https:\/\/api\.example\.com"/);

    for (const [, attrs] of out.matchAll(/<input\b([^>]*)>/g)) {
      const dir = /dir="([^"]+)"/.exec(attrs ?? "")?.[1];
      if (dir !== undefined) assert.ok(dir === "ltr" || dir === "auto", `${lang} input dir ${dir}`);
    }
  }
});

test("an unsupported language falls back to English and reports it once", () => {
  const english = stringsOf("en");
  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      assert.equal(t("nl", "search"), english.search);
      assert.equal(t("nl", "search"), english.search);
      assert.equal(patternOf("nl", "search_results_empty"), english.search_results_empty);
    }),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /no "nl" catalog/);
  assert.deepEqual(withNodeEnv("production", () => warningsFrom(() => t("nl", "search"))), []);
});

test("a key missing from a shipped catalog falls back to English, and a missing placeholder stays visible", () => {
  const english = stringsOf("en");
  const faTable = stringsOf("fa") as Record<string, string>;
  const key = "search_results_failed";
  const saved = faTable[key];
  assert.ok(saved);

  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      // The shipped catalog is complete, so the English fallback is exercised by removing one key
      // for the duration of the call; the catalog is restored before anything else can read it.
      delete faTable[key];
      try {
        assert.equal(t("fa", key), english[key]);
      } finally {
        faTable[key] = saved;
      }
    }),
  );
  assert.ok(warnings.some((warning) => /"search_results_failed" is missing from fa; using en/.test(warning)), warnings.join("\n"));

  // The shipped catalogs are complete, so no key silently depends on that fallback.
  for (const lang of ["fa", "ar"] as const) {
    assert.deepEqual(Object.keys(english).filter((name) => !(name in stringsOf(lang))), [], `${lang} is missing keys`);
  }

  // An unknown key resolves to itself rather than to a blank string.
  const unknown = withNodeEnv("development", () => warningsFrom(() => t("en", "multilingual_journeys.no_such_key")));
  assert.equal(t("en", "multilingual_journeys.no_such_key"), "multilingual_journeys.no_such_key");
  assert.equal(unknown.length, 1);
  assert.match(unknown[0] ?? "", /unknown message key/);

  // A placeholder with no supplied value keeps its name and is reported once.
  const placeholder = withNodeEnv("development", () =>
    warningsFrom(() => {
      assert.equal(t("fa", "drift_finding"), "{n} مورد انحراف");
      assert.equal(t("ar", "search_results_empty"), "لا نتائج لـ «{query}».");
    }),
  );
  assert.equal(placeholder.length, 2, placeholder.join("\n"));
  assert.ok(placeholder.some((warning) => /"drift_finding" has no value for \{n\}/.test(warning)));
  assert.ok(placeholder.some((warning) => /"search_results_empty" has no value for \{query\}/.test(warning)));
});

test("a regional tag reads its primary catalog without a diagnostic", () => {
  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      assert.equal(t("fa-IR", "search"), stringsOf("fa").search);
      assert.equal(t("AR-eg", "versions"), stringsOf("ar").versions);
      assert.equal(t("en-GB", "search"), stringsOf("en").search);
      assert.equal(patternOf("fa-IR", "search_count_one"), stringsOf("fa").search_count_one);
      assert.equal(t("fa-IR", "search_results_empty"), "نتیجه‌ای برای «{query}» پیدا نشد.");
    }),
  );
  assert.deepEqual(warnings, []);

  const page = pageWith("fa", { lang: "fa-IR" });
  const out = renderToString(versionSwitcher({ ...chromeProps("fa"), page }) as never);
  assert.ok(out.includes(`aria-label="${stringsOf("fa").versions}"`), "a regional page reads its primary catalog");
});

test("bidi authoring: technical runs isolate, navigation stays logical, and only movement arrows mirror", () => {
  const rtl = readFileSync(new URL("../styles/rtl.css", import.meta.url), "utf8");
  const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, " ");
  const source = strip(rtl);
  const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));

  // Technical inline content and blocks are left-to-right islands, but an authored dir wins.
  const technical = blocks.filter((block) => /direction:\s*ltr/.test(block.body) && block.selector.includes("pre"));
  assert.ok(technical.length > 0, "rtl.css gives technical runs a direction");
  for (const block of technical) {
    assert.match(block.body, /unicode-bidi:\s*isolate/);
    assert.match(block.selector, /:not\(\[dir\]\)/);
    assert.match(block.selector, /\[dir="rtl"\]/);
    assert.match(block.selector, /:lang\(fa\)/);
    assert.match(block.selector, /:lang\(ar\)/);
    for (const element of ["code", "kbd", "samp", "var"]) {
      assert.ok(block.selector.includes(element), `the technical rule omits ${element}`);
    }
  }

  // The mono face is a separate rule, so an authored dir keeps the face but not the direction.
  const mono = blocks.find((block) => block.body.includes("font-family: var(--type-font-mono)"));
  assert.ok(mono, "rtl.css gives technical content the mono face");
  for (const element of ["code", "kbd", "samp", "var"]) {
    assert.ok(mono.selector.includes(element), `the mono rule omits ${element}`);
  }
  assert.doesNotMatch(mono.selector, /:not\(\[dir\]\)/);

  // Any authored direction is an island, and the rule never overrules the direction itself.
  const islands = blocks.find((block) => block.selector.includes('[dir="auto"]') && /unicode-bidi:\s*isolate/.test(block.body));
  assert.ok(islands, "rtl.css isolates dir=auto/ltr/rtl islands");
  assert.ok(islands.selector.includes('[dir="ltr"]') && islands.selector.includes('[dir="rtl"]'));
  assert.doesNotMatch(islands.body, /(?:^|;)\s*direction\s*:/);

  const css = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
  const pager = css("../chrome/pager/style.css");
  const breadcrumb = css("../chrome/breadcrumb/style.css");
  const sections = css("../chrome/section-tabs/style.css");
  const sidebar = css("../chrome/sidebar/style.css");
  const code = css("../components/code/style.css");

  // The navigation affords the reading direction: its arrows mirror, its layout does not flip.
  assert.match(pager, /\[dir="rtl"\] \.pager-arrow \{\n {2}transform: scaleX\(-1\);\n\}/);
  assert.match(breadcrumb, /\[dir="rtl"\] \.breadcrumb-sep \{\n {2}transform: scaleX\(-1\);\n\}/);
  assert.match(pager, /text-align:\s*end/);
  assert.match(sections, /\.section-tab \{[\s\S]*?unicode-bidi: isolate/);

  // Technical blocks scroll and align with the logical edges, never the physical ones.
  assert.match(code, /\.code \{[\s\S]*?direction: ltr;[\s\S]*?unicode-bidi: isolate;[\s\S]*?text-align: start/);
  assert.match(code, /overflow-x:\s*auto/);
  assert.match(code, /padding-inline:/);

  /** Every `property: value` declaration in a stylesheet; at-rule conditions are not declarations. */
  const declarationsOf = (text: string): { property: string; value: string }[] =>
    [...strip(text).matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
      property: match[1] ?? "",
      value: (match[2] ?? "").trim(),
    }));
  const physical = (property: string, value: string): boolean =>
    /^(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right|top|bottom)$/.test(property) ||
    /^border-(?:top|bottom)-(?:left|right)-radius$/.test(property) ||
    /^(?:left|right|top|bottom)$/.test(property) ||
    /^(?:min-|max-)?(?:width|height)$/.test(property) ||
    (/^(?:text-align|float|clear)$/.test(property) && /^(?:left|right)$/.test(value));

  for (const [path, text] of [
    ["chrome/pager/style.css", pager],
    ["chrome/breadcrumb/style.css", breadcrumb],
    ["chrome/section-tabs/style.css", sections],
    ["chrome/sidebar/style.css", sidebar],
  ] as const) {
    const found = declarationsOf(text).filter((declaration) => physical(declaration.property, declaration.value));
    assert.deepEqual(found, [], `${path} uses a physical direction property`);
  }
  for (const text of [pager, breadcrumb, sections, sidebar]) {
    assert.match(
      text,
      /(?:padding|margin|inset|border)-(?:inline|block)|(?:inline|block)-(?:size|start|end)/,
      "a navigation style has no logical property",
    );
  }

  // Symbols that carry their own meaning keep their orientation: only pager/breadcrumb/home arrows mirror.
  assert.doesNotMatch(css("../components/version-diff/style.css"), /scaleX/);
  assert.doesNotMatch(css("../components/figure/style.css"), /scaleX/);
  assert.match(css("../components/figure/style.css"), /text-align: start/);
});
