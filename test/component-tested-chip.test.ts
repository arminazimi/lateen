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
  countOf,
  countsFor,
  countsOf,
  directive,
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

test("an untested page or block renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ passed: 0, failed: 0 }), null);
  assert.equal(render({ passed: "0", failed: "0" }), null);
  assert.equal(render({ passed: "-1" }), null);
  assert.equal(render({ passed: "two", failed: "three" }), null);
  assert.equal(render({ lastPassed: "2026-11-09" }), null);
  assert.equal(render({}, { site: {}, url: "/guide/" }), null);
  assert.equal(render({}, { site: { data: {} }, url: "/guide/" }), null);
  assert.equal(render({ failed: 0 }, { site: examples({ "/guide/": { passed: 3, failed: 0 } }), url: "/guide/" }), null);
});

test("the counts come from site.data.examples when the props are absent", () => {
  const site = examples({ "/guide/": { passed: 3, failed: 0, lastPassed: "2026-11-09" } });
  const out = render({}, { site, url: "/guide/" });
  assert.ok(out);
  assert.match(out, /class="tested-chip tested-chip-passed"/);
  assert.ok(out.includes(`>3 passed</span>`));
  assert.ok(out.includes(`>Last passed November 9, 2026</span>`));
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

test("the four i18n keys exist in every language and keep their placeholders", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const table = stringsOf(lang);
    for (const key of ["tested", "tested_passed", "tested_failed", "tested_last_passed"]) {
      assert.equal(typeof table[key], "string", `${lang}.${key}`);
      assert.notEqual(table[key]!.trim(), "", `${lang}.${key}`);
    }
    assert.match(table.tested_passed!, /\{n\}/, `${lang}.tested_passed`);
    assert.match(table.tested_failed!, /\{n\}/, `${lang}.tested_failed`);
    assert.match(table.tested_last_passed!, /\{date\}/, `${lang}.tested_last_passed`);
  }
});

test("values are escaped or rejected, never parsed as markup", () => {
  const out = render({ passed: 1, failed: 0, lastPassed: '2026-11-09"><script>alert(1)</script>' });
  assert.ok(out);
  assert.doesNotMatch(out, /<script/);
  assert.doesNotMatch(out, /title=/);

  assert.equal(render({ passed: '1"><script>alert(1)</script>', failed: 0 }), null);
});

test("each state has a different icon, so the result never depends on colour alone", () => {
  assert.deepEqual([...STATES], ["passed", "failed"]);
  assert.notEqual(ICONS.passed.join("|"), ICONS.failed.join("|"));
  for (const state of STATES) assert.ok(ICONS[state].length > 0);
});

test("counts and state helpers treat malformed values as untested", () => {
  assert.equal(countOf(2), 2);
  assert.equal(countOf("2"), 2);
  assert.equal(countOf(" 2 "), 2);
  assert.equal(countOf(undefined), 0);
  assert.equal(countOf(""), 0);
  assert.equal(countOf("-1"), 0);
  assert.equal(countOf("1.5"), 0);
  assert.equal(countOf("two"), 0);
  assert.equal(countOf("1<script>"), 0);

  assert.deepEqual(countsOf({ passed: 2, failed: 1 }), { passed: 2, failed: 1 });
  assert.deepEqual(countsOf({ passed: 2, failed: 0, lastPassed: "2026-11-09" }), {
    passed: 2,
    failed: 0,
    lastPassed: "2026-11-09",
  });
  assert.equal(countsOf({ passed: 0, failed: 0 }), undefined);
  assert.equal(countsOf(null), undefined);
  assert.equal(countsOf("2"), undefined);
  assert.equal(countsFor(undefined, undefined), undefined);
  assert.equal(stateOf({ passed: 2, failed: 0 }), "passed");
  assert.equal(stateOf({ passed: 0, failed: 1 }), "failed");
  assert.equal(classNameOf("passed"), `${CHIP_CLASS} ${CHIP_CLASS}-passed`);
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
