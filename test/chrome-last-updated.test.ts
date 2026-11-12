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
  UNAVAILABLE_CLASS,
  asOfOf,
  contributorsOf,
  dateOf,
  datesOf,
  evidenceOf,
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
      `<p class="${CLASS}"><span class="${DATE_CLASS}" data-date-source="source" data-date-status="valid">Updated <time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026"><bdi>2 days ago</bdi></time></span></p>`,
    ),
  );
});

test("without an as-of date the absolute date is shown, with the same tooltip", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }));

  assert.ok(out);
  assert.match(out, /<bdi>March 4, 2026<\/bdi><\/time>/);
  assert.doesNotMatch(out, /days ago/);
});

test("the as-of date may come from the reviewers data instead", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }), { reviewers: { asOf: "2026-03-06" } });

  assert.ok(out);
  assert.match(out, /><bdi>2 days ago<\/bdi><\/time>/);
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

test("a review date is labelled as a review, with the same accessible exact value", () => {
  const out = render(pageWith(), { ...reviewers({ date: "2026-03-04" }), ...build("2026-03-06") });

  assert.ok(out);
  assert.match(
    out,
    new RegExp(
      `<span class="${DATE_CLASS}" data-date-source="review" data-date-status="valid">Reviewed <time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026"><bdi>2 days ago</bdi></time></span>`,
    ),
  );
});

test("source and review dates show side by side, and a review on the source's day is dropped", () => {
  const both = render(pageWith({ last_modified_at: "2026-03-01" }), reviewers({ date: "2026-03-04" }));

  assert.ok(both);
  assert.match(both, /data-date-source="source" data-date-status="valid">Updated <time datetime="2026-03-01"/);
  assert.match(both, /data-date-source="review" data-date-status="valid">Reviewed <time datetime="2026-03-04"/);

  const sameDay = render(pageWith({ last_modified_at: "2026-03-04" }), reviewers({ date: "2026-03-04" }));
  assert.ok(sameDay);
  assert.equal([...sameDay.matchAll(/<time /g)].length, 1);
  assert.doesNotMatch(sameDay, /Reviewed/);
});

test("a date after the build's as-of date stays absolute, so bad data never reads as upcoming or fresh", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-08" }), build("2026-03-06"));

  assert.ok(out);
  assert.match(out, /title="March 8, 2026" aria-label="March 8, 2026"><bdi>March 8, 2026<\/bdi><\/time>/);
  assert.match(out, /data-date-status="future"/);
  assert.doesNotMatch(out, /in 2 days/);

  // A future review is evidence of a review date too, so it keeps its label and its exact value.
  const futureReview = render(pageWith({ last_modified_at: "2026-03-01" }), {
    ...reviewers({ date: "2026-03-08" }),
    ...build("2026-03-06"),
  });
  assert.ok(futureReview);
  assert.match(futureReview, /data-date-source="review" data-date-status="future">Reviewed/);
  assert.doesNotMatch(futureReview, /in 2 days/);
});

test("an explicitly malformed date is shown as unavailable evidence, never as a date", () => {
  const out = render(pageWith({ last_modified_at: "2026-02-30" }));

  assert.ok(out);
  assert.match(
    out,
    new RegExp(`<span class="${DATE_CLASS} ${UNAVAILABLE_CLASS}" data-date-source="source" data-date-status="invalid">`),
  );
  assert.match(out, new RegExp(`>${stringsOf("en").changelog_date_unknown ?? ""}</span>`));
  // The rejected value is neither a `<time>` element, nor a freshness claim, nor machine-readable provenance.
  assert.doesNotMatch(out, /<time|datetime=|Updated|2026-02-30|days? ago/);
});

test("a malformed review date says the review evidence is unusable without claiming a review", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }), reviewers({ date: "March 4" }));

  assert.ok(out);
  assert.match(out, /data-date-source="source" data-date-status="valid">Updated <time datetime="2026-03-04"/);
  assert.match(out, /data-date-source="review" data-date-status="invalid"/);
  assert.equal([...out.matchAll(/<time /g)].length, 1, "only the readable date is a time element");
  assert.doesNotMatch(out, /Reviewed|March 4(?!, 2026)/);
});

