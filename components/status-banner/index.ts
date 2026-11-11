import { h } from "preact";
import type { Component, Page } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::status-banner{status=deprecated}`. */
export const directive = "status-banner";

/** The three states a page-level banner can report. */
export const STATUSES = ["deprecated", "experimental", "old-version"] as const;

export type StatusBannerStatus = (typeof STATUSES)[number];

/** The i18n key with each status's visible label. */
export const LABEL_KEYS: Readonly<Record<StatusBannerStatus, string>> = {
  deprecated: "status_deprecated",
  experimental: "status_experimental",
  "old-version": "status_old_version",
};

/** How serious each status is, so the banner's hierarchy is explicit rather than colour alone. */
export const SEVERITIES: Readonly<Record<StatusBannerStatus, "critical" | "warning" | "info">> = {
  deprecated: "critical",
  experimental: "info",
  "old-version": "warning",
};

/** The i18n key with each status's guidance: what it means and what the reader should do next. */
export const HINT_KEYS: Readonly<Record<StatusBannerStatus, string>> = {
  deprecated: "status_deprecated_hint",
  experimental: "status_experimental_hint",
  "old-version": "status_old_version_hint",
};

/** Props from the directive: `::status-banner{status=deprecated replacement="/new/" version="0.2.0"}`. */
export type StatusBannerProps = {
  /** `deprecated`, `experimental`, or `old-version`; any other value, or none, renders nothing. */
  status?: string;
  /** The page that replaces this one: a path on this site or an https link. */
  replacement?: string;
  /** The version the status applies to, such as `0.2.0`. */
  version?: string;
  /** An optional id base for the banner; reduced to letters, digits, `-` and `_`. */
  id?: string;
};

/**
 * Stroke paths for each status's icon, drawn on a 16×16 grid. Each status has its own shape, so the
 * banner never relies on colour alone. The shapes are direction-neutral and need no RTL flip.
 */
export const ICONS: Readonly<Record<StatusBannerStatus, readonly string[]>> = {
  deprecated: ["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "m4.6 4.6 6.8 6.8"],
  experimental: [
    "M6 1.5h4",
    "M6.75 1.5v4.25L3.4 12a1.5 1.5 0 0 0 1.3 2.25h6.6a1.5 1.5 0 0 0 1.3-2.25L9.25 5.75V1.5",
  ],
  "old-version": ["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "M8 4.25V8l2.5 1.5"],
};

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/**
 * The status to show: one of {@link STATUSES}, matched without case or surrounding spaces. Spaces and
 * underscores are read as hyphens, so `Old Version` and `old_version` mean `old-version`.
 */
export function statusOf(value: unknown): StatusBannerStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (STATUSES as readonly string[]).includes(status) ? (status as StatusBannerStatus) : undefined;
}

/** Class names of the banner: `status-banner` plus `status-banner-<status>`. */
export function classNameOf(status: StatusBannerStatus): string {
  return `status-banner status-banner-${status}`;
}

/** The version text, trimmed, or undefined when it is missing, blank, or not a string. */
export function versionOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const version = value.trim();
  return version === "" ? undefined : version;
}

/** The replacement link, when it is a safe URL (see {@link SAFE_URL}); otherwise undefined. */
export function replacementOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return SAFE_URL.test(url) ? url : undefined;
}

/** A value reduced to letters, digits, `-` and `_`, so an author's id cannot break the markup. */
function slugOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The banner's id base: the author's `id` when it has any usable characters, otherwise
 * `status-banner-<status>`, so a single ordinary banner keeps its long-standing fragment id.
 */
export function idBase(raw: unknown, status: StatusBannerStatus): string {
  const given = slugOf(typeof raw === "string" ? raw : "");
  return given === "" ? `status-banner-${status}` : given;
}

/**
 * Per-page ids already taken, keyed by the Page and the page HTML they were counted against, so one
 * page's ids cannot leak into another page or build.
 */
const pageIds = new WeakMap<Page, { html: string; ids: Set<string> }>();

/**
 * An id unique on its page: the base, then `<base>-2`, `<base>-3`, in page order. The banner's label
 * id (`<id>-label`) is reserved too, so an author id cannot collide with another banner's label.
 */
function uniqueId(page: Page, base: string): string {
  let state = pageIds.get(page);
  if (state === undefined || state.html !== page.html) {
    state = { html: page.html, ids: new Set() };
    pageIds.set(page, state);
  }
  let id = base;
  for (let n = 2; state.ids.has(id) || state.ids.has(`${id}-label`); n += 1) {
    id = `${base}-${n}`;
  }
  state.ids.add(id);
  state.ids.add(`${id}-label`);
  return id;
}

/** The status's inline icon. It is decorative: the label beside it carries the meaning for a screen reader. */
function icon(status: StatusBannerStatus) {
  return h(
    "svg",
    {
      class: "status-banner-icon",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ICONS[status].map((d) => h("path", { d })),
  );
}

/**
 * A page-level banner for a deprecated, experimental, or old-version page: an icon, the status as
 * visible text, one line of guidance, the version when given, and a link to the replacement when
 * given. The severity is on the element, and the icon and label carry the meaning on their own, so
 * colour is never the only signal. Each banner gets an id unique on its page, so a repeated status
 * stays distinct. Renders nothing for an unknown status.
 */
const statusBanner: Component<StatusBannerProps> = ({ props, page }) => {
  const status = statusOf(props.status);
  if (status === undefined) return null;

  const version = versionOf(props.version);
  const replacement = replacementOf(props.replacement);
  const id = uniqueId(page, idBase(props.id, status));
  const labelId = `${id}-label`;

  return h(
    "div",
    {
      class: classNameOf(status),
      id,
      role: "note",
      "aria-labelledby": labelId,
      "data-status": status,
      "data-severity": SEVERITIES[status],
    },
    icon(status),
    h(
      "strong",
      { class: "status-banner-label", id: labelId },
      t(page.lang, LABEL_KEYS[status]),
    ),
    h("span", { class: "status-banner-hint" }, t(page.lang, HINT_KEYS[status])),
    version === undefined
      ? null
      : h(
          "span",
          { class: "status-banner-version" },
          h("span", { class: "status-banner-version-label" }, t(page.lang, "status_since")),
          h("span", { class: "status-banner-version-value", dir: "ltr" }, version),
        ),
    replacement === undefined
      ? null
      : h(
          "a",
          { class: "status-banner-replacement", href: replacement },
          h("span", { class: "status-banner-replacement-label" }, t(page.lang, "status_replaced_by")),
          h("span", { class: "status-banner-replacement-target", dir: "ltr" }, replacement),
        ),
  );
};

export default statusBanner;
