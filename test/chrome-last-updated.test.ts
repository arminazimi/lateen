import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import { stringsOf } from "../i18n/index.ts";
import lastUpdated, {
  CLASS,
  CONTRIBUTORS_CLASS,
  DATE_CLASS,
  MAX_CONTRIBUTORS,
  asOfOf,
  contributorsOf,
  dateOf,
  isoDate,
  localeOf,
  relativeDate,
} from "../chrome/last-updated/index.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };
const PAGE_URL = "/example/guide/install/";

const trail: Trail = [];
const pager: Pager = {};

function configFor(lang: string): SiteConfig {
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
    theme: { options: {} },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

function pageWith(frontMatter: Record<string, unknown> = {}, lang = "en"): Page {
  return {
    url: PAGE_URL,
    source: pos,
    frontMatter: { title: "Install", ...frontMatter },
    title: "Install",
    lang,
    dir: lang === "fa" || lang === "ar" ? "rtl" : "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(page: Page, data: Readonly<Record<string, unknown>> = {}): ChromeProps {
  const site: Site = { config: configFor(page.lang), pages: [page], nav: {}, data };
  return { site, page, trail, pager };
}

/** The line's HTML, or `null` when it renders nothing. */
function render(page: Page, data: Readonly<Record<string, unknown>> = {}): string | null {
  const node = lastUpdated(props(page, data));
  return node === null ? null : renderToString(node as never);
}

/** Build data with an as-of date, as a site writes `_data/build.yml`. */
function build(date: string): Readonly<Record<string, unknown>> {
  return { build: { date } };
}

/** A reviewers record keyed by page URL, as a site writes `_data/reviewers.yml`. */
function reviewers(entry: Record<string, unknown>, extra: Record<string, unknown> = {}): Readonly<Record<string, unknown>> {
  return { reviewers: { [PAGE_URL]: entry, ...extra } };
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("a front matter date shows the relative date from the build's as-of date", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }), build("2026-03-06"));

  assert.ok(out);
  assert.match(
    out,
    new RegExp(
      `<p class="${CLASS}"><span class="${DATE_CLASS}">Updated <time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026">2 days ago</time></span></p>`,
    ),
  );
});

test("without an as-of date the absolute date is shown, with the same tooltip", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }));

  assert.ok(out);
  assert.match(out, /Updated <time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026">March 4, 2026<\/time>/);
  assert.doesNotMatch(out, /days ago/);
});

test("the as-of date may come from the reviewers data instead", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }), { reviewers: { asOf: "2026-03-06" } });

  assert.ok(out);
  assert.match(out, />2 days ago<\/time>/);
});

test("the date falls back from last_modified_at to updated, then to the reviewers entry", () => {
  const updated = render(pageWith({ last_modified_at: "2026-03-01", updated: "2026-03-04" }), build("2026-03-06"));
  assert.ok(updated);
  assert.match(updated, /datetime="2026-03-01"/);

  const fromUpdated = render(pageWith({ updated: "2026-03-04" }), build("2026-03-06"));
  assert.ok(fromUpdated);
  assert.match(fromUpdated, /datetime="2026-03-04"/);

  const reviewed = render(pageWith(), reviewers({ date: "2026-03-04" }));
  assert.ok(reviewed);
  assert.match(reviewed, /datetime="2026-03-04"/);
});

test("a Date from the front matter parser reads as its ISO calendar date", () => {
  const out = render(pageWith({ last_modified_at: new Date("2026-03-04T12:00:00Z") }), build("2026-03-06"));

  assert.ok(out);
  assert.match(out, /datetime="2026-03-04"/);
});

test("contributors come from author and the contributors array, sorted and deduplicated", () => {
  const data = reviewers({
    date: "2026-03-04",
    author: "Grace Hopper",
    contributors: ["Ada Lovelace", "Grace Hopper", "Barbara Liskov", "Margaret Hamilton", "  Ada Lovelace  "],
  });
  const out = render(pageWith(), data);

  assert.ok(out);
  assert.match(out, new RegExp(`<span class="${CONTRIBUTORS_CLASS}">Contributors: Ada Lovelace, Barbara Liskov, Grace Hopper</span>`));
  assert.doesNotMatch(out, /Margaret Hamilton/);
});

test("contributors alone still render a line, without a date", () => {
  const out = render(pageWith(), reviewers({ author: "Ada Lovelace" }));

  assert.ok(out);
  assert.match(out, new RegExp(`^<p class="${CLASS}"><span class="${CONTRIBUTORS_CLASS}">Contributors: Ada Lovelace</span></p>$`));
  assert.doesNotMatch(out, /<time/);
});