test("malformed evidence is distinguishable from evidence that was never supplied", () => {
  const page = pageWith();
  const site = (data: Readonly<Record<string, unknown>>) => props(page, data).site;

  assert.deepEqual(evidenceOf(page, site(reviewers({ author: "Ada Lovelace" }))).map((entry) => entry.status), [
    "absent",
    "absent",
  ]);

  const malformed = evidenceOf(pageWith({ last_modified_at: "2026-02-30" }), site(reviewers({ date: "not a date" })));
  assert.deepEqual(malformed, [
    { date: undefined, status: "invalid", source: "source" },
    { date: undefined, status: "invalid", source: "review" },
  ]);

  // Any value that is there but never reads as a calendar date is written-and-rejected evidence.
  for (const value of ["2026-02-30", "March 4", "not a date", true, 20260304, new Date("nope"), {}, []] as const) {
    assert.equal(evidenceOf(pageWith({ last_modified_at: value }), site({}))[0]?.status, "invalid", `${String(value)}`);
  }

  // Nothing an author meant to write — a missing key, an empty YAML field, a blank string — is absent.
  for (const value of [undefined, null, "", "   "] as const) {
    assert.equal(evidenceOf(pageWith({ last_modified_at: value, updated: value }), site({}))[0]?.status, "absent");
  }
  assert.equal(evidenceOf(pageWith(), site({ reviewers: { [PAGE_URL]: {} } }))[1]?.status, "absent");
  assert.equal(evidenceOf(pageWith(), site({}))[1]?.status, "absent");
});

test("the as-of day splits valid from future evidence, and both keep their exact value", () => {
  const page = pageWith({ last_modified_at: "2026-03-04" });
  const review = reviewers({ date: "2026-03-09" });
  const site = (data: Readonly<Record<string, unknown>>) => props(page, data).site;

  assert.equal(evidenceOf(page, site({ ...review, ...build("2026-03-06") }))[0]?.status, "valid");
  assert.equal(evidenceOf(page, site({ ...review, ...build("2026-03-04") }))[0]?.status, "valid");
  assert.equal(evidenceOf(page, site(review))[0]?.status, "valid", "with no as-of date nothing is future");

  const [source, reviewEvidence] = evidenceOf(page, site({ ...review, ...build("2026-03-06") }));
  assert.deepEqual(source, { date: "2026-03-04", status: "valid", source: "source" });
  assert.deepEqual(reviewEvidence, { date: "2026-03-09", status: "future", source: "review" });
});

test("a malformed value in the preferred key still falls back to a readable one", () => {
  const page = pageWith({ last_modified_at: "2026-02-30", updated: "2026-03-04" });
  const out = render(page, build("2026-03-06"));

  assert.ok(out);
  assert.match(out, /><bdi>2 days ago<\/bdi><\/time>/);
  assert.doesNotMatch(out, new RegExp(UNAVAILABLE_CLASS));
  assert.deepEqual(evidenceOf(page, props(page, build("2026-03-06")).site)[0], {
    date: "2026-03-04",
    status: "valid",
    source: "source",
  });
});

test("an unreadable date never becomes a relative claim", () => {
  const invalidReview = render(pageWith({ last_modified_at: "2026-03-04" }), reviewers({ date: "2026-02-31" }));
  assert.ok(invalidReview);
  assert.equal([...invalidReview.matchAll(/<time /g)].length, 1);
  assert.doesNotMatch(invalidReview, /Reviewed|2026-02-31/);

  const invalidOnly = render(pageWith({ last_modified_at: "2026-02-30" }), build("2026-03-06"));
  assert.ok(invalidOnly);
  assert.doesNotMatch(invalidOnly, /<time|days? ago/);
});

test("contributors come from author and the contributors array, sorted and deduplicated", () => {
  const data = reviewers({
    date: "2026-03-04",
    author: "Grace Hopper",
    contributors: ["Ada Lovelace", "Grace Hopper", "Barbara Liskov", "Margaret Hamilton", "  Ada Lovelace  "],
  });
  const out = render(pageWith(), data);

  assert.ok(out);
  assert.match(
    out,
    new RegExp(
      `<span class="${CONTRIBUTORS_CLASS}">Contributors: <bdi>Ada Lovelace</bdi>, <bdi>Barbara Liskov</bdi>, <bdi>Grace Hopper</bdi></span>`,
    ),
  );
  assert.doesNotMatch(out, /Margaret Hamilton/);
});

test("contributors alone still render a line, without a date", () => {
  const out = render(pageWith(), reviewers({ author: "Ada Lovelace" }));

  assert.ok(out);
  assert.match(
    out,
    new RegExp(
      `^<p class="${CLASS}"><span class="${CONTRIBUTORS_CLASS}">Contributors: <bdi>Ada Lovelace</bdi></span></p>$`,
    ),
  );
  assert.doesNotMatch(out, /<time/);
});

