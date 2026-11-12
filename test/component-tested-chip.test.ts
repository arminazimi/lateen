import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import testedChip, {
  CHIP_CLASS,
  COUNT_CLASS,
  ICONS,
  LABEL_CLASS,
  SR_CLASS,
  STATES,
  classNameOf,
  countsFor,
  countsOf,
  directive,
  notRunOf,
  parseCount,
  stateOf,
  type TestedChipProps,
} from "../components/tested-chip/index.ts";

type Options = { lang?: string; site?: unknown; url?: string };

/** Render the chip the way the render host calls it: directive props, the page, and the site model. */
function render(props: TestedChipProps, options: Options = {}): string | null {
  const lang = options.lang ?? "en";
  const page = { lang, ...(options.url === undefined ? {} : { url: options.url }) };
  const site = options.site ?? {};
  const node = testedChip({ props, html: "", page, site } as unknown as ComponentProps<TestedChipProps>);
  return node === null ? null : renderToString(node as never);
}

/** An examples record for `site.data.examples`, keyed by page URL. */
function examples(entries: Record<string, unknown>): unknown {
  return { data: { examples: entries } };
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/tested-chip/style.css", import.meta.url), "utf8");

test("default export is the component, with the tested-chip directive", () => {
  assert.equal(typeof testedChip, "function");
  assert.equal(directive, "tested-chip");
});

test("a passing example shows an icon, the label, and the passed count", () => {
  const out = render({ passed: 2, failed: 0, lastPassed: "2026-11-09" });
  assert.ok(out);
  assert.match(out, /^<span class="tested-chip tested-chip-passed" role="note"/);
  assert.match(out, /data-passed="2"/);
  assert.match(out, /data-failed="0"/);
  assert.match(out, /<svg class="tested-chip-icon"[^>]*aria-hidden="true"[^>]*focusable="false">/);
  assert.ok(out.includes(`<path d="${ICONS.passed[0]}"></path>`));
  assert.ok(out.includes(`<span class="${LABEL_CLASS}">${stringsOf("en").tested}</span>`));
  assert.ok(out.includes(`<span class="${COUNT_CLASS} ${COUNT_CLASS}-passed">2 passed</span>`));
  assert.doesNotMatch(out, /failed<\/span>/);
});

test("a failing example shows the failed count and its own icon shape", () => {
  const out = render({ passed: 0, failed: 1 });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-failed"/);
  assert.ok(out.includes(`<path d="${ICONS.failed[0]}"></path>`));
  assert.ok(out.includes(`<path d="${ICONS.failed[1]}"></path>`));
  assert.ok(out.includes(`<span class="${COUNT_CLASS} ${COUNT_CLASS}-failed">1 failed</span>`));
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`));
});

test("a mixed result shows both counts and reads as failed", () => {
  const out = render({ passed: 2, failed: 1 });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-failed"/);
  assert.ok(out.includes(`>2 passed</span>`));
  assert.ok(out.includes(`>1 failed</span>`));
});

test("a partly run set names the examples that did not run instead of reading as a full pass", () => {
  const out = render(
    { passed: 2, failed: 0, total: 5 },
    { lang: "en" },
  );
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-partial"/);
  assert.match(out, /data-total="5"/);
  assert.ok(out.includes(`<span class="${LABEL_CLASS}">${stringsOf("en").tested_partial}</span>`));
  assert.ok(out.includes(`<span class="${COUNT_CLASS} ${COUNT_CLASS}-not-run">3 not run</span>`));
  assert.match(out, /role="note" data-passed="2" data-failed="0" data-total="5"/);
});

test("a total that does not exceed the results is ignored", () => {
  const out = render({ passed: 2, failed: 0, total: 2 });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-passed"/);
  assert.doesNotMatch(out, /data-total/);
  assert.doesNotMatch(out, /not run/);
});

test("a positive total with nothing run says all examples did not run and never reads as passed or partial", () => {
  const out = render({ passed: 0, failed: 0, total: 5 });
  assert.ok(out);
  assert.match(out, /^<span class="tested-chip tested-chip-unrun" role="note"/);
  assert.match(out, /role="note" data-passed="0" data-failed="0" data-total="5"/);
  assert.ok(out.includes(`<path d="${ICONS.unrun[0]}"></path>`));
  assert.ok(out.includes(`<span class="${LABEL_CLASS}">${stringsOf("en").tested}</span>`));
  assert.ok(out.includes(`<span class="${COUNT_CLASS} ${COUNT_CLASS}-not-run">5 not run</span>`));
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`));
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-failed`));
  assert.doesNotMatch(out, /tested-chip-partial/);
});

test("a positive total alone is a recorded unrun suite, not missing evidence", () => {
  const out = render({ total: 3 });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-unrun"/);
  assert.match(out, /data-total="3"/);
  assert.ok(out.includes(`>3 not run</span>`));
});

test("an unrun suite from site data says every example did not run", () => {
  const site = examples({ "/guide/": { total: 4, passed: 0, failed: 0 } });
  const out = render({}, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-unrun"/);
  assert.match(out, /data-total="4"/);
  assert.ok(out.includes(`>4 not run</span>`));
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`));
  assert.doesNotMatch(out, /tested-chip-partial/);
});

