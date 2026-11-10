import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { languages, stringsOf } from "../i18n/index.ts";
import doc from "../layouts/doc.ts";
import readingTime, {
  PLURAL_CATEGORIES,
  TIME_KEY_PREFIX,
  WORDS_KEY_PREFIX,
  countFrom,
  countsFor,
  numberFrom,
  pluralCategory,
  showWordsOf,
  type ReadingTimeProps,
} from "../components/reading-time/index.ts";

type RenderOptions = {
  readonly lang?: string;
  readonly url?: string;
  readonly data?: unknown;
};

/** Render the chip the way the render host calls it: directive props, the page, and the site data. */
function render(props: ReadingTimeProps, options: RenderOptions = {}): string | null {
  const input = {
    props,
    html: "",
    page: { url: options.url ?? "/guide/install/", lang: options.lang ?? "en" },
    site: { data: options.data === undefined ? {} : { "reading-time": options.data } },
  } as unknown as ComponentProps<ReadingTimeProps>;
  const node = readingTime(input);
  return node === null ? null : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);
const css = readFileSync(new URL("../components/reading-time/style.css", import.meta.url), "utf8");

test("default export is the component and the plural prefixes are stable", () => {
  assert.equal(typeof readingTime, "function");
  assert.equal(TIME_KEY_PREFIX, "reading_time_");
  assert.equal(WORDS_KEY_PREFIX, "reading_words_");
  assert.deepEqual([...PLURAL_CATEGORIES], ["zero", "one", "two", "few", "many", "other"]);
});

test("reads the page's numbers from the engine's array in Site.data", () => {
  const data = [
    { url: "/guide/other/", words: 999, minutes: 9 },
    { url: "/guide/install/", words: 600, minutes: 3 },
  ];
  const out = render({}, { data });
  assert.ok(out);
  assert.match(out, /<p class="reading-time" data-minutes="3"><span class="reading-time-minutes">3 minutes read<\/span><\/p>/);
  assert.doesNotMatch(out, /reading-time-words/);
});

test("reads a pages list and a pages map keyed by the page URL", () => {
  const list = render({}, { data: { pages: [{ url: "/guide/install/", words: 4, minutes: 1 }] } });
  assert.ok(list);
  assert.match(list, />1 minute read</);

  const map = render({}, { data: { pages: { "/guide/install/": { words: 4, minutes: 2 } } } });
  assert.ok(map);
  assert.match(map, /data-minutes="2"/);
  assert.match(map, />2 minutes read</);
});

test("the URL must match exactly, including base, and pages without an entry render nothing", () => {
  const data = [{ url: "/base/guide/install/", words: 600, minutes: 3 }];
  assert.equal(render({}), null);
  assert.equal(render({}, { data }), null, "the page URL differs from the stored one");
  assert.ok(render({}, { url: "/base/guide/install/", data }), "the stored URL including base matches");
});

test("directive props override the stored minutes and words for a manual chip", () => {
  const data = [{ url: "/guide/install/", words: 600, minutes: 3 }];
  const out = render({ minutes: "1", words: "7", showWords: "" }, { data });
  assert.ok(out);
  assert.match(out, /data-minutes="1"/);
  assert.match(out, /data-words="7"/);
  assert.match(out, />1 minute read</);
  assert.match(out, />7 words</);
  assert.equal(countFrom("1"), 1);
  assert.equal(countFrom(7), 7);
  assert.equal(countFrom("-1"), undefined);
  assert.equal(countFrom("x"), undefined);
  assert.equal(numberFrom("2.5"), 2.5);
});

test("English chooses one and other", () => {
  assert.equal(pluralCategory("en", 0), "other");
  assert.equal(pluralCategory("en", 1), "one");
  assert.equal(pluralCategory("en", 2), "other");
  assert.match(render({ minutes: 1 })!, />1 minute read</);
  assert.match(render({ minutes: 2 })!, />2 minutes read</);
  assert.equal(render({ minutes: 0 }), null);
});

test("Persian uses one for 0 and 1 and other above that, and the noun does not change", () => {
  assert.equal(pluralCategory("fa", 0), "one");
  assert.equal(pluralCategory("fa", 1), "one");
  assert.equal(pluralCategory("fa", 2), "other");
  assert.equal(pluralCategory("fa-IR", 5), "other");
  const one = stringsOf("fa")[`${TIME_KEY_PREFIX}one`]!.replace("{minutes}", "1");
  const many = stringsOf("fa")[`${TIME_KEY_PREFIX}other`]!.replace("{minutes}", "5");
  assert.ok(render({ minutes: 1 }, { lang: "fa" })!.includes(`>${one}<`));
  assert.ok(render({ minutes: 5 }, { lang: "fa" })!.includes(`>${many}<`));
});