test("the line renders nothing when no date was written and there are no contributors", () => {
  assert.equal(render(pageWith()), null);
  assert.equal(render(pageWith(), { reviewers: { "/other/": { date: "2026-03-04", author: "Ada" } } }), null);
  assert.equal(render(pageWith(), reviewers({ author: "  " })), null);
  assert.equal(render(pageWith({ last_modified_at: "" }), reviewers({ date: null })), null);

  // Written-but-unreadable evidence is not "nothing": the page says the date is unavailable instead.
  const out = render(pageWith(), reviewers({ date: "2026-02-30" }));
  assert.ok(out);
  assert.match(
    out,
    new RegExp(`^<p class="${CLASS}"><span class="${DATE_CLASS} ${UNAVAILABLE_CLASS}" data-date-source="review"`),
  );
});

test("rejected evidence from both kinds stays separate, and a same-day review is still a duplicate", () => {
  const both = render(pageWith({ last_modified_at: "not a date" }), reviewers({ date: "also not a date" }));
  assert.ok(both);
  assert.equal([...both.matchAll(new RegExp(UNAVAILABLE_CLASS, "g"))].length, 2);
  assert.match(both, /data-date-source="source" data-date-status="invalid"/);
  assert.match(both, /data-date-source="review" data-date-status="invalid"/);
  assert.doesNotMatch(both, /<time|Updated|Reviewed/);

  const sameDay = render(pageWith({ last_modified_at: "2026-03-04" }), reviewers({ date: "2026-03-04" }));
  assert.ok(sameDay);
  assert.equal([...sameDay.matchAll(/<time /g)].length, 1);
  assert.doesNotMatch(sameDay, /Reviewed|Date unknown/);
});

test("the unavailable marker is localised, claims nothing, and never echoes the bad value", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const page = pageWith({ last_modified_at: "2026-02-30T99:99:99" }, lang);
    const out = render(page, reviewers({ author: "Ada Lovelace" }));
    assert.ok(out, lang);
    assert.ok(out.includes(stringsOf(lang).changelog_date_unknown ?? ""), `${lang} carries the neutral wording`);
    assert.doesNotMatch(out, /<time|2026-02-30/);

    // The page still names its contributor, so one rejected date cannot erase the rest of the line.
    assert.ok(out.includes(stringsOf(lang).contributors_label ?? ""), `${lang} keeps the contributors`);
  }
});

test("a malformed date is escaped like any other text: the line carries no markup of its own", () => {
  const out = render(pageWith({ last_modified_at: '<script>alert("x")</script>' }));

  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  // The rejected value stays out of the page entirely; only the catalog wording is shown.
  assert.doesNotMatch(out, /alert|&lt;script/);
  assert.match(out, new RegExp(`>${stringsOf("en").changelog_date_unknown ?? ""}</span>`));
});