test("an unrun suite keeps its last-passed date without inferring a pass", () => {
  const props = render({ passed: 0, failed: 0, total: 2, lastPassed: "2026-11-09" });
  assert.ok(props);
  assert.match(props, /class="tested-chip tested-chip-unrun"/);
  assert.ok(props.includes(`>2 not run</span>`));
  assert.match(props, /title="Last passed November 9, 2026"/);
  assert.doesNotMatch(props, new RegExp(`${COUNT_CLASS}-passed`));

  const site = examples({ "/guide/": { passed: 0, failed: 0, total: 2, lastPassed: "2026-11-09" } });
  const out = render({}, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-unrun"/);
  assert.match(out, /title="Last passed November 9, 2026"/);
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`));
});

test("an untested page or block renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ passed: 0, failed: 0 }), null);
  assert.equal(render({ passed: 0, failed: 0, total: 0 }), null);
  assert.equal(render({ total: 0 }), null);
  assert.equal(render({ total: "0" }), null);
  assert.equal(render({ passed: "0", failed: "0" }), null);
  assert.equal(render({ lastPassed: "2026-11-09" }), null);
  assert.equal(render({}, { site: {}, url: "/guide/" }), null);
  assert.equal(render({}, { site: { data: {} }, url: "/guide/" }), null);
  assert.equal(render({ failed: 0 }, { site: examples({ "/guide/": { passed: 3, failed: 0 } }), url: "/guide/" }), null);
});

test("a malformed supplied count renders as unavailable, never as a fabricated result", () => {
  const cases: readonly [string, TestedChipProps][] = [
    ["passed blank", { passed: "" }],
    ["passed whitespace", { passed: "   " }],
    ["passed negative", { passed: "-1" }],
    ["passed non-numeric", { passed: "two" }],
    ["passed markup-shaped", { passed: '1"><script>alert(1)</script>' }],
    ["failed blank", { failed: "" }],
    ["failed negative", { failed: -1 }],
    ["failed fractional", { failed: "1.5" }],
    ["total blank", { total: "" }],
    ["total negative", { total: "-5" }],
    ["total non-numeric", { total: "five" }],
    ["mixed valid passed with invalid failed", { passed: 2, failed: "three" }],
    ["all counts invalid", { passed: "two", failed: "three", total: "four" }],
  ];
  for (const [label, props] of cases) {
    const out = render(props);
    assert.ok(out, `${label}: renders`);
    assert.match(out, /class="tested-chip tested-chip-unavailable"/, `${label}: state class`);
    assert.doesNotMatch(out, /data-passed=/, `${label}: no data-passed`);
    assert.doesNotMatch(out, /data-failed=/, `${label}: no data-failed`);
    assert.doesNotMatch(out, /data-total=/, `${label}: no data-total`);
    assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`), `${label}: no passed count`);
    assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-failed`), `${label}: no failed count`);
    assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-not-run`), `${label}: no not-run count`);
    assert.doesNotMatch(out, /tested-chip-passed/, `${label}: not passed`);
    assert.doesNotMatch(out, /tested-chip-failed/, `${label}: not failed`);
    assert.doesNotMatch(out, /tested-chip-partial/, `${label}: not partial`);
    assert.doesNotMatch(out, /tested-chip-unrun/, `${label}: not unrun`);
    assert.doesNotMatch(out, /<script/, `${label}: never re-emits markup`);
    assert.ok(out.includes(`<span class="${LABEL_CLASS}">${stringsOf("en").trust_level_unknown}</span>`), `${label}: neutral label`);
  }
});

