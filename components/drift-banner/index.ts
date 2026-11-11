import { h } from "preact";
import type { Component, Site, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Class on the banner. `style.css` styles it. */
export const CLASS = "drift-banner";

/** Class on the optional link to the drift report. */
export const DETAILS_CLASS = "drift-banner-details";

/** Class on the list of individual findings. */
export const FINDINGS_CLASS = "drift-banner-findings";

/** Class on one finding in the list. */
export const FINDING_CLASS = "drift-banner-finding";

/** Class on a finding's severity token. */
export const FINDING_SEVERITY_CLASS = `${FINDING_CLASS}-severity`;

/** Class on a finding's check id. */
export const FINDING_KIND_CLASS = `${FINDING_CLASS}-kind`;

/** Class on a finding's validated source reference. */
export const FINDING_REFERENCE_CLASS = `${FINDING_CLASS}-reference`;

/** Class on a finding's message. */
export const FINDING_MESSAGE_CLASS = `${FINDING_CLASS}-message`;

/** Class on a finding that carries no usable evidence. */
export const FINDING_UNAVAILABLE_CLASS = `${FINDING_CLASS}-unavailable`;

/** Class on the text that says a finding carries no usable evidence. */
export const FINDING_NOTE_CLASS = `${FINDING_CLASS}-note`;

/** Class on the link from a finding to its evidence. */
export const FINDING_LINK_CLASS = `${FINDING_CLASS}-link`;

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

/** A finding's validated source span: a repository-relative path and, when supplied, 1-based lines and column. */
export interface FindingSpan {
  readonly path: string;
  /** The first cited line. */
  readonly line?: number;
  /** The last cited line of a range, never before {@link line}. */
  readonly endLine?: number;
  /** The cited column on {@link line}. */
  readonly column?: number;
}

/** One row of the finding list, with only the evidence the data actually supplied. */
export interface FindingDetail {
  /** The stable anchor id: `drift-banner-finding-<position>`, counting from one. */
  readonly id: string;
  /** The finding's severity; a missing or unknown value reads as `warning`, like the banner's. */
  readonly severity: DriftSeverity;
  /** The check that found it, `kind` or a diagnostic `id`, when it is a single safe token. */
  readonly kind?: string;
  /** The canonical source reference, such as `src/app.ts:12:5`, when the finding supplies a valid span. */
  readonly reference?: string;
  /** The parsed span behind {@link reference}. */
  readonly span?: FindingSpan;
  /** The finding's message, escaped as text. */
  readonly message?: string;
  /** A safe evidence link, with `base` in front of a site path. */
  readonly href?: string;
  /** False when the finding has nothing readable to show; the row says so instead of inventing evidence. */
  readonly available: boolean;
}

/** `path:line`, `path:line-endLine`, or `path:line:column`; the path may also stand alone. */
const REFERENCE = /^(.+?)(?::(\d+)(?:-(\d+))?(?::(\d+))?)?$/;

/** A check id or similar machine token: no spaces, quotes, or markup, and short enough to stay a token. */
const TOKEN = /^[^\s<>"`]{1,80}$/;

/** A 1-based whole number, from a number or a decimal string, or undefined. */
function positionOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 ? value : undefined;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const number = Number(value.trim());
    return Number.isSafeInteger(number) && number >= 1 ? number : undefined;
  }
  return undefined;
}

/**
 * A repository-relative path: no scheme, no leading slash, no backslash or whitespace, and no `..`
 * segment. Anything else is not a source claim, so the banner leaves it out.
 */
