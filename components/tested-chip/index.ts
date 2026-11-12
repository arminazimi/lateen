import { h } from "preact";
import type { Component, Page, Site } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { calendarDate } from "../../src/dates.ts";

/** The Markdown directive this component handles: `::tested-chip{passed=2 failed=0}`. */
export const directive = "tested-chip";

/** Class on the chip; `style.css` styles it. */
export const CHIP_CLASS = "tested-chip";

/** Class on the visible "Tested" label. */
export const LABEL_CLASS = "tested-chip-label";

/** Class on a visible count. */
export const COUNT_CLASS = "tested-chip-count";

/** Class on the visually hidden sentence that carries the last-passed date to assistive tech. */
export const SR_CLASS = "tested-chip-sr";

/**
 * The states a chip reports. A set with no completed examples is `unrun`; a partly run one is
 * `partial`, never rounded up to `passed`. `unavailable` is the neutral state a malformed or
 * impossible report gets: the chip shows, but no pass, fail, partial, or unrun evidence is claimed
 * from it and no count attribute is emitted.
 */
export const STATES = ["passed", "partial", "unrun", "failed", "unavailable"] as const;

export type TestedChipState = (typeof STATES)[number];

/**
 * Stroke paths for each state's icon, drawn on a 16×16 grid. The states differ by shape as well as
 * by text, so colour is never the only signal. All shapes are direction-neutral: `unavailable` uses
 * a circle around an upright tick and a dot, which read the same right-to-left.
 */
export const ICONS: Readonly<Record<TestedChipState, readonly string[]>> = {
  passed: ["m3.5 8.25 3 3 6-6"],
  partial: ["M8 2.25a5.75 5.75 0 0 1 0 11.5", "M8 2.25v11.5"],
  unrun: ["M3.5 8h9"],
  failed: ["m4.5 4.5 7 7", "m11.5 4.5-7 7"],
  unavailable: [
    "M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5Z",
    "M8 4.75v3.5",
    "M8 11.1v.01",
  ],
};

/** Props from the directive: `::tested-chip{passed=2 failed=0 total=2 lastPassed=2026-11-08}`. */
export type TestedChipProps = {
  /** Examples that passed. A directive attribute arrives as a string; data arrives as a number. */
  passed?: string | number;
  /** Examples that failed. */
  failed?: string | number;
  /** Examples the run counted, when more than `passed + failed`: the rest did not run. */
  total?: string | number;
  /** ISO date (`YYYY-MM-DD`, or a date-time whose date part is used) of the last successful run. */
  lastPassed?: string;
};

/**
 * What the chip renders: the two counts and, when known, the ISO date of the last success. When the
 * counts cannot be trusted, the shape carries `unavailable: true` and its `passed` and `failed` are
 * placeholder zeroes that the renderer must not surface as evidence; the only claim is that the
 * report is unknown.
 */
export interface TestedCounts {
  /** Examples that passed; a non-negative integer, or the placeholder `0` when `unavailable`. */
  readonly passed: number;
  /** Examples that failed; a non-negative integer, or the placeholder `0` when `unavailable`. */
  readonly failed: number;
  /** Examples the report counted, when the report records one larger than the results. */
  readonly total?: number;
  /** The ISO date of the last successful run, when there is one. */
  readonly lastPassed?: string;
  /** Set when any supplied count is malformed, or the counts are impossible together. */
  readonly unavailable?: true;
}

/**
 * One supplied count, with its presence and its validity kept apart from its value. A field is
 * present when the writer set it to anything other than `undefined`; it is valid only when the value
 * is a whole, non-negative, safe integer. `value` is the parsed integer when valid and `0`
 * otherwise, so callers never turn an unknown into a plausible zero.
 */
export interface ParsedCount {
  /** True when the writer supplied the field at all, even if the value is unusable. */
  readonly present: boolean;
  /** True when the field is present and holds a whole, non-negative, safe integer. */
  readonly valid: boolean;
  /** The parsed integer when valid; `0` otherwise, so callers never accidentally use it. */
  readonly value: number;
}

