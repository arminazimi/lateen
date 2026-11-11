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

/** The three states a chip reports. A partly run set is `partial`, never rounded up to `passed`. */
export const STATES = ["passed", "partial", "failed"] as const;

export type TestedChipState = (typeof STATES)[number];

/**
 * Stroke paths for each state's icon, drawn on a 16×16 grid. The states differ by shape as well
 * as by text, so colour is never the only signal. All shapes are direction-neutral.
 */
export const ICONS: Readonly<Record<TestedChipState, readonly string[]>> = {
  passed: ["m3.5 8.25 3 3 6-6"],
  partial: ["M8 2.25a5.75 5.75 0 0 1 0 11.5", "M8 2.25v11.5"],
  failed: ["m4.5 4.5 7 7", "m11.5 4.5-7 7"],
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

/** What the chip renders: the two counts and, when known, the ISO date of the last success. */
export interface TestedCounts {
  /** Examples that passed; a non-negative integer. */
  readonly passed: number;
  /** Examples that failed; a non-negative integer. */
  readonly failed: number;
  /** Examples the report counted, when the report records one larger than the results. */
  readonly total?: number;
  /** The ISO date of the last successful run, when there is one. */
  readonly lastPassed?: string;
}

/**
 * One count as a non-negative integer. A missing, blank, negative, fractional, or non-numeric value
 * is `0`, so a malformed attribute hides the chip instead of showing a wrong number.
 */
export function countOf(value: unknown): number {
  const count = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

/**
 * Counts from an examples entry or from a chip's props. Returns `undefined` when there is no data or
 * when no example ran, which is what hides the chip. A recorded `total` larger than `passed + failed`
 * is kept, so the chip can say how many examples did not run instead of implying full coverage. A
 * `total` smaller than the counts, or a missing one, is ignored.
 */
export function countsOf(value: unknown): TestedCounts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const passed = countOf(record.passed);
  const failed = countOf(record.failed);
  if (passed + failed === 0) return undefined;
  const reported = countOf(record.total);
  const total = reported > passed + failed ? reported : undefined;
  const raw = typeof record.lastPassed === "string" ? record.lastPassed.trim() : "";
  return {
    passed,
    failed,
    ...(total === undefined ? {} : { total }),
    ...(raw === "" ? {} : { lastPassed: raw }),
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

/** The state of a chip: `failed` when anything failed, `partial` when some examples did not run, otherwise `passed`. */
export function stateOf(counts: TestedCounts): TestedChipState {
  if (counts.failed > 0) return "failed";
  return counts.total !== undefined && counts.total > counts.passed + counts.failed ? "partial" : "passed";
}

/** How many examples the report counted but did not run. */
export function notRunOf(counts: TestedCounts): number {
  return Math.max((counts.total ?? 0) - counts.passed - counts.failed, 0);
}

/** Class names of the chip: `tested-chip` plus `tested-chip-<state>`. */
export function classNameOf(state: TestedChipState): string {
  return `${CHIP_CLASS} ${CHIP_CLASS}-${state}`;
}

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
 * entry in `site.data.examples`. It renders nothing when there is no data or when no example ran.
 * When the report's `total` is larger than the results, it says how many examples did not run and
 * reads as `partial`, so missing evidence never passes as a full result. A `lastPassed` date becomes
 * a `title` tooltip and a visually hidden sentence, in the page's calendar, so the chip never depends
 * on colour and the date is available to a screen reader too.
 */
const testedChip: Component<TestedChipProps> = ({ props, page, site }) => {
  const counts = props.passed !== undefined || props.failed !== undefined ? countsOf(props) : countsFor(site, page);
  if (counts === undefined) return null;

  const lang = page?.lang ?? "en";
  const state = stateOf(counts);
  const date = counts.lastPassed === undefined ? undefined : calendarDate(counts.lastPassed, lang);
  const tooltip = date === undefined ? undefined : t(lang, "tested_last_passed", { date: date.text });

  return h(
    "span",
    {
      class: classNameOf(state),
      role: "note",
      "data-passed": counts.passed,
      "data-failed": counts.failed,
      ...(counts.total === undefined ? {} : { "data-total": counts.total }),
      ...(tooltip === undefined ? {} : { title: tooltip }),
    },
    icon(state),
    h("span", { class: LABEL_CLASS }, t(lang, state === "partial" ? "tested_partial" : "tested")),
    counts.passed === 0 ? null : count(counts, "passed", lang),
    counts.failed === 0 ? null : count(counts, "failed", lang),
    state === "partial"
      ? h("span", { class: `${COUNT_CLASS} ${COUNT_CLASS}-not-run` }, t(lang, "tested_not_run", { n: notRunOf(counts) }))
      : null,
    tooltip === undefined ? null : h("span", { class: SR_CLASS }, tooltip),
  );
};

export default testedChip;
