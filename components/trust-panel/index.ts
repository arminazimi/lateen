import { h } from "preact";
import type { Component, Page, Site, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { calendarDate } from "../../src/dates.ts";

/**
 * The trust states the panel understands, strongest first. `verified` means all evidence is recorded
 * and clean; `partial`, `unreviewed`, and `unknown` name what is missing instead of rounding it up.
 */
export const LEVELS = ["verified", "partial", "unreviewed", "unknown"] as const;

export type TrustLevel = (typeof LEVELS)[number];

/** Class on the disclosure root; `style.css` styles it. */
export const CLASS = "trust-panel";

/** Class on the visible chip, the `<summary>` of the disclosure. */
export const CHIP_CLASS = "trust-panel-chip";

/** Class on the chip's icon. It is decorative: the level text carries the meaning. */
export const ICON_CLASS = "trust-panel-icon";

/** Class on the chip's level text. */
export const LEVEL_CLASS = "trust-panel-level";

/** Class on the panel below the chip. */
export const BODY_CLASS = "trust-panel-body";

/** Class on the definition list that holds the rows. */
export const ROWS_CLASS = "trust-panel-rows";

/** Class on a row's label. */
export const LABEL_CLASS = "trust-panel-label";

/** Class on a row's value. */
export const VALUE_CLASS = "trust-panel-value";

/** Class on the "why this level" heading. */
export const REASONS_LABEL_CLASS = "trust-panel-reasons-label";

/** Class on the list of reasons. */
export const REASONS_CLASS = "trust-panel-reasons";

/** Class on the row of action links. */
export const ACTIONS_CLASS = "trust-panel-actions";

/** Class on an action link. */
export const ACTION_CLASS = "trust-panel-action";

/** Props from the directive, for a manual panel: `::trust-panel{level=verified reasons="…" lastReviewer="…"}`. */
export type TrustPanelProps = {
  /** `verified`, `partial`, `unreviewed`, or `unknown`; any other value renders nothing. */
  level?: string;
  /** Why the page has this state. A string is split on line breaks or `|`. */
  reasons?: string;
  /** Who reviewed the page last. */
  lastReviewer?: string;
  /** The build that produced the evidence, for a manual panel that carries one. */
  buildId?: string;
  /** The build's generation date, for a manual panel that carries one. */
  generatedAt?: string;
  /** The page's last review date, for a manual panel that carries one. */
  reviewedAt?: string;
};

/** One page's trust entry, as `site.data.trust` or the directive writes it. */
export interface TrustEntry {
  /** The page's trust state. */
  readonly level: TrustLevel;
  /** Why the page has this state, in display order. */
  readonly reasons: readonly string[];
  /** Who reviewed the page last, when the site records one. */
  readonly lastReviewer?: string;
  /** The build that produced this evidence, when the site records it. */
  readonly buildId?: string;
  /** When the build that produced this evidence ran. */
  readonly generatedAt?: string;
  /** When a person last reviewed the page. */
  readonly reviewedAt?: string;
}

/**
 * Valid same-build provenance for one panel. Every member is optional: a site that records none gets no
 * attribute, no date row, and no filled action placeholder, so missing evidence stays unknown.
 */
export interface Provenance {
  /** The build the evidence came from. */
  readonly buildId?: string;
  /** The build's generation date, in ISO 8601 form. */
  readonly generatedAt?: string;
  /** The last human review date, in ISO 8601 form. */
  readonly reviewedAt?: string;
}

/** The examples record the panel shows: the shape `site.data.examples` uses. */
export interface ExampleCounts {
  /** Examples that passed. */
  readonly passed: number;
  /** Examples that failed. */
  readonly failed: number;
}

/** The action links a site can configure under `theme.options.trust`. */
interface TrustOptions {
  /** A link that copies or opens the page's context pack. */
  readonly contextPackUrl?: unknown;
  /** A link that opens the host's edit or new-issue form for the page. */
  readonly suggestEditUrl?: unknown;
}

/** Stroke paths for each state's icon, drawn on a 16×16 grid. The shapes differ, so colour is never the only signal. */
export const ICONS: Readonly<Record<TrustLevel, readonly string[]>> = {
  verified: ["m3.5 8.25 3 3 6-6"],
  partial: ["M8 2.25a5.75 5.75 0 0 1 0 11.5", "M8 2.25v11.5"],
  unreviewed: ["M8 2.25a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5Z", "M5.5 8h5"],
  unknown: ["M6.1 6a2 2 0 1 1 2.9 1.8c-.6.35-.9.8-.9 1.4v.4", "M8 12.3h.01"],
};

/** The i18n key of each state's label. */
const LEVEL_KEYS: Readonly<Record<TrustLevel, string>> = {
  verified: "trust_level_verified",
  partial: "trust_level_partial",
  unreviewed: "trust_level_unreviewed",
  unknown: "trust_level_unknown",
};

/** The i18n key of the explanation a state shows when the entry records no reasons of its own. */
const WHY_KEYS: Readonly<Record<TrustLevel, string>> = {
  verified: "trust_why_verified",
  partial: "trust_why_partial",
  unreviewed: "trust_why_unreviewed",
  unknown: "trust_why_unknown",
};

/**
 * The names the first trust score wrote for the states it had. They read as the nearest state in
 * this vocabulary, so existing `_data/trust.yml` files keep their meaning.
 */
const ALIASES: Readonly<Record<string, TrustLevel>> = {
  "review-due": "unreviewed",
  "at-risk": "partial",
};

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A trimmed, non-empty string, or undefined. */
function textOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
}