function pathOf(value: unknown): string | undefined {
  const text = textOf(value);
  if (text === undefined) return undefined;
  if (/[\s:<>"`\\]/.test(text)) return undefined;
  if (text.startsWith("/")) return undefined;
  return text.split("/").includes("..") ? undefined : text;
}

/** A valid span, dropping an end line before the start or a column without a line. */
function spanOfParts(path: string, line?: number, endLine?: number, column?: number): FindingSpan {
  return {
    path,
    ...(line === undefined ? {} : { line }),
    ...(line === undefined || endLine === undefined || endLine < line ? {} : { endLine }),
    ...(line === undefined || column === undefined ? {} : { column }),
  };
}

/**
 * The span a finding supplies, from `reference` (`path:line`, `path:line-endLine`, `path:line:column`)
 * or from `path`/`file` plus `line`, `endLine`, and `column`. A malformed value is dropped rather than
 * guessed at, so no bad number becomes a source claim.
 */
export function spanOf(finding: unknown): FindingSpan | undefined {
  if (!isRecord(finding)) return undefined;
  const reference = textOf(finding.reference);
  if (reference !== undefined) {
    const match = REFERENCE.exec(reference);
    if (match !== null) {
      const path = pathOf(match[1]);
      if (path !== undefined) {
        const line = match[2] === undefined ? undefined : positionOf(match[2]);
        const endLine = match[3] === undefined ? undefined : positionOf(match[3]);
        const column = match[4] === undefined ? undefined : positionOf(match[4]);
        const complete =
          (match[2] === undefined || line !== undefined) &&
          (match[3] === undefined || endLine !== undefined) &&
          (match[4] === undefined || column !== undefined);
        if (complete && (endLine === undefined || (line !== undefined && endLine >= line))) {
          return spanOfParts(path, line, endLine, column);
        }
      }
    }
  }

  const path = pathOf(finding.path) ?? pathOf(finding.file);
  if (path === undefined) return undefined;
  return spanOfParts(path, positionOf(finding.line), positionOf(finding.endLine), positionOf(finding.column));
}

/** The canonical text of a span, in the engine's `path:line-endLine:column` order without empty parts. */
export function referenceOf(span: FindingSpan): string {
  const range = span.line === undefined ? "" : `:${span.line}${span.endLine === undefined ? "" : `-${span.endLine}`}`;
  const column = span.column === undefined ? "" : `:${span.column}`;
  return `${span.path}${range}${column}`;
}

/** The check id a finding names, from `kind` or `id`, when it is a safe machine token. */
function kindOf(finding: unknown): string | undefined {
  if (!isRecord(finding)) return undefined;
  const kind = textOf(finding.kind) ?? textOf(finding.id);
  return kind !== undefined && TOKEN.test(kind) ? kind : undefined;
}

/** A safe evidence link from a finding's `url`, with `base` in front of a site path. */
export function evidenceHrefOf(config: SiteConfig | undefined, value: unknown): string | undefined {
  const text = textOf(value);
  if (text === undefined || !SAFE_URL.test(text)) return undefined;
  const href = text.startsWith("/") ? `${config?.base ?? ""}${text}` : text;
  return SAFE_URL.test(href) ? href : undefined;
}

/**
 * The rows of the finding list, one per input finding so the list and the summary count always agree.
 * Each row keeps only the evidence it can show: a safe kind, a validated span, a message, and a safe
 * link. A finding with none of those is marked unavailable rather than given an invented reference.
 */
export function findingDetailsOf(findings: readonly unknown[], config?: SiteConfig): FindingDetail[] {
  return findings.map((finding, index) => {
    const kind = kindOf(finding);
    const span = spanOf(finding);
    const message = isRecord(finding) ? textOf(finding.message) : undefined;
    const href = isRecord(finding) ? evidenceHrefOf(config, finding.url) : undefined;
    return {
      id: `${FINDING_CLASS}-${index + 1}`,
      severity: severityOf(finding),
      ...(kind === undefined ? {} : { kind }),
      ...(span === undefined ? {} : { reference: referenceOf(span), span }),
      ...(message === undefined ? {} : { message }),
      ...(href === undefined ? {} : { href }),
      available: kind !== undefined || span !== undefined || message !== undefined || href !== undefined,
    };
  });
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
 * One finding: its severity, check id, source span, and message. The reference is the evidence link when
 * the finding supplies a safe `url`; otherwise it is plain text. Machine values stay left to right under
 * RTL, so a path never reverses.
 */
function findingRow(detail: FindingDetail, lang: string) {
  const href = detail.href;
  const span = detail.span;

  const linked = detail.kind !== undefined && href !== undefined && detail.reference === undefined;
  const kind =
    detail.kind === undefined
      ? null
      : linked
        ? h("a", { class: `${FINDING_KIND_CLASS} ${FINDING_LINK_CLASS}`, href, dir: "ltr" }, detail.kind)
        : h("code", { class: FINDING_KIND_CLASS, dir: "ltr" }, detail.kind);

  const reference =
    detail.reference === undefined
      ? null
      : href === undefined
        ? h("code", { class: FINDING_REFERENCE_CLASS, dir: "ltr" }, detail.reference)
        : h("a", { class: `${FINDING_REFERENCE_CLASS} ${FINDING_LINK_CLASS}`, href, dir: "ltr" }, detail.reference);

  const messageLinked = href !== undefined && detail.kind === undefined && detail.reference === undefined;
  const message =
    detail.message === undefined
      ? null
      : messageLinked
        ? h("a", { class: `${FINDING_MESSAGE_CLASS} ${FINDING_LINK_CLASS}`, href }, detail.message)
        : h("span", { class: FINDING_MESSAGE_CLASS }, detail.message);

  const emptyLink =
    href === undefined || detail.kind !== undefined || detail.reference !== undefined || detail.message !== undefined
      ? null
      : h("a", { class: FINDING_LINK_CLASS, href }, t(lang, DETAILS_KEY));

  return h(
    "li",
    {
      id: detail.id,
      class: detail.available ? FINDING_CLASS : `${FINDING_CLASS} ${FINDING_UNAVAILABLE_CLASS}`,
      "data-drift-severity": detail.severity,
      "data-drift-finding-available": detail.available ? "true" : "false",
      ...(span === undefined
        ? {}
        : {
            "data-drift-path": span.path,
            ...(span.line === undefined ? {} : { "data-drift-line": String(span.line) }),
            ...(span.endLine === undefined ? {} : { "data-drift-end-line": String(span.endLine) }),
            ...(span.column === undefined ? {} : { "data-drift-column": String(span.column) }),
          }),
    },
    h("span", { class: FINDING_SEVERITY_CLASS, dir: "ltr" }, detail.severity),
    kind,
    reference,
    message,
    detail.available ? null : h("span", { class: FINDING_NOTE_CLASS }, t(lang, "trust_not_recorded")),
    emptyLink,
  );
}

/**
 * A banner that reports a page's drift evidence. It reads the page's findings from `site.data.drift`,
 * keyed by page URL, and renders nothing when the page is clean or the site keeps no drift data.
 *
 * The state says what changed: `drifting` when a finding names code the page cites, `stale` when only
 * the page's own content is out of date, and `unavailable` when the check has no result for the page.
 * The severity comes from the worst finding, so the banner never presents an unknown state as healthy.
 * Each finding in the list keeps its own severity, validated source span, and evidence link, so a reader
 * or agent can move from the count to the evidence behind it. The optional details link, from
 * `theme.options.drift.detailsUrl`, is where the reader goes next. The doc layout places the banner above
 * the page content, so an author does not write a directive.
 */
const driftBanner: Component = ({ site, page }) => {
  const evidence = evidenceOf(site, page.url);
  if (evidence === undefined) return null;

  const findings = evidence.state === "unavailable" ? undefined : findingsOf(site, page.url);
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
    findings === undefined
      ? null
      : h(
          "ul",
          { class: FINDINGS_CLASS },
          ...findingDetailsOf(findings, site.config).map((detail) => findingRow(detail, page.lang)),
        ),
    href === undefined ? null : h("a", { class: DETAILS_CLASS, href }, t(page.lang, DETAILS_KEY)),
  );
};

export default driftBanner;
