import type { Site } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/**
 * The examples evidence a page can have, in the tested-chip contract's vocabulary (the evidence
 * states issue #105 established) plus the three gaps the panel must keep visible and distinct.
 *
 * - `passed`, `partial`, `unrun`, `failed` match `components/tested-chip`'s states exactly, so the
 *   same report never reads "all passed" here while the chip says "partly tested".
 * - `none` is a recorded suite with zero counted examples; it says so, unlike `absent`.
 * - `invalid` is evidence that was written but cannot be read: a malformed count, a total smaller
 *   than the results it counts, or an `unrun` that contradicts the total. It never becomes
 *   zero-valued success evidence.
 * - `absent` is no report for the page at all.
 */
export const EXAMPLE_STATES = ["passed", "partial", "unrun", "failed", "none", "invalid", "absent"] as const;

export type ExampleState = (typeof EXAMPLE_STATES)[number];

/** Class on the examples row's value; the state is appended to it as `trust-panel-examples-<state>`. */
export const EXAMPLES_CLASS = "trust-panel-examples";

/** The page's examples evidence. Counts appear only when the report could be read. */
export interface ExamplesEvidence {
  /** The evidence state. */
  readonly state: ExampleState;
  /** Examples that passed; a non-negative integer. Present when the report could be read. */
  readonly passed?: number;
  /** Examples that failed; a non-negative integer. Present when the report could be read. */
  readonly failed?: number;
  /** Examples the report counted: the results plus any that did not run. Present when readable. */
  readonly total?: number;
  /** Examples the report counted but did not run, when there is at least one. */
  readonly unrun?: number;
}

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How one recorded field read: a valid count, not written at all, or written but unreadable. */
type CountReading =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" };

/**
 * One count as the tested-chip contract reads it: a non-negative integer, or one written as a
 * string. A field that is not written (`undefined` or `null`) is absent; anything else that is not
 * such a number (negative, fractional, blank, boolean, object, list) is unreadable, never a silent
 * zero.
 */
function readCount(value: unknown): CountReading {
  if (value === undefined || value === null) return { kind: "absent" };
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? { kind: "ok", value } : { kind: "unreadable" };
  }
  if (typeof value === "string") {
    const text = value.trim();
    const parsed = Number(text);
    return text !== "" && Number.isInteger(parsed) && parsed >= 0 ? { kind: "ok", value: parsed } : { kind: "unreadable" };
  }
  return { kind: "unreadable" };
}

/** Invalid evidence: written but unreadable, so no count is exposed with it. */
const INVALID: ExamplesEvidence = { state: "invalid" };

/** Absent evidence: no report for the page. */
const ABSENT: ExamplesEvidence = { state: "absent" };

/**
 * The state of a readable report, exactly as the tested-chip contract names it: `failed` when
 * anything failed, `unrun` when nothing completed but the report counted examples, `partial` when
 * some counted examples did not run, `none` for a recorded suite that counted nothing, and
 * `passed` otherwise. Failure keeps its own state even beside unrun examples, as in the chip.
 */
function stateOf(passed: number, failed: number, unrun: number): ExampleState {
  if (failed > 0) return "failed";
  if (passed === 0 && unrun > 0) return "unrun";
  if (unrun > 0) return "partial";
  if (passed === 0) return "none";
  return "passed";
}

/**
 * The evidence one `site.data.examples` entry carries. A value that is written but not an object (a
 * bare string or list) is unreadable evidence, so it is `invalid`, not absent. Counts are consumed
 * conservatively: a `total` smaller than `passed + failed`, or an `unrun` that contradicts `total`,
 * is an impossible report and stays `invalid` instead of being corrected into a run result.
 */