/** The level a value names, matched without case or surrounding spaces and with spaces or `_` as `-`. */
export function levelOf(value: unknown): TrustLevel | undefined {
  const text = textOf(value);
  if (text === undefined) return undefined;
  const level = text.toLowerCase().replace(/[\s_]+/g, "-");
  return (LEVELS as readonly string[]).includes(level) ? (level as TrustLevel) : ALIASES[level];
}

/** A list of reasons from an array or a string split on line breaks or `|`. Blank entries are dropped. */
export function reasonsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n|\s*\|\s*/)
      .map((reason) => reason.trim())
      .filter((reason) => reason !== "");
  }
  if (!Array.isArray(value)) return [];
  return value.map(textOf).filter((reason): reason is string => reason !== undefined);
}

/** The entry on one value, or undefined when it has no level. */
export function entryOf(value: unknown): TrustEntry | undefined {
  if (!isRecord(value)) return undefined;
  const level = levelOf(value.level);
  if (level === undefined) return undefined;
  const lastReviewer = textOf(value.lastReviewer);
  const buildId = textOf(value.buildId);
  const generatedAt = textOf(value.generatedAt);
  const reviewedAt = textOf(value.reviewedAt);
  return {
    level,
    reasons: reasonsOf(value.reasons),
    ...(lastReviewer === undefined ? {} : { lastReviewer }),
    ...(buildId === undefined ? {} : { buildId }),
    ...(generatedAt === undefined ? {} : { generatedAt }),
    ...(reviewedAt === undefined ? {} : { reviewedAt }),
  };
}

/**
 * The URL-to-entry map inside `site.data.trust`. The future `trust.json` output may write either
 * `{ "/page/": { … } }` or `{ pages: { "/page/": { … } } }`; both are accepted, and the nested form
 * wins when its `pages` member is an object.
 */
export function pagesOf(trust: unknown): Record<string, unknown> | undefined {
  if (!isRecord(trust)) return undefined;
  const nested = trust.pages;
  return isRecord(nested) ? nested : trust;
}

/** The page's trust entry from `site.data.trust`, keyed by its exact URL including `base`. */
export function entryFor(site: Site | undefined, url: string | undefined): TrustEntry | undefined {
  if (url === undefined) return undefined;
  const pages = pagesOf(site?.data?.trust);
  if (pages === undefined || !Object.hasOwn(pages, url)) return undefined;
  return entryOf(pages[url]);
}

/** A whole, non-negative count, or undefined. */
function countOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

/** The page's example counts from `site.data.examples`, keyed by URL. */
export function examplesFor(site: Site | undefined, url: string | undefined): ExampleCounts | undefined {
  if (url === undefined) return undefined;
  const examples = site?.data?.examples;
  if (!isRecord(examples) || !Object.hasOwn(examples, url)) return undefined;
  const value = examples[url];
  if (!isRecord(value)) return undefined;
  return { passed: countOf(value.passed) ?? 0, failed: countOf(value.failed) ?? 0 };
}

