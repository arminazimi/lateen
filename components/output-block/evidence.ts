import { h } from "preact";

/**
 * Execution evidence: what an author declares about the recorded output itself, kept apart from the
 * output text. The three kinds — the stream the text came out of, the exit code of the command that
 * printed it, and the time it took — each have exactly one of three states:
 *
 * - `"omitted"`: the directive declares nothing. Nothing is inferred from it, in particular never success.
 * - `"invalid"`: the directive declares something the contract below does not accept. The text as written
 *   is kept so the reader can see what was declared; it never becomes a value and never a success claim.
 * - `"valid"`: the parsed value, carried under `value`.
 *
 * The rules are strict and documented:
 *
 * - a stream is exactly `stdout`, `stderr`, or `combined` (surrounding space trimmed, case as written);
 * - an exit code is a plain decimal integer with no sign, no base prefix, no digit separators, and no
 *   exponent, and only 0–255 — the range a shell can carry — is valid; a zero is the author's claim,
 *   never implied by silence;
 * - a duration is whole milliseconds — `340`, `340ms`, `1.5s`, `0.125s` — with at most millisecond
 *   resolution and at most one hour, built from the matched digits so no float rounding can enter.
 */

/** One of the three states the evidence for one prop can be in. */
export type EvidenceState = "omitted" | "invalid" | "valid";

/** The evidence for one declaration: its state, the parsed value when valid, and the raw text when invalid. */
export type Evidence = {
  readonly state: EvidenceState;
  /** The parsed value, present only when `state` is `valid`. */
  readonly value?: string | number;
  /** The declared text, present only when `state` is `invalid`, so the reader can see what was wrong. */
  readonly declared?: string;
};

/** The evidence entry for an omitted declaration: nothing declared, nothing inferred. */
export const OMITTED: Evidence = { state: "omitted" };

/** The streams an author may declare, exactly as written. */
export const STREAMS: readonly string[] = ["stdout", "stderr", "combined"];

/** The largest exit code a shell can carry; `exit=256` and above are author errors, not evidence. */
export const MAX_EXIT = 255;

/** The longest duration recorded, in milliseconds: an hour. Anything longer is a declaration error. */
export const MAX_DURATION_MS = 3_600_000;

/** True when the prop is a string holding something besides spaces. */
function declared(raw: string | undefined): raw is string {
  return typeof raw === "string" && raw.trim() !== "";
}

/** An invalid declaration, carrying the text as written so it is distinguishable from an omission. */
function invalid(raw: string): Evidence {
  return { state: "invalid", declared: raw.trim() };
}

/**
 * The declared stream. `stdout`, `stderr`, and `combined` are valid, with surrounding space trimmed and
 * the case as written; anything else declared is invalid, never silently read as one of the three.
 */
export function streamOf(raw: string | undefined): Evidence {
  if (!declared(raw)) return OMITTED;
  const text = raw.trim();
  return STREAMS.includes(text) ? { state: "valid", value: text } : invalid(text);
}

/**
 * The declared exit code as a number. The accepted form is a plain decimal integer: no sign, no `0x` or
 * `0b` prefix, no digit separators, no exponent, and no leading zero except the single `0`. Only 0–255
 * is valid; every valid code is recorded exactly as declared, so zero stays zero and seven stays seven.
 */
export function exitOf(raw: string | undefined): Evidence {
  if (!declared(raw)) return OMITTED;
  const text = raw.trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) return invalid(text);
  const code = Number(text);
  if (!Number.isSafeInteger(code) || code > MAX_EXIT) return invalid(text);
  return { state: "valid", value: code };
}

/**
 * The declared duration in whole milliseconds. Accepted forms: a plain non-negative decimal integer read
 * as milliseconds (`340`, `0`), the same with an explicit `ms` suffix (`340ms`), or a plain decimal number
 * with an `s` suffix and at most three decimal places (`2s`, `1.5s`, `0.125s`). The value in milliseconds
 * is built from the matched digits, never by floating-point scaling, so `28.9s` is exactly 28900 ms. A
 * fraction finer than a millisecond, a sign, another unit, or a value above {@link MAX_DURATION_MS} is
 * invalid.
 */
export function durationOf(raw: string | undefined): Evidence {
  if (!declared(raw)) return OMITTED;
  const text = raw.trim();
  const whole = /^(0|[1-9][0-9]*)(ms|s)?$/.exec(text);
  if (whole !== null && whole[2] !== "s") {
    const ms = Number(whole[1]);
    if (!Number.isSafeInteger(ms) || ms > MAX_DURATION_MS) return invalid(text);
    return { state: "valid", value: ms };
  }
  const seconds = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?s$/.exec(text);
  if (seconds === null) return invalid(text);
  const ms = Number(seconds[1]) * 1000 + Number((seconds[2] ?? "0").padEnd(3, "0"));
  if (!Number.isSafeInteger(ms) || ms > MAX_DURATION_MS) return invalid(text);
  return { state: "valid", value: ms };
}

/** The full evidence record: one entry per declared kind, each with its state spelled out. */
export type EvidenceRecord = {
  readonly stream: Evidence;
  readonly exit: Evidence;
  readonly duration: Evidence;
};

/** The evidence for the three props, each state explicit, so omitted, invalid, and valid never blur. */
export function evidenceOf(props: {
  stream?: string;
  exit?: string;
  duration?: string;
}): EvidenceRecord {
  return {
    stream: streamOf(props.stream),
    exit: exitOf(props.exit),
    duration: durationOf(props.duration),
  };
}

/** True when any of the three props is declared, validly or not. */
export function hasEvidence(props: { stream?: string; exit?: string; duration?: string }): boolean {
  const record = evidenceOf(props);
  return record.stream.state !== "omitted" || record.exit.state !== "omitted" || record.duration.state !== "omitted";
}

/** The element the rendered evidence record is read back from. */
export const EVIDENCE_SELECTOR = "[data-output-evidence]";

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
function scriptJson(record: EvidenceRecord): string {
  return JSON.stringify(record).replace(/</g, "\\u003c");
}

/**
 * The machine-readable evidence: an inert JSON script with all three states, so an agent reads the
 * stream, exit code, and duration without scraping visual labels or touching the recorded text. It
 * renders only when something is declared; a block with no evidence carries no script at all.
 */
export function evidenceElement(props: { stream?: string; exit?: string; duration?: string }) {
  if (!hasEvidence(props)) return null;
  return h("script", {
    type: "application/json",
    "data-output-evidence": "",
    dangerouslySetInnerHTML: { __html: scriptJson(evidenceOf(props)) },
  });
}