test("Arabic uses zero, one, two, few, many, and other", () => {
  assert.equal(pluralCategory("ar", 0), "zero");
  const cases: Array<[number, string]> = [
    [1, "one"],
    [2, "two"],
    [3, "few"],
    [10, "few"],
    [11, "many"],
    [99, "many"],
    [100, "other"],
  ];
  for (const [count, category] of cases) {
    assert.equal(pluralCategory("ar", count), category, `${count} is ${category}`);
    const expected = stringsOf("ar")[`${TIME_KEY_PREFIX}${category}`]!.replace("{minutes}", String(count));
    assert.ok(render({ minutes: count }, { lang: "ar" })!.includes(`>${expected}<`), `${count} says "${expected}"`);
  }
});

test("the word count is shown only with showWords, with its own plural form", () => {
  const data = [{ url: "/guide/install/", words: 1, minutes: 2 }];
  assert.doesNotMatch(render({}, { data })!, /reading-time-words/);
  assert.match(render({ showWords: "" }, { data })!, />1 word</);
  assert.match(render({ showWords: "true" }, { data })!, />1 word</);
  assert.match(
    render({ words: 5, showWords: "" }, { data })!,
    />2 minutes read<\/span><span class="reading-time-words">5 words</,
  );
  for (const off of ["false", "no", "0", "off"]) {
    assert.equal(showWordsOf(off), false, `${off} is off`);
    assert.doesNotMatch(render({ showWords: off }, { data })!, /reading-time-words/);
  }
  assert.equal(showWordsOf(undefined), false);
  assert.equal(showWordsOf(""), true);
});

test("a missing entry, zero minutes, or malformed data renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({}, { data: {} }), null);
  assert.equal(render({}, { data: [] }), null);
  assert.equal(render({}, { data: [{ url: "/guide/install/", words: 0, minutes: 0 }] }), null);
  assert.equal(render({}, { data: [{ url: "/guide/install/", words: "x", minutes: 3 }] }), null);
  assert.equal(render({}, { data: [{ url: "/guide/install/", words: 3, minutes: -1 }] }), null);
  assert.equal(render({}, { data: { pages: 7 } }), null);
  assert.equal(countsFor(undefined, "/guide/install/"), undefined);
  assert.equal(countsFor([{ url: "/guide/install/", words: 1, minutes: 1 }], "/guide/install/")?.minutes, 1);
});

test("untrusted values are never written as markup", () => {
  const bad = '<img src=x onerror="alert(1)">';
  assert.equal(render({ minutes: bad }), null);
  const out = render({ minutes: bad, showWords: "" }, { data: [{ url: "/guide/install/", words: 2, minutes: 3 }] });
  assert.ok(out);
  assert.doesNotMatch(out, /<img/);
  assert.doesNotMatch(out, /onerror/);
  assert.match(out, />3 minutes read</);
});

test("every plural key exists in every language and keeps its placeholder", () => {
  for (const lang of languages) {
    const table = stringsOf(lang);
    for (const category of PLURAL_CATEGORIES) {
      assert.match(table[`${TIME_KEY_PREFIX}${category}`] ?? "", /\{minutes\}/, `${lang} time ${category}`);
      assert.match(table[`${WORDS_KEY_PREFIX}${category}`] ?? "", /\{words\}/, `${lang} words ${category}`);
    }
  }
});

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Run the build.</p>",
    markdown: "Run the build.",
    kind: "doc",
    ...overrides,
  };
}

function layoutProps(page: Page, data: Site["data"]): LayoutProps {
  const site: Site = { config: configWith(), pages: [page], nav: { main: [] }, data };
  return {
    site,
    page,
    trail: [],
    pager: { prev: { title: "Overview", url: "/guide/" }, next: { title: "Configure", url: "/guide/configure/" } },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

test("the doc layout places the chip between the title and the body", () => {
  const page = pageWith();
  const out = renderToString(
    doc(layoutProps(page, { "reading-time": [{ url: "/guide/install/", words: 400, minutes: 2 }] })) as never,
  );
  assert.match(
    out,
    /<h1>Install<\/h1><p class="reading-time" data-minutes="2"><span class="reading-time-minutes">2 minutes read<\/span><\/p><div class="doc-body">/,
  );
});

test("the doc layout leaves the chip out when there is no reading time", () => {
  const page = pageWith();
  const out = renderToString(doc(layoutProps(page, {})) as never);
  assert.match(out, /<h1>Install<\/h1><div class="doc-body">/);
  assert.doesNotMatch(out, /class="reading-time"/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(top|bottom)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});