/** The number of drift findings the page has in `site.data.drift`, or undefined when the site records none. */
export function driftFor(site: Site | undefined, url: string | undefined): number | undefined {
  if (url === undefined) return undefined;
  const pages = pagesOf(site?.data?.drift);
  if (pages === undefined || !Object.hasOwn(pages, url)) return undefined;
  const value = pages[url];
  return Array.isArray(value) ? value.length : undefined;
}

/** One valid ISO date: the written value for `<time datetime>` and its calendar day for comparisons. */
interface ProvenanceDate {
  readonly iso: string;
  readonly day: string;
}

/** A real ISO calendar date from a string or a `Date`, or undefined when it is impossible or malformed. */
function provenanceDate(value: unknown): ProvenanceDate | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const iso = value.toISOString().slice(0, 10);
    return { iso, day: iso };
  }
  const text = textOf(value);
  if (text === undefined) return undefined;
  const calendar = calendarDate(text, "en");
  return calendar === undefined ? undefined : { iso: text, day: calendar.datetime };
}

/** The `site.data.build` block, or undefined when the site writes none. */
function buildOf(site: Site | undefined): Record<string, unknown> | undefined {
  const build = site?.data?.build;
  return isRecord(build) ? build : undefined;
}

/** The page's review date from the documented reviewers shape, keyed by page URL. */
function reviewDateOf(site: Site | undefined, url: string | undefined): ProvenanceDate | undefined {
  if (url === undefined) return undefined;
  const reviewers = site?.data?.reviewers;
  if (!isRecord(reviewers) || !Object.hasOwn(reviewers, url)) return undefined;
  const review = reviewers[url];
  return isRecord(review) ? provenanceDate(review.date) : undefined;
}

/** The build's as-of date, which anchors what counts as future evidence. No clock is read. */
function buildAsOf(contents: Record<string, unknown> | undefined, site: Site | undefined): ProvenanceDate | undefined {
  const fromBuild = provenanceDate(contents?.asOf) ?? provenanceDate(contents?.date);
  if (fromBuild !== undefined) return fromBuild;
  const reviewers = site?.data?.reviewers;
  return isRecord(reviewers) ? provenanceDate(reviewers.asOf) : undefined;
}

/**
 * The panel's valid provenance, from the trust entry first, then the documented build and reviewer shapes.
 *
 * - `buildId` is the entry's `buildId`, else `site.data.build.id`.
 * - `generatedAt` is the entry's `generatedAt`, else `site.data.build.generatedAt`, `date`, or `asOf`.
 * - `reviewedAt` is the entry's `reviewedAt`, else the page's `site.data.reviewers[url].date`.
 *
 * A malformed date is omitted. A date after the build's as-of day is future evidence and is omitted too,
 * as is a review dated after the generation it claims to describe. When the entry names a build and the
 * current build names another, the entry's build provenance is stale and is left out entirely. Provenance
 * never changes the level: it only says which build and review the recorded evidence describes.
 */
export function provenanceOf(site: Site | undefined, url: string | undefined, entry?: TrustEntry): Provenance {
  const build = buildOf(site);
  const buildId = textOf(build?.id);
  const entryBuildId = entry?.buildId;
  const mismatch = entryBuildId !== undefined && buildId !== undefined && entryBuildId !== buildId;
  const asOf = buildAsOf(build, site);

  let generated = mismatch
    ? undefined
    : (provenanceDate(entry?.generatedAt) ??
      provenanceDate(build?.generatedAt) ??
      provenanceDate(build?.date) ??
      provenanceDate(build?.asOf));
  let reviewed = provenanceDate(entry?.reviewedAt) ?? reviewDateOf(site, url);

  if (asOf !== undefined) {
    if (generated !== undefined && generated.day > asOf.day) generated = undefined;
    if (reviewed !== undefined && reviewed.day > asOf.day) reviewed = undefined;
  }
  if (generated !== undefined && reviewed !== undefined && reviewed.day > generated.day) reviewed = undefined;

  const validBuildId = mismatch ? undefined : (entryBuildId ?? buildId);
  return {
    ...(validBuildId === undefined ? {} : { buildId: validBuildId }),
    ...(generated === undefined ? {} : { generatedAt: generated.iso }),
    ...(reviewed === undefined ? {} : { reviewedAt: reviewed.iso }),
  };
}

