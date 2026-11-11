import { h } from "preact";
import type { Component, Site, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Class on the banner. `style.css` styles it. */
export const CLASS = "drift-banner";

/** Class on the optional link to the drift report. */
export const DETAILS_CLASS = "drift-banner-details";

/** The i18n key with the singular message; the plural key is {@link PLURAL_KEY}. */
export const SINGULAR_KEY = "drift_finding";

/** The i18n key with the message for every count other than one. */
export const PLURAL_KEY = "drift_findings";

/** The i18n key with the text of the details link. */
export const DETAILS_KEY = "drift_details";

/** The three things the banner can report about a page's drift evidence. */
export const STATES = ["drifting", "stale", "unavailable"] as const;

export type DriftState = (typeof STATES)[number];

/** How serious the evidence is. `unknown` is the unavailable state; it never reads as healthy. */
export const SEVERITIES = ["error", "warning", "info", "unknown"] as const;

export type DriftSeverity = (typeof SEVERITIES)[number];

/** The i18n key with each state's visible label and its accessible name. */
export const STATE_KEYS: Readonly<Record<DriftState, string>> = {
  drifting: "drift_state_drifting",
  stale: "drift_state_stale",
  unavailable: "drift_state_unavailable",
};

/** The i18n key with each state's answer to what changed, and so what to do next. */
export const WHAT_KEYS: Readonly<Record<DriftState, string>> = {
  drifting: "drift_what_source",
  stale: "drift_what_content",
  unavailable: "drift_what_unavailable",
};

/**
 * Stroke paths for each state's icon, drawn on a 16×16 grid. Each state has its own shape, so the
 * banner never relies on colour alone. The shapes are direction-neutral and need no RTL flip.
 */
export const ICONS: Readonly<Record<DriftState, readonly string[]>> = {
  drifting: ["M8 1.8 14.8 13.5H1.2Z", "M8 6v3.25", "M8 11.2v.01"],
  stale: ["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "M8 4.25V8l2.5 1.5"],
  unavailable: [
    "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z",
    "M6.2 6.4a1.8 1.8 0 1 1 2.8 1.5c-.6.4-1 .8-1 1.6",
    "M8 11.4v.01",
  ],
};

/** One page's drift evidence: what the banner reports and how serious it is. */
export interface DriftEvidence {
  /** `drifting` when a finding names code, `stale` when only the page's own content is out of date. */
  readonly state: DriftState;
  /** The number of findings. `0` for the unavailable state, which has no count. */
  readonly count: number;
  /** The worst finding severity, or `unknown` when the check has no result. */
  readonly severity: DriftSeverity;
}

/** The `theme.options.drift` block as the config wrote it. */
interface DriftOptions {
  /** Where the report lives: a path on this site or an `https` link. */
  readonly detailsUrl?: unknown;
}

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/** A trimmed, non-empty string, or undefined. */
function textOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
}

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The URL-to-findings map inside `site.data.drift`. The engine's future `drift.json` output may write either
 * `{ "/page/": [ … ] }` or `{ pages: { "/page/": [ … ] } }`; both are accepted, and the nested form wins when
 * its `pages` member is an object.
 */
export function pagesOf(drift: unknown): Record<string, unknown> | undefined {
  if (!isRecord(drift)) return undefined;
  const nested = drift.pages;
  return isRecord(nested) ? nested : drift;
}

/** One page's findings, or undefined when the data has no array for its URL. */
export function findingsOf(site: Site, url: string): readonly unknown[] | undefined {
  const pages = pagesOf(site.data.drift);
  if (pages === undefined || !Object.hasOwn(pages, url)) return undefined;
  const value = pages[url];
  return Array.isArray(value) ? value : undefined;
}

/** How serious a finding is; a missing or unknown value reads as `warning`, the engine's default. */
function severityOf(finding: unknown): DriftSeverity {
  if (isRecord(finding) && (finding.severity === "error" || finding.severity === "info")) return finding.severity;
  return "warning";
}

/** The worst of two severities; `error` beats `warning` beats `info`. */
function worst(a: DriftSeverity, b: DriftSeverity): DriftSeverity {
  const rank: Readonly<Record<DriftSeverity, number>> = { error: 0, warning: 1, info: 2, unknown: 3 };
  return rank[b] < rank[a] ? b : a;
}

/** True when a finding names the code it cites, which is the source drift the engine's checks report. */
function namesCode(finding: unknown): boolean {
  return isRecord(finding) && (textOf(finding.kind) !== undefined || textOf(finding.reference) !== undefined);
}

/** The unavailable marker: a page the drift check has no result for. */
function isUnavailable(value: unknown): boolean {
  return value === null || (isRecord(value) && value.unavailable === true);
}

/**
 * The page's drift evidence from `site.data.drift`, keyed by its exact URL including `base`:
 *
 * - a non-empty list of findings is `drifting` when a finding names code and `stale` otherwise;
 * - an empty list is clean, and `undefined` keeps the banner hidden;
 * - `null` or `{ unavailable: true }` is the `unavailable` state;
 * - a missing page key, or data the site does not keep, is also `undefined`: a site without drift
 *   data shows no banner on any page.
 */
export function evidenceOf(site: Site, url: string): DriftEvidence | undefined {
  const pages = pagesOf(site.data.drift);
  if (pages === undefined || !Object.hasOwn(pages, url)) return undefined;
  const value = pages[url];
  if (isUnavailable(value)) return { state: "unavailable", count: 0, severity: "unknown" };
  if (!Array.isArray(value) || value.length === 0) return undefined;

  let severity: DriftSeverity = "info";
  let source = false;
  for (const finding of value) {
    severity = worst(severity, severityOf(finding));
    source = source || namesCode(finding);
  }
  return { state: source ? "drifting" : "stale", count: value.length, severity };
}

/** The details link from `theme.options.drift.detailsUrl`, safe and with `base` in front of a site path. */
export function detailsHrefOf(config: SiteConfig): string | undefined {
  const options = config.theme.options?.drift;
  if (!isRecord(options)) return undefined;
  const value = (options as DriftOptions).detailsUrl;
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!SAFE_URL.test(url)) return undefined;
  return url.startsWith("/") ? `${config.base}${url}` : url;
}