/**
 * One count as supplied by a directive attribute or an examples entry. Only `undefined` is absent;
 * every other value is present, and only a whole non-negative safe integer is valid. A blank or
 * whitespace-only string, a negative, a fraction, `NaN`, `Infinity`, a value past
 * `Number.MAX_SAFE_INTEGER`, an explicit `null`, a boolean, an object, and a non-numeric string are
 * all present-and-invalid, never coerced to `0`.
 */
export function parseCount(value: unknown): ParsedCount {
  if (value === undefined) return { present: false, valid: false, value: 0 };
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0
      ? { present: true, valid: true, value }
      : { present: true, valid: false, value: 0 };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return { present: true, valid: false, value: 0 };
    const numeric = Number(trimmed);
    return Number.isSafeInteger(numeric) && numeric >= 0
      ? { present: true, valid: true, value: numeric }
      : { present: true, valid: false, value: 0 };
  }
  return { present: true, valid: false, value: 0 };
}

/**
 * Counts from an examples entry or from a chip's props. Returns `undefined` — the no-evidence case
 * that hides the chip — when no count is present at all, when every present count is a valid zero,
 * or when the only shape reported is a `total` of `0` with nothing run.
 *
 * Any present count that is malformed, and any otherwise-valid report whose `total` is smaller than
 * the completed counts, yields `{ passed: 0, failed: 0, unavailable: true, ...lastPassed }`. Those
 * zeros are placeholders, not evidence, and the renderer never surfaces them. A positive `total`
 * with no results is still the recorded-unrun case, not missing evidence, so it is kept. A `total`
 * larger than `passed + failed` still marks the report partial. `lastPassed` rides along whenever it
 * is a non-empty string; the chip validates it at render time, so an invalid date cannot claim a
 * passing tooltip.
 */
export function countsOf(value: unknown): TestedCounts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const passed = parseCount(record.passed);
  const failed = parseCount(record.failed);
  const total = parseCount(record.total);
  if (!passed.present && !failed.present && !total.present) return undefined;

  const raw = typeof record.lastPassed === "string" ? record.lastPassed.trim() : "";
  const lastPassed = raw === "" ? {} : { lastPassed: raw };

  const malformed =
    (passed.present && !passed.valid) || (failed.present && !failed.valid) || (total.present && !total.valid);
  if (malformed) return { passed: 0, failed: 0, unavailable: true, ...lastPassed };

  const p = passed.value;
  const f = failed.value;
  const r = total.value;

  if (total.present && r < p + f) return { passed: 0, failed: 0, unavailable: true, ...lastPassed };

  const shown = total.present && r > p + f ? r : undefined;
  if (p + f === 0 && shown === undefined) return undefined;
  return {
    passed: p,
    failed: f,
    ...(shown === undefined ? {} : { total: shown }),
    ...lastPassed,
  };
}

/**
 * The counts for a page from `site.data.examples`, keyed by `page.url`. Returns `undefined` when the
 * site has no data, the page has no URL, or the page's entry is missing or empty.
 */
export function countsFor(site: Site | undefined, page: Page | undefined): TestedCounts | undefined {
  const examples = site?.data?.examples;
  if (typeof examples !== "object" || examples === null || page?.url === undefined) return undefined;
  return countsOf((examples as Record<string, unknown>)[page.url]);
}

/**
 * The state of a chip. An unavailable report wins over every count. Otherwise `failed` when anything
 * failed, `unrun` when nothing completed, `partial` when some examples did not run, and `passed`
 * when the results cover the total.
 */
export function stateOf(counts: TestedCounts): TestedChipState {
  if (counts.unavailable === true) return "unavailable";
  if (counts.failed > 0) return "failed";
  if (counts.passed + counts.failed === 0) return "unrun";
  return counts.total !== undefined && counts.total > counts.passed + counts.failed ? "partial" : "passed";
}