test("a total smaller than the completed counts is impossible and renders as unavailable", () => {
  for (const total of [0, 1, "0", "1"]) {
    const out = render({ passed: 2, failed: 0, total });
    assert.ok(out, `total=${String(total)}`);
    assert.match(out, /class="tested-chip tested-chip-unavailable"/, `total=${String(total)}: state`);
    assert.doesNotMatch(out, /data-passed=/, `total=${String(total)}: no fabricated pass`);
    assert.doesNotMatch(out, /data-total=/, `total=${String(total)}: no fabricated total`);
    assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`), `total=${String(total)}: no passed count`);
  }
});

test("an unsafe integer or a fractional count renders as unavailable, a valid boundary count does not", () => {
  const unsafe = [
    Number.MAX_SAFE_INTEGER + 1,
    -(Number.MAX_SAFE_INTEGER + 1),
    Number.MAX_SAFE_INTEGER * 2,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
    1.5,
    -0.5,
    "9007199254740993",
    "1e400",
    "Infinity",
  ] as const;
  for (const value of unsafe) {
    const out = render({ passed: value as number | string, failed: 0 });
    assert.ok(out, `passed=${String(value)}`);
    assert.match(out, /class="tested-chip tested-chip-unavailable"/, `passed=${String(value)}: state`);
    assert.doesNotMatch(out, /data-passed=/, `passed=${String(value)}: no data-passed`);
  }
  const boundaries: readonly (number | string)[] = [0, "0", 1, Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)];
  for (const value of boundaries) {
    const out = render({ passed: value, failed: 0 });
    if (value === 0 || value === "0") {
      assert.equal(out, null, `passed=${String(value)} is a valid zero with no results: hides`);
      continue;
    }
    assert.ok(out, `passed=${String(value)} renders`);
    assert.match(out, /class="tested-chip tested-chip-passed"/, `passed=${String(value)}: state`);
  }
});

test("an unavailable chip from site data behaves the same as from props", () => {
  const cases: readonly unknown[] = [
    { passed: "two", failed: 0 },
    { passed: 0, failed: -1 },
    { passed: 3, failed: 0, total: 2 },
    { passed: 1.5, failed: 0 },
    { total: "" },
  ];
  for (const entry of cases) {
    const site = examples({ "/guide/": entry });
    const out = render({}, { site, url: "/guide/" });
    assert.ok(out, `entry ${JSON.stringify(entry)}`);
    assert.match(out, /class="tested-chip tested-chip-unavailable"/, `entry ${JSON.stringify(entry)}: state`);
    assert.doesNotMatch(out, /data-passed=/, `entry ${JSON.stringify(entry)}: no data-passed`);
    assert.doesNotMatch(out, /data-failed=/, `entry ${JSON.stringify(entry)}: no data-failed`);
    assert.doesNotMatch(out, /data-total=/, `entry ${JSON.stringify(entry)}: no data-total`);
  }
});

test("props win over site data even when they disagree on validity", () => {
  const site = examples({ "/guide/": { passed: 3, failed: 0 } });
  const malformedProps = render({ passed: "two", failed: 0 }, { site, url: "/guide/" });
  assert.ok(malformedProps);
  assert.match(malformedProps, /class="tested-chip tested-chip-unavailable"/);
  assert.doesNotMatch(malformedProps, /3 passed/);

  const siteIsBad = examples({ "/guide/": { passed: "two", failed: 0 } });
  const goodProps = render({ passed: 3, failed: 0 }, { site: siteIsBad, url: "/guide/" });
  assert.ok(goodProps);
  assert.match(goodProps, /class="tested-chip tested-chip-passed"/);
  assert.match(goodProps, /data-passed="3"/);
});

test("an unavailable chip keeps a valid lastPassed tooltip but never a fabricated count", () => {
  const out = render({ passed: "two", failed: 0, lastPassed: "2026-11-09" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-unavailable"/);
  assert.match(out, /title="Last passed November 9, 2026"/);
  assert.ok(out.includes(`<span class="${SR_CLASS}">Last passed November 9, 2026</span>`));
  assert.doesNotMatch(out, /data-passed=/);
  assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`));

  const invalidDate = render({ passed: "two", failed: 0, lastPassed: "not a date" });
  assert.ok(invalidDate);
  assert.match(invalidDate, /class="tested-chip tested-chip-unavailable"/);
  assert.doesNotMatch(invalidDate, /title=/);
});