/** The banner's count in the page's language: singular for one finding, plural otherwise. */
export function messageOf(lang: string, n: number): string {
  return t(lang, n === 1 ? SINGULAR_KEY : PLURAL_KEY, { n });
}

/** What changed, and so what the reader should do next, in the page's language. */
export function whatOf(lang: string, state: DriftState): string {
  return t(lang, WHAT_KEYS[state]);
}

/** The state's inline icon. It is decorative: the label beside it carries the meaning for a screen reader. */
function icon(state: DriftState) {
  return h(
    "svg",
    {
      class: `${CLASS}-icon`,
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
 * A banner that reports a page's drift evidence. It reads the page's findings from `site.data.drift`,
 * keyed by page URL, and renders nothing when the page is clean or the site keeps no drift data.
 *
 * The state says what changed: `drifting` when a finding names code the page cites, `stale` when only
 * the page's own content is out of date, and `unavailable` when the check has no result for the page.
 * The severity comes from the worst finding, so the banner never presents an unknown state as healthy.
 * The optional details link, from `theme.options.drift.detailsUrl`, is where the reader goes next. The
 * doc layout places it above the page content, so an author does not write a directive.
 */
const driftBanner: Component = ({ site, page }) => {
  const evidence = evidenceOf(site, page.url);
  if (evidence === undefined) return null;

  const href = detailsHrefOf(site.config);
  const label = t(page.lang, STATE_KEYS[evidence.state]);

  return h(
    "aside",
    {
      class: `${CLASS} ${CLASS}-${evidence.state}`,
      role: "note",
      "aria-label": label,
      "data-drift-state": evidence.state,
      "data-drift-severity": evidence.severity,
    },
    icon(evidence.state),
    h("strong", { class: `${CLASS}-label` }, label),
    evidence.state === "unavailable"
      ? null
      : h("span", { class: `${CLASS}-message` }, messageOf(page.lang, evidence.count)),
    h("span", { class: `${CLASS}-what` }, whatOf(page.lang, evidence.state)),
    href === undefined ? null : h("a", { class: DETAILS_CLASS, href }, t(page.lang, DETAILS_KEY)),
  );
};

export default driftBanner;
