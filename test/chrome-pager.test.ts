import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, NavLink, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import pager from "../chrome/pager/index.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

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

const trail: Trail = [];

const page: Page = {
  url: "/example/guide/install/",
  source: pos,
  frontMatter: { title: "Install" },
  title: "Install",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const prev: NavLink = { title: "Overview", url: "/example/guide/" };
const next: NavLink = { title: "Configure", url: "/example/guide/configure/" };

function props(links: Pager, lang = "en"): ChromeProps {
  const localized: Page = { ...page, lang, dir: lang === "en" ? "ltr" : "rtl" };
  const site: Site = { config, pages: [localized], nav: {}, data: {} };
  return { site, page: localized, trail, pager: links };
}

function output(links: Pager, lang = "en"): string {
  const node = pager(props(links, lang));
  return node === null ? "" : renderToString(node as never);
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

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const MESSAGES = {
  en: { pager: "Previous and next", previous: "Previous", next: "Next" },
  fa: { pager: "صفحهٔ قبل و بعد", previous: "قبلی", next: "بعدی" },
  ar: { pager: "الصفحة السابقة والتالية", previous: "السابق", next: "التالي" },
} as const;

test("renders nothing when the page has neither a previous nor a next page", () => {
  assert.equal(output({}), "");
});

test("links previous and next with rel=prev and rel=next, previous first", () => {
  const out = output({ prev, next });

  assert.match(out, /^<nav class="pager" aria-label="Previous and next">/);
  assert.match(out, /<a class="pager-link pager-prev" href="\/example\/guide\/" rel="prev">/);
  assert.match(out, /<a class="pager-link pager-next" href="\/example\/guide\/configure\/" rel="next">/);
  assert.match(out, /<span class="pager-title"><bdi>Overview<\/bdi><\/span>/);
  assert.match(out, /<span class="pager-title"><bdi>Configure<\/bdi><\/span>/);
  assert.ok(out.indexOf("pager-prev") < out.indexOf("pager-next"));
});

test("shows only the card that exists, in the next column", () => {
  const onlyPrev = output({ prev });
  assert.match(onlyPrev, /rel="prev"/);
  assert.doesNotMatch(onlyPrev, /rel="next"/);
  assert.doesNotMatch(onlyPrev, /pager-next/);

  const onlyNext = output({ next });
  assert.match(onlyNext, /<a class="pager-link pager-next" href="\/example\/guide\/configure\/" rel="next">/);
  assert.doesNotMatch(onlyNext, /rel="prev"/);
});

test("the landmark and card labels follow the page language, with no missing-message diagnostics", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    for (const [lang, messages] of Object.entries(MESSAGES)) {
      let out = "";
      assert.deepEqual(
        warningsFrom(() => {
          out = output({ prev, next }, lang);
        }),
        [],
        `${lang} reads only shipped messages`,
      );
      assert.match(out, new RegExp(`<nav class="pager" aria-label="${messages.pager}">`));
      assert.ok(out.includes(`</svg>${messages.previous}</span>`), `${lang} previous label`);
      assert.ok(out.includes(`${messages.next}<svg`), `${lang} next label`);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("a regional page tag reads its primary catalog without a diagnostic", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    for (const [lang, messages] of [
      ["fa-IR", MESSAGES.fa],
      ["AR-eg", MESSAGES.ar],
      ["en-GB", MESSAGES.en],
      ["fa_IR", MESSAGES.fa],
    ] as const) {
      let out = "";
      assert.deepEqual(
        warningsFrom(() => {
          out = output({ prev, next }, lang);
        }),
        [],
        `${lang} reads its primary catalog`,
      );
      assert.match(out, new RegExp(`aria-label="${messages.pager}"`));
      assert.ok(out.includes(messages.previous));
      assert.ok(out.includes(messages.next));
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("a mixed-direction title is isolated and does not reorder its own direction label", () => {
  const mixed = { title: "راهنمای API و نصب", url: "/example/guide/api/" };
  const rtlTitle = { title: "دليل التثبيت", url: "/example/guide/install-ar/" };

  const english = output({ prev, next: mixed });
  assert.match(english, /<span class="pager-title"><bdi>راهنمای API و نصب<\/bdi><\/span>/);
  const labels = [...english.matchAll(/<span class="pager-label">([\s\S]*?)<\/span>/g)].map((match) => match[1] ?? "");
  assert.equal(labels.length, 2);
  assert.ok(labels[0]?.endsWith("Previous"));
  assert.ok(labels[1]?.startsWith("Next"));
  assert.ok(labels.every((label) => !/[\u0590-\u08ff]/.test(label)), "no title text leaks into a direction label");

  const persian = output({ prev: rtlTitle, next: mixed }, "fa");
  assert.match(persian, /<bdi>دليل التثبيت<\/bdi>/);
  assert.match(persian, /<bdi>راهنمای API و نصب<\/bdi>/);
  assert.ok(persian.includes("</svg>قبلی</span>"));
  assert.ok(persian.includes("بعدی<svg"));
});

test("escaping keeps titles as text and URLs as attributes", () => {
  const hostile: NavLink = { title: '<script>alert("x")</script>', url: '/a?x=1&y="2"' };
  const out = output({ next: hostile });

  assert.match(out, /<span class="pager-title"><bdi>&lt;script>alert\(&quot;x&quot;\)&lt;\/script><\/bdi><\/span>/);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /href="\/a\?x=1&amp;y=&quot;2&quot;"/);
});

test("an empty title leaves an empty, deterministic title element", () => {
  const out = output({ prev: { title: "", url: "/example/guide/" } });
  assert.match(out, /<span class="pager-title"><bdi><\/bdi><\/span>/);
  assert.doesNotMatch(out, /undefined/);
});

test("arrows are decorative, mirror under dir=rtl in style.css, and do not change the logical order", () => {
  const ltr = output({ prev, next });
  assert.equal(ltr.match(/<svg class="pager-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/g)?.length, 2);

  const rtl = output({ prev, next }, "fa");
  assert.ok(rtl.indexOf('rel="prev"') < rtl.indexOf('rel="next"'));
  assert.equal(rtl.match(/aria-hidden="true" focusable="false"/g)?.length, 2);

  const css = readFileSync(new URL("../chrome/pager/style.css", import.meta.url), "utf8");
  assert.match(css, /\[dir="rtl"\] \.pager-arrow \{\n {2}transform: scaleX\(-1\);\n\}/);
  assert.match(css, /\.pager-next \{\n {2}grid-column: 2;\n {2}text-align: end;\n\}/);
});

test("both cards are plain links, reachable and ordered for keyboard navigation", () => {
  const out = output({ prev, next });
  const links = out.match(/<a [^>]*>/g) ?? [];

  assert.equal(links.length, 2);
  assert.equal(links.filter((link) => / href="[^"]+"/.test(link)).length, 2);
  assert.ok(links.every((link) => !/tabindex|role=|onclick|onkeydown/.test(link)));
  assert.ok(out.indexOf('class="pager-link pager-prev"') < out.indexOf('class="pager-link pager-next"'));
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/pager/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