/** How many examples the report counted but did not run. `0` for an unavailable report. */
export function notRunOf(counts: TestedCounts): number {
  if (counts.unavailable === true) return 0;
  return Math.max((counts.total ?? 0) - counts.passed - counts.failed, 0);
}

/** Class names of the chip: `tested-chip` plus `tested-chip-<state>`. */
export function classNameOf(state: TestedChipState): string {
  return `${CHIP_CLASS} ${CHIP_CLASS}-${state}`;
}

/**
 * The i18n key of each state's visible label. `unavailable` reuses the theme's neutral "Unknown"
 * vocabulary so a malformed report never claims a result; the other states keep their existing keys.
 */
export const STATE_LABEL_KEYS: Readonly<Record<TestedChipState, string>> = {
  passed: "tested",
  partial: "tested_partial",
  unrun: "tested",
  failed: "tested",
  unavailable: "trust_level_unknown",
};

/** One inline count, such as "2 passed" or "1 failed". */
function count(counts: TestedCounts, state: TestedChipState, lang: string) {
  const n = state === "passed" ? counts.passed : counts.failed;
  return h(
    "span",
    { class: `${COUNT_CLASS} ${COUNT_CLASS}-${state}` },
    t(lang, state === "passed" ? "tested_passed" : "tested_failed", { n }),
  );
}

/** The chip's icon. It is decorative: the visible label and counts carry the meaning. */
function icon(state: TestedChipState) {
  return h(
    "svg",
    {
      class: `${CHIP_CLASS}-icon`,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ICONS[state].map((d) => h("path", { d })),
  );
}

/**
 * An inline chip for the result of a page's examples: an icon, the word "Tested", and the passed and
 * failed counts. Props give the numbers directly; when they are absent, the chip reads the page's
 * entry in `site.data.examples`. It renders nothing when there is no data and no report. When the
 * report's `total` is larger than the results, it says how many examples did not run and reads as
 * `partial`, so missing evidence never passes as a full result; when nothing completed at all it
 * reads as `unrun`, so a recorded but unexecuted suite is not hidden. When a supplied count is
 * malformed, or a valid `total` is smaller than the completed counts, the chip reads as the neutral
 * `unavailable` state: no count is shown and no `data-passed`, `data-failed`, or `data-total` is
 * emitted, so a bad report never presents itself as a passing, failing, partial, or unrun result. A
 * `lastPassed` date becomes a `title` tooltip and a visually hidden sentence, in the page's calendar,
 * so the chip never depends on colour and the date is available to a screen reader too.
 */
const testedChip: Component<TestedChipProps> = ({ props, page, site }) => {
  const counts =
    props.passed !== undefined || props.failed !== undefined || props.total !== undefined
      ? countsOf(props)
      : countsFor(site, page);
  if (counts === undefined) return null;

  const lang = page?.lang ?? "en";
  const state = stateOf(counts);
  const unavailable = state === "unavailable";
  const date = counts.lastPassed === undefined ? undefined : calendarDate(counts.lastPassed, lang);
  const tooltip = date === undefined ? undefined : t(lang, "tested_last_passed", { date: date.text });

  return h(
    "span",
    {
      class: classNameOf(state),
      role: "note",
      ...(unavailable
        ? {}
        : {
            "data-passed": counts.passed,
            "data-failed": counts.failed,
            ...(counts.total === undefined ? {} : { "data-total": counts.total }),
          }),
      ...(tooltip === undefined ? {} : { title: tooltip }),
    },
    icon(state),
    h("span", { class: LABEL_CLASS }, t(lang, STATE_LABEL_KEYS[state])),
    unavailable || counts.passed === 0 ? null : count(counts, "passed", lang),
    unavailable || counts.failed === 0 ? null : count(counts, "failed", lang),
    notRunOf(counts) === 0
      ? null
      : h("span", { class: `${COUNT_CLASS} ${COUNT_CLASS}-not-run` }, t(lang, "tested_not_run", { n: notRunOf(counts) })),
    tooltip === undefined ? null : h("span", { class: SR_CLASS }, tooltip),
  );
};

export default testedChip;