test("the line renders nothing when both the date and the contributors are missing", () => {
  assert.equal(render(pageWith()), null);
  assert.equal(render(pageWith(), { reviewers: { "/other/": { date: "2026-03-04", author: "Ada" } } }), null);
  assert.equal(render(pageWith(), reviewers({ date: "2026-02-30" })), null);
});

test("dateOf, asOfOf, and contributorsOf read the data defensively", () => {
  const page = pageWith();
  const site = (data: Readonly<Record<string, unknown>>) => props(page, data).site;

  assert.equal(dateOf(page, site(reviewers({ date: "2026-03-04" }))), "2026-03-04");
  assert.equal(dateOf(page, site(reviewers({ date: "2026-02-30" }))), undefined);
  assert.equal(dateOf(page, site({ reviewers: { [PAGE_URL]: "2026-03-04" } })), undefined);
  assert.equal(dateOf(page, site({ reviewers: [] })), undefined);

  assert.equal(asOfOf(site(build("2026-03-06"))), "2026-03-06");
  assert.equal(asOfOf(site({ build: { asOf: "2026-03-06" } })), "2026-03-06");
  assert.equal(asOfOf(site({ build: "2026-03-06" })), "2026-03-06");
  assert.equal(asOfOf(site({ reviewers: { asOf: "2026-03-06" } })), "2026-03-06");
  assert.equal(asOfOf(site({})), undefined);

  assert.deepEqual(contributorsOf(site(reviewers({ author: " A ", contributors: ["A", "B", 7, ""] })), PAGE_URL), ["A", "B"]);
  assert.deepEqual(contributorsOf(site({}), PAGE_URL), []);
});

test("relativeDate is pure: it measures from the as-of date, never the clock", () => {
  assert.equal(relativeDate("2026-03-04", "2026-03-06", "en"), "2 days ago");
  assert.equal(relativeDate("2026-03-06", "2026-03-06", "en"), "today");
  assert.equal(relativeDate("2026-03-08", "2026-03-06", "en"), "in 2 days");
  assert.equal(relativeDate("2026-03-04", "2026-03-06", "en"), relativeDate("2026-03-04", "2026-03-06", "en"));
  assert.equal(relativeDate("2026-02-30", "2026-03-06", "en"), undefined);
  assert.equal(relativeDate("2026-03-04", "nope", "en"), undefined);
});

test("the relative date and the calendar are localised for Persian and Arabic", () => {
  const fa = render(pageWith({ last_modified_at: "2026-03-04" }, "fa"), {
    ...build("2026-03-06"),
    reviewers: { [PAGE_URL]: { author: "Ada Lovelace" } },
  });
  assert.ok(fa);
  assert.ok(fa.includes(stringsOf("fa").updated ?? ""));
  assert.match(fa, /پریروز/);
  assert.match(fa, /۱۴۰۴/);
  assert.match(fa, /مشارکت‌کنندگان:/);

  const ar = render(pageWith({ last_modified_at: "2026-03-04" }, "ar"), {
    ...build("2026-03-06"),
    reviewers: { [PAGE_URL]: { author: "Ada Lovelace" } },
  });
  assert.ok(ar);
  assert.ok(ar.includes(stringsOf("ar").updated ?? ""));
  assert.match(ar, /أول أمس/);
  assert.match(ar, /١٤٤٧/);
  assert.match(ar, /المساهمون:/);

  assert.equal(localeOf("en-US"), "en");
  assert.equal(localeOf("fa-IR"), "fa");
  assert.equal(localeOf("ar-SA"), "ar");
  assert.equal(localeOf("de"), "en");
});

test("contributor names are escaped, never markup", () => {
  const out = render(pageWith(), reviewers({ author: '<script>alert("x")</script>' }));

  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script>alert\(&quot;x&quot;\)&lt;\/script>/);
});

test("isoDate reads real ISO dates and nothing else", () => {
  assert.equal(isoDate("2026-03-04"), "2026-03-04");
  assert.equal(isoDate("2026-03-04T10:00:00Z"), "2026-03-04");
  assert.equal(isoDate(new Date("2026-03-04T00:00:00Z")), "2026-03-04");
  assert.equal(isoDate(new Date("not a date")), undefined);
  assert.equal(isoDate("2026-02-30"), undefined);
  assert.equal(isoDate("March 4"), undefined);
  assert.equal(isoDate(20260304), undefined);
  assert.equal(isoDate(undefined), undefined);
});

test("MAX_CONTRIBUTORS is three", () => {
  assert.equal(MAX_CONTRIBUTORS, 3);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/last-updated/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css uses logical properties", () => {
  const css = readFileSync(new URL("../chrome/last-updated/style.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