test("the unavailable state is localised, RTL-safe, and machine-identifiable by class alone", () => {
  const cases = [
    { lang: "en", label: "Unknown" },
    { lang: "fa", label: "نامعلوم" },
    { lang: "ar", label: "غير معروف" },
  ] as const;
  for (const { lang, label } of cases) {
    const out = render({ passed: "two", failed: 0 }, { lang });
    assert.ok(out, lang);
    assert.match(out, /class="tested-chip tested-chip-unavailable"/, `${lang} state class`);
    assert.ok(out.includes(`<span class="${LABEL_CLASS}">${label}</span>`), `${lang} label`);
    assert.doesNotMatch(out, /data-passed=/, `${lang} hides fabricated count`);
    assert.doesNotMatch(out, /data-failed=/, `${lang} hides fabricated failed`);
    assert.doesNotMatch(out, /data-total=/, `${lang} hides fabricated total`);
    // The unavailable icon is a circle, an upright tick, and a dot at the horizontal centre, so a
    // mirrored reading is identical: the shape never depends on direction.
    const paths = ICONS.unavailable.join("|");
    assert.ok(paths.includes("a6.25 6.25 0 1 0 0 12.5"), `${lang} symmetric circle`);
    assert.ok(!/h-?[0-9]/.test(paths), `${lang} no horizontal offsets`);
  }
});

test("the counts come from site.data.examples when the props are absent", () => {
  const site = examples({ "/guide/": { passed: 3, failed: 0, lastPassed: "2026-11-09" } });
  const out = render({}, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-passed"/);
  assert.ok(out.includes(`>3 passed</span>`));
  assert.ok(out.includes(`>Last passed November 9, 2026</span>`));
});

test("a partial record in site.data.examples says how many examples did not run", () => {
  const site = examples({ "/guide/": { total: 4, passed: 3, failed: 0 } });
  const out = render({}, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-partial"/);
  assert.ok(out.includes(`>3 passed</span>`));
  assert.ok(out.includes(`>1 not run</span>`));
});

test("the props win over site.data.examples", () => {
  const site = examples({ "/guide/": { passed: 9, failed: 0 } });
  const out = render({ passed: 0, failed: 1 }, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /data-passed="0"/);
  assert.match(out, /data-failed="1"/);
  assert.doesNotMatch(out, /9 passed/);
});

test("an entry for another URL or an empty entry does not render", () => {
  const site = examples({ "/other/": { passed: 2, failed: 0 } });
  assert.equal(render({}, { site, url: "/guide/" }), null);
  assert.equal(render({}, { site: examples({ "/guide/": { passed: 0, failed: 0 } }), url: "/guide/" }), null);
});

test("the date tooltip and the screen-reader sentence say when it last passed", () => {
  const out = render({ passed: 2, failed: 0, lastPassed: "2026-11-09" });
  assert.ok(out);
  assert.match(out, /title="Last passed November 9, 2026"/);
  assert.ok(out.includes(`<span class="${SR_CLASS}">Last passed November 9, 2026</span>`));
});

test("an invalid or missing last-passed date shows no tooltip", () => {
  for (const lastPassed of [undefined, "", "not a date", "2026-02-30", "2026-11-09x"]) {
    const out = render(lastPassed === undefined ? { passed: 1, failed: 0 } : { passed: 1, failed: 0, lastPassed });
    assert.ok(out, String(lastPassed));
    assert.doesNotMatch(out, /title=/, String(lastPassed));
    assert.doesNotMatch(out, new RegExp(SR_CLASS), String(lastPassed));
  }
});

test("the label, counts, and date follow the page language", () => {
  const cases = [
    { lang: "en", label: "Tested", passed: "2 passed", failed: "1 failed", date: "November 9, 2026" },
    { lang: "fa", label: "آزموده", passed: "2 موفق", failed: "1 ناموفق", date: "۱۸ آبان ۱۴۰۵" },
    { lang: "ar", label: "مُختبَر", passed: "2 ناجح", failed: "1 فاشل", date: "٣٠ جمادى الأولى ١٤٤٨ هـ" },
  ] as const;
  for (const { lang, label, passed, failed, date } of cases) {
    const out = render({ passed: 2, failed: 1, lastPassed: "2026-11-09" }, { lang });
    assert.ok(out, lang);
    assert.ok(out.includes(`>${label}</span>`), `${lang} label`);
    assert.ok(out.includes(`>${passed}</span>`), `${lang} passed count`);
    assert.ok(out.includes(`>${failed}</span>`), `${lang} failed count`);
    assert.ok(out.includes(`title="Last passed ${date}"`) || out.includes(date), `${lang} date`);
  }
});

test("the date sentence is localised with a translated prefix", () => {
  assert.ok(render({ passed: 1, failed: 0, lastPassed: "2026-11-09" }, { lang: "fa" })!.includes("آخرین اجرای موفق"));
  assert.ok(render({ passed: 1, failed: 0, lastPassed: "2026-11-09" }, { lang: "ar" })!.includes("آخر نجاح"));
});

test("the partial label and the not-run count follow the page language", () => {
  const cases = [
    { lang: "en", label: "Partly tested", count: "1 not run" },
    { lang: "fa", label: stringsOf("fa").tested_partial!, count: "1 اجرانشده" },
    { lang: "ar", label: stringsOf("ar").tested_partial!, count: "1 لم تُشغَّل" },
  ] as const;
  for (const { lang, label, count } of cases) {
    const out = render({ passed: 2, failed: 0, total: 3 }, { lang });
    assert.ok(out, lang);
    assert.ok(out.includes(`<span class="${LABEL_CLASS}">${label}</span>`), `${lang} label`);
    assert.ok(out.includes(count), `${lang} not-run count`);
  }
});

test("the unrun label and count follow every supported page language", () => {
  const cases = [
    { lang: "en", label: "Tested", count: "4 not run" },
    { lang: "fa", label: "آزموده", count: "4 اجرانشده" },
    { lang: "ar", label: "مُختبَر", count: "4 لم تُشغَّل" },
  ] as const;
  for (const { lang, label, count } of cases) {
    const out = render({ total: 4 }, { lang });
    assert.ok(out, lang);
    assert.match(out, /class="tested-chip tested-chip-unrun"/, `${lang} state`);
    assert.ok(out.includes(`<span class="${LABEL_CLASS}">${label}</span>`), `${lang} label`);
    assert.ok(out.includes(count), `${lang} not-run count`);
    assert.doesNotMatch(out, new RegExp(`${COUNT_CLASS}-passed`), `${lang} passed count`);
  }
});

test("the i18n keys exist in every language and keep their placeholders", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const table = stringsOf(lang);
    for (const key of [
      "tested",
      "tested_partial",
      "tested_passed",
      "tested_failed",
      "tested_not_run",
      "tested_last_passed",
      "trust_level_unknown",
    ]) {
      assert.equal(typeof table[key], "string", `${lang}.${key}`);
      assert.notEqual(table[key]!.trim(), "", `${lang}.${key}`);
    }
    assert.match(table.tested_passed!, /\{n\}/, `${lang}.tested_passed`);
    assert.match(table.tested_failed!, /\{n\}/, `${lang}.tested_failed`);
    assert.match(table.tested_not_run!, /\{n\}/, `${lang}.tested_not_run`);
    assert.match(table.tested_last_passed!, /\{date\}/, `${lang}.tested_last_passed`);
  }
});