test("the line's text does not depend on the host clock or time zone", () => {
  const page = pageWith({ last_modified_at: "2026-03-04" });
  const data = { ...build("2026-03-06"), ...reviewers({ date: "2026-02-30", author: "Ada" }) };
  const first = render(page, data);
  assert.ok(first);

  const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Niue"];
  const original = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      assert.equal(render(page, data), first, zone);
      assert.equal(dateOf(page, props(page, data).site), "2026-03-04", zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("dateOf, datesOf, asOfOf, and contributorsOf read the data defensively", () => {
  const page = pageWith();
  const site = (data: Readonly<Record<string, unknown>>) => props(page, data).site;

  assert.equal(dateOf(page, site(reviewers({ date: "2026-03-04" }))), "2026-03-04");
  assert.equal(dateOf(page, site(reviewers({ date: "2026-02-30" }))), undefined);
  assert.equal(dateOf(page, site({ reviewers: { [PAGE_URL]: "2026-03-04" } })), undefined);
  assert.equal(dateOf(page, site({ reviewers: [] })), undefined);

  assert.deepEqual(datesOf(pageWith({ last_modified_at: "2026-03-01" }), site(reviewers({ date: "2026-03-04" }))), [
    { date: "2026-03-01", status: "valid", source: "source" },
    { date: "2026-03-04", status: "valid", source: "review" },
  ]);
  assert.deepEqual(datesOf(page, site(reviewers({ date: "2026-02-30" }))), [
    { date: undefined, status: "invalid", source: "review" },
  ]);
  assert.deepEqual(datesOf(page, site({})), []);

  // A rejected source date never stands in for the readable review date a page does have.
  assert.equal(dateOf(pageWith({ last_modified_at: "not a date" }), site(reviewers({ date: "2026-03-04" }))), "2026-03-04");

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
});

test("regional and additional valid language tags keep their own locale", () => {
  assert.equal(localeOf("fa-IR"), "fa-IR");
  assert.equal(localeOf("ar-EG"), "ar-EG");
  assert.equal(localeOf("en-CA"), "en-CA");
  assert.equal(localeOf("de"), "de");
  assert.equal(localeOf("sv-SE"), "sv-SE");
  // Tags are canonicalised, not matched case-sensitively against a fixed map.
  assert.equal(localeOf("FA-ir"), "fa-IR");

  // ar-EG writes Arabic-Indic digits where plain ar writes Latin ones, so the region is really used.
  assert.equal(relativeDate("2026-03-04", "2026-03-07", "ar"), "قبل 3 أيام");
  assert.equal(relativeDate("2026-03-04", "2026-03-07", "ar-EG"), "قبل ٣ أيام");
  assert.equal(relativeDate("2026-03-04", "2026-03-07", "fa-IR"), "۳ روز پیش");
  assert.equal(relativeDate("2026-03-04", "2026-03-07", "en-CA"), "3 days ago");
  assert.equal(relativeDate("2026-03-04", "2026-03-07", "de"), "vor 3 Tagen");
});

test("invalid and unsupported tags fail soft to English", () => {
  assert.equal(localeOf(""), "en");
  assert.equal(localeOf("  "), "en");
  assert.equal(localeOf("not a locale"), "en");
  assert.equal(localeOf("xx"), "en");
  assert.equal(localeOf("xx-YY"), "en");
  assert.equal(relativeDate("2026-03-04", "2026-03-06", "not a locale"), "2 days ago");
  assert.equal(relativeDate("2026-03-04", "2026-03-06", "xx-YY"), "2 days ago");
});

test("a regional page tag localises its line and calendar", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }, "ar-EG"), {
    ...build("2026-03-07"),
    reviewers: { [PAGE_URL]: { author: "Ada Lovelace" } },
  });

  assert.ok(out);
  assert.ok(out.includes(stringsOf("ar").updated ?? ""));
  // Arabic-Indic digits come from ar-EG; the hardcoded `ar` locale writes Latin digits.
  assert.match(out, /><bdi>قبل ٣ أيام<\/bdi><\/time>/);
  assert.match(out, /aria-label="[^"]*١٤٤٧[^"]*"/);
});

test("mixed-direction contributor names are isolated, with localized separators", () => {
  const out = render(pageWith({ last_modified_at: "2026-03-04" }, "fa"), {
    ...build("2026-03-06"),
    reviewers: { [PAGE_URL]: { author: "Ada Lovelace", contributors: ["علی رضایی", "أحمد"] } },
  });

  assert.ok(out);
  // Sorted by code point: Latin first, then Arabic, then Persian. Each name is its own `bdi`, and the
  // Persian comma stays between them in the sentence's direction.
  assert.match(
    out,
    /<span class="last-updated-contributors">مشارکت‌کنندگان: <bdi>Ada Lovelace<\/bdi>، <bdi>أحمد<\/bdi>، <bdi>علی رضایی<\/bdi><\/span>/,
  );
  assert.match(out, /<time datetime="2026-03-04" title="[^"]+" aria-label="[^"]+"><bdi>پریروز<\/bdi><\/time>/);
});

test("identical inputs give identical output, including duplicate and future dates", () => {
  const page = pageWith({ last_modified_at: "2026-03-04" }, "fa");
  const data = { ...build("2026-03-06"), reviewers: { [PAGE_URL]: { date: "2026-03-04", author: "Ada" } } };

  const first = render(page, data);
  assert.ok(first);
  assert.equal(first, render(page, data));
  assert.equal([...first.matchAll(/<time /g)].length, 1, "a review on the source's day is a duplicate");
  assert.equal(relativeDate("2026-03-04", "2026-03-06", "fa"), relativeDate("2026-03-04", "2026-03-06", "fa"));

  const future = render(pageWith({ last_modified_at: "2026-03-08" }), build("2026-03-06"));
  assert.ok(future);
  assert.equal(future, render(pageWith({ last_modified_at: "2026-03-08" }), build("2026-03-06")));
  assert.doesNotMatch(future, /in 2 days|<bdi>2 days/);
  assert.match(future, /<bdi>March 8, 2026<\/bdi>/);
});

test("the review label is localised in Persian and Arabic", () => {
  const fa = render(pageWith({}, "fa"), reviewers({ date: "2026-03-04" }));
  assert.ok(fa);
  assert.ok(fa.includes(`${stringsOf("fa").reviewed} `));

  const ar = render(pageWith({}, "ar"), reviewers({ date: "2026-03-04" }));
  assert.ok(ar);
  assert.ok(ar.includes(`${stringsOf("ar").reviewed} `));
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