export function evidenceOf(value: unknown): ExamplesEvidence {
  if (value === undefined || value === null) return ABSENT;
  if (!isRecord(value)) return INVALID;

  const passed = readCount(value.passed);
  const failed = readCount(value.failed);
  const total = readCount(value.total);
  const unrun = readCount(value.unrun);
  if (
    passed.kind === "unreadable" ||
    failed.kind === "unreadable" ||
    total.kind === "unreadable" ||
    unrun.kind === "unreadable"
  ) {
    return INVALID;
  }

  const passedCount = passed.kind === "ok" ? passed.value : 0;
  const failedCount = failed.kind === "ok" ? failed.value : 0;
  const done = passedCount + failedCount;
  const counted = total.kind === "ok" ? total.value : undefined;
  const skipped = unrun.kind === "ok" ? unrun.value : undefined;

  let notRun: number;
  if (counted !== undefined) {
    if (counted < done) return INVALID;
    if (skipped !== undefined && counted !== done + skipped) return INVALID;
    notRun = counted - done;
  } else {
    notRun = skipped ?? 0;
  }

  const full = done + notRun;
  return {
    state: stateOf(passedCount, failedCount, notRun),
    passed: passedCount,
    failed: failedCount,
    total: full,
    ...(notRun === 0 ? {} : { unrun: notRun }),
  };
}

/** The evidence for one page in `site.data.examples`, keyed by URL. Never `undefined`: no data is `absent` evidence, which reads apart from unreadable or empty evidence. */
export function examplesFor(site: Site | undefined, url: string | undefined): ExamplesEvidence {
  if (url === undefined) return ABSENT;
  const examples = site?.data?.examples;
  if (!isRecord(examples) || !Object.hasOwn(examples, url)) return ABSENT;
  return evidenceOf(examples[url]);
}

/** The class of the examples row's value: the row class plus the state class. */
export function examplesClassName(state: ExampleState): string {
  return `${EXAMPLES_CLASS} ${EXAMPLES_CLASS}-${state}`;
}

/**
 * The machine-readable evidence on the examples row's value: the state always, and the counts only
 * when the report could be read. Invalid and absent evidence carries no numbers, so a scanner can
 * never mistake it for a recorded zero.
 */
export function examplesAttrs(evidence: ExamplesEvidence): Record<string, string | number> {
  if (evidence.state === "invalid" || evidence.state === "absent") {
    return { "data-trust-examples": evidence.state };
  }
  return {
    "data-trust-examples": evidence.state,
    "data-trust-examples-passed": evidence.passed ?? 0,
    "data-trust-examples-failed": evidence.failed ?? 0,
    "data-trust-examples-total": evidence.total ?? 0,
    ...(evidence.unrun === undefined ? {} : { "data-trust-examples-unrun": evidence.unrun }),
  };
}

/**
 * The examples row's text in the page's language, from existing catalog strings only. A report with
 * examples that did not run always says so beside the run result, so partial evidence, and a failed
 * suite with unrun examples, never reads as fully passed. The gaps read apart from each other:
 * absent is "not recorded", a recorded empty suite is "no examples recorded", unreadable evidence
 * is "unknown", and a suite that counted but completed nothing says how many did not run.
 */
export function examplesText(lang: string, evidence: ExamplesEvidence): string {
  const passed = evidence.passed ?? 0;
  const failed = evidence.failed ?? 0;
  const total = evidence.total ?? 0;
  const unrun = evidence.unrun ?? 0;

  const base = ((): string => {
    switch (evidence.state) {
      case "absent":
        return t(lang, "trust_not_recorded");
      case "invalid":
        return t(lang, "trust_level_unknown");
      case "none":
        return t(lang, "trust_examples_none");
      case "unrun":
        return t(lang, "tested_not_run", { n: total });
      case "failed":
        return t(lang, "trust_examples_failed", { failed, total });
      default:
        return t(lang, "trust_examples_passed", { passed, total });
    }
  })();

  // Only `partial` and a `failed` suite with unrun examples need the second sentence; `unrun` already says it.
  const saysNotRun = evidence.state === "unrun";
  return unrun > 0 && !saysNotRun ? `${base}, ${t(lang, "tested_not_run", { n: unrun })}` : base;
}