test("values are escaped or rejected, never parsed as markup", () => {
  const out = render({ passed: 1, failed: 0, lastPassed: '2026-11-09"><script>alert(1)</script>' });
  assert.ok(out);
  assert.doesNotMatch(out, /<script/);
  assert.doesNotMatch(out, /title=/);

  const escaped = render({ passed: '1"><script>alert(1)</script>', failed: 0 });
  assert.ok(escaped);
  assert.match(escaped, /class="tested-chip tested-chip-unavailable"/);
  assert.doesNotMatch(escaped, /<script/);
  assert.doesNotMatch(escaped, /data-passed=/);
});

test("each state has a different icon, so the result never depends on colour alone", () => {
  assert.deepEqual([...STATES], ["passed", "partial", "unrun", "failed", "unavailable"]);
  assert.equal(new Set(STATES.map((state) => ICONS[state].join("|"))).size, STATES.length);
  for (const state of STATES) assert.ok(ICONS[state].length > 0);
});

test("parseCount keeps presence, validity, and the numeric value apart", () => {
  assert.deepEqual(parseCount(2), { present: true, valid: true, value: 2 });
  assert.deepEqual(parseCount("2"), { present: true, valid: true, value: 2 });
  assert.deepEqual(parseCount(" 2 "), { present: true, valid: true, value: 2 });
  assert.deepEqual(parseCount(0), { present: true, valid: true, value: 0 });
  assert.deepEqual(parseCount("0"), { present: true, valid: true, value: 0 });
  assert.deepEqual(parseCount(Number.MAX_SAFE_INTEGER), {
    present: true,
    valid: true,
    value: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(parseCount(String(Number.MAX_SAFE_INTEGER)), {
    present: true,
    valid: true,
    value: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(parseCount(undefined), { present: false, valid: false, value: 0 });
  assert.deepEqual(parseCount(null), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(""), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("   "), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("-1"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(-1), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("1.5"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(1.5), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("two"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("1<script>"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(Number.POSITIVE_INFINITY), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(Number.NaN), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(Number.MAX_SAFE_INTEGER + 1), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("9007199254740993"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount("1e400"), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount(true), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount({}), { present: true, valid: false, value: 0 });
  assert.deepEqual(parseCount([]), { present: true, valid: false, value: 0 });
});

test("countsOf marks malformed reports unavailable without fabricating counts", () => {
  assert.deepEqual(countsOf({ passed: 2, failed: 1 }), { passed: 2, failed: 1 });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, total: 5 }), { passed: 2, failed: 0, total: 5 });
  assert.deepEqual(countsOf({ total: 5 }), { passed: 0, failed: 0, total: 5 });
  assert.deepEqual(countsOf({ passed: 0, failed: 0, total: "5" }), { passed: 0, failed: 0, total: 5 });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, lastPassed: "2026-11-09" }), {
    passed: 2,
    failed: 0,
    lastPassed: "2026-11-09",
  });
  assert.equal(countsOf({ total: 0 }), undefined);
  assert.equal(countsOf({ passed: 0, failed: 0 }), undefined);
  assert.equal(countsOf({ passed: 0, failed: 0, total: 0 }), undefined);
  assert.equal(countsOf(null), undefined);
  assert.equal(countsOf("2"), undefined);
  assert.equal(countsFor(undefined, undefined), undefined);

  assert.deepEqual(countsOf({ passed: "two", failed: "three", total: 5 }), {
    passed: 0,
    failed: 0,
    unavailable: true,
  });
  assert.deepEqual(countsOf({ total: "-5" }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ total: "five" }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: -1, failed: 0 }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: 1.5, failed: 0 }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: 0, failed: "", total: 3 }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, total: 1 }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, total: 0 }), { passed: 0, failed: 0, unavailable: true });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, total: "x", lastPassed: "2026-11-09" }), {
    passed: 0,
    failed: 0,
    unavailable: true,
    lastPassed: "2026-11-09",
  });
});