/** The examples row's text in the page's language. */
export function examplesText(lang: string, counts: ExampleCounts | undefined): string {
  if (counts === undefined) return t(lang, "trust_not_recorded");
  const total = counts.passed + counts.failed;
  if (total === 0) return t(lang, "trust_examples_none");
  if (counts.failed > 0) return t(lang, "trust_examples_failed", { failed: counts.failed, total });
  return t(lang, "trust_examples_passed", { passed: counts.passed, total });
}

/** The drift row's text in the page's language. */
export function driftText(lang: string, findings: number | undefined): string {
  if (findings === undefined) return t(lang, "trust_not_recorded");
  if (findings === 0) return t(lang, "trust_drift_none");
  return t(lang, findings === 1 ? "drift_finding" : "drift_findings", { n: findings });
}

/** The reviewer row's text in the page's language. */
export function reviewerText(lang: string, reviewer: string | undefined): string {
  return reviewer === undefined ? t(lang, "trust_reviewer_none") : t(lang, "trust_reviewed_by", { reviewer });
}

/**
 * Why the page has its state, in the page's language: the entry's own reasons, or what the state
 * means when the site recorded none. The panel always explains itself, so a state is never just a
 * badge.
 */
export function explanationOf(lang: string, state: TrustLevel, reasons: readonly string[]): readonly string[] {
  return reasons.length > 0 ? reasons : [t(lang, WHY_KEYS[state])];
}

/** The `theme.options.trust` block, or undefined when the site has none. */
function trustOptions(config: SiteConfig | undefined): TrustOptions | undefined {
  const options = config?.theme.options?.trust;
  return isRecord(options) ? (options as TrustOptions) : undefined;
}

/**
 * Fills `{url}`, `{title}`, `{source}`, `{build}`, `{generated}`, and `{reviewed}` in a configured action
 * URL for this page. Provenance placeholders with no valid evidence return undefined, so the link is left
 * out rather than losing the build context it promises.
 */
function fill(value: string, page: Page, provenance: Provenance): string | undefined {
  const source = page.source.file
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const values: Readonly<Record<string, string | undefined>> = {
    url: page.url,
    title: encodeURIComponent(page.title),
    source,
    build: provenance.buildId === undefined ? undefined : encodeURIComponent(provenance.buildId),
    generated: provenance.generatedAt === undefined ? undefined : encodeURIComponent(provenance.generatedAt),
    reviewed: provenance.reviewedAt === undefined ? undefined : encodeURIComponent(provenance.reviewedAt),
  };

  let filled = value;
  for (const [name, resolved] of Object.entries(values)) {
    if (resolved === undefined) {
      if (filled.includes(`{${name}}`)) return undefined;
      continue;
    }
    filled = filled.replaceAll(`{${name}}`, resolved);
  }
  return filled;
}

/**
 * An action link from `theme.options.trust`, with `base` in front of a site path. Returns undefined
 * when the value is missing, unsafe, not a string, or asks for provenance the page does not have.
 */
export function actionHrefOf(
  config: SiteConfig | undefined,
  page: Page,
  value: unknown,
  provenance: Provenance = {},
): string | undefined {
  const text = textOf(value);
  if (text === undefined) return undefined;
  const filled = fill(text, page, provenance);
  if (filled === undefined || !SAFE_URL.test(filled)) return undefined;
  return filled.startsWith("/") ? `${config?.base ?? ""}${filled}` : filled;
}