test("stateOf and notRunOf keep unavailable neutral and preserve the other states", () => {
  assert.equal(stateOf({ passed: 0, failed: 0, unavailable: true }), "unavailable");
  assert.equal(stateOf({ passed: 2, failed: 0, total: 1, unavailable: true }), "unavailable");
  assert.equal(stateOf({ passed: 0, failed: 1, unavailable: true }), "unavailable");
  assert.equal(notRunOf({ passed: 0, failed: 0, unavailable: true }), 0);
  assert.equal(notRunOf({ passed: 2, failed: 1, unavailable: true }), 0);

  assert.equal(stateOf({ passed: 2, failed: 0 }), "passed");
  assert.equal(stateOf({ passed: 2, failed: 0, total: 5 }), "partial");
  assert.equal(stateOf({ passed: 0, failed: 0, total: 5 }), "unrun");
  assert.equal(stateOf({ passed: 2, failed: 1, total: 5 }), "failed");
  assert.equal(stateOf({ passed: 0, failed: 1 }), "failed");
  assert.equal(notRunOf({ passed: 2, failed: 0, total: 5 }), 3);
  assert.equal(notRunOf({ passed: 0, failed: 0, total: 5 }), 5);
  assert.equal(notRunOf({ passed: 2, failed: 1 }), 0);
  assert.equal(classNameOf("passed"), `${CHIP_CLASS} ${CHIP_CLASS}-passed`);
  assert.equal(classNameOf("unrun"), `${CHIP_CLASS} ${CHIP_CLASS}-unrun`);
  assert.equal(classNameOf("unavailable"), `${CHIP_CLASS} ${CHIP_CLASS}-unavailable`);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css stays inline and uses logical properties only", () => {
  assert.match(css, /\.tested-chip\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.tested-chip\s*\{[^}]*padding-inline:/s);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
});

test("style.css hides the last-passed sentence from sight but not from assistive tech", () => {
  assert.match(css, /\.tested-chip-sr\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.tested-chip-sr\s*\{[^}]*clip-path:\s*inset\(50%\)/s);
  assert.match(css, /\.tested-chip-sr\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /\.tested-chip-sr\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.tested-chip-sr\s*\{[^}]*visibility:\s*hidden/s);
});