/** The chip's icon; it is decorative, so the level text carries the meaning. */
function icon(level: TrustLevel) {
  return h(
    "svg",
    {
      class: ICON_CLASS,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ICONS[level].map((d) => h("path", { d })),
  );
}

/** One row of the panel: a label and its value. */
function row(label: string, value: string, className: string) {
  return [
    h("dt", { class: LABEL_CLASS }, label),
    h("dd", { class: `${VALUE_CLASS} ${className}` }, value),
  ];
}

/** One provenance row: its existing translated label and an exact `<time>` value in the page's calendar. */
function dateRow(label: string, iso: string | undefined, lang: string, className: string) {
  if (iso === undefined) return [];
  const date = calendarDate(iso, lang);
  if (date === undefined) return [];
  return [
    h("dt", { class: LABEL_CLASS }, label),
    h(
      "dd",
      { class: `${VALUE_CLASS} ${className}` },
      h("time", { datetime: date.datetime, title: date.text, "aria-label": date.text }, date.text),
    ),
  ];
}

/**
 * A trust chip next to the page title that opens a native `<details>` panel with the page's examples,
 * drift, last reviewer, and why it has its level. The chip and the panel work without JavaScript; the
 * island only adds Escape-to-close and returns focus to the summary.
 *
 * The entry comes from `site.data.trust`, keyed by `page.url`, or from the directive's props for a manual
 * panel. It renders nothing when neither names a state it knows, so missing evidence never becomes a
 * `verified` claim. Every state explains itself in the panel: the entry's reasons, or the state's
 * definition when it records none. Examples and drift come from
 * `site.data.examples` and `site.data.drift`; the action links come from `theme.options.trust` and are
 * left out when the site configures none. Valid build and review provenance comes from the entry, then
 * `site.data.build` and `site.data.reviewers`; it is exposed on the root and as labelled `<time>` rows,
 * and it never changes the level. The doc layout places the panel under the title, so a site
 * does not write a directive; until the engine's `trust.json` output lands, `site.data.trust` is absent
 * and the panel stays hidden unless a site writes `_data/trust.yml`.
 */
const trustPanel: Component<TrustPanelProps> = ({ props, page, site }) => {
  const entry = props.level === undefined ? entryFor(site, page.url) : entryOf(props);
  if (entry === undefined) return null;

  const lang = page.lang;
  const reasons = explanationOf(lang, entry.level, entry.reasons);
  const provenance = provenanceOf(site, page.url, entry);
  const options = trustOptions(site.config);
  const contextPack = actionHrefOf(site.config, page, options?.contextPackUrl, provenance);
  const suggestEdit = actionHrefOf(site.config, page, options?.suggestEditUrl, provenance);

  const links = [
    ...(contextPack === undefined
      ? []
      : [h("a", { class: ACTION_CLASS, href: contextPack }, t(lang, "trust_context_pack"))]),
    ...(suggestEdit === undefined
      ? []
      : [h("a", { class: ACTION_CLASS, href: suggestEdit }, t(lang, "trust_suggest_edit"))]),
  ];

  return h(
    "details",
    {
      class: `${CLASS} ${CLASS}-${entry.level}`,
      "data-trust-panel": "",
      "data-trust-level": entry.level,
      ...(provenance.buildId === undefined ? {} : { "data-trust-build": provenance.buildId }),
      ...(provenance.generatedAt === undefined ? {} : { "data-trust-generated": provenance.generatedAt }),
      ...(provenance.reviewedAt === undefined ? {} : { "data-trust-reviewed": provenance.reviewedAt }),
    },
    h(
      "summary",
      { class: CHIP_CLASS },
      icon(entry.level),
      h("span", { class: LEVEL_CLASS }, t(lang, "trust_chip", { level: t(lang, LEVEL_KEYS[entry.level]) })),
    ),
    h(
      "div",
      { class: BODY_CLASS },
      h(
        "dl",
        { class: ROWS_CLASS },
        ...row(t(lang, "trust_examples"), examplesText(lang, examplesFor(site, page.url)), "trust-panel-examples"),
        ...row(t(lang, "trust_drift"), driftText(lang, driftFor(site, page.url)), "trust-panel-drift"),
        ...dateRow(t(lang, "updated"), provenance.generatedAt, lang, "trust-panel-generated"),
        ...dateRow(t(lang, "reviewed"), provenance.reviewedAt, lang, "trust-panel-reviewed"),
        ...row(t(lang, "trust_reviewer"), reviewerText(lang, entry.lastReviewer), "trust-panel-reviewer"),
      ),
      h("p", { class: REASONS_LABEL_CLASS }, t(lang, "trust_reasons")),
      h("ul", { class: REASONS_CLASS }, reasons.map((reason) => h("li", null, reason))),
      links.length === 0 ? null : h("div", { class: ACTIONS_CLASS }, ...links),
    ),
  );
};

export default trustPanel;
