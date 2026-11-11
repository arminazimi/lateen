import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The statuses that get a banner. */
export const STATUSES = ["experimental", "beta", "deprecated"] as const;

export type BannerStatus = (typeof STATUSES)[number];

/** Props from front matter (`status`, `since`, `replaced_by`) or from the directive with the same names. */
export type PageStatusProps = {
  /** `experimental`, `beta`, or `deprecated`; any other value, or none, renders nothing. */
  status?: string;
  /** The version when the status was set, such as `0.3.0`. */
  since?: string;
  /** The page that replaces this one: a path on this site or an https link. Shown for deprecated pages only. */
  replaced_by?: string;
};

/** The i18n key with the banner's short status name. */
const LABEL_KEYS: Readonly<Record<BannerStatus, string>> = {
  experimental: "status_experimental",
  beta: "status_beta",
  deprecated: "status_deprecated",
};

/** The i18n key with the sentence that explains the status. */
const MESSAGE_KEYS: Readonly<Record<BannerStatus, string>> = {
  experimental: "status_experimental_hint",
  beta: "status_beta_hint",
  deprecated: "status_deprecated_hint",
};

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/** The status to show: one of {@link STATUSES}, matched without case or surrounding spaces; otherwise undefined. */
export function statusOf(value: unknown): BannerStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  return (STATUSES as readonly string[]).includes(status) ? (status as BannerStatus) : undefined;
}

/** Class names of the banner: `page-status` plus `page-status-<status>`. */
export function classNameOf(status: BannerStatus): string {
  return `page-status page-status-${status}`;
}

/** The `since` text, trimmed, or undefined when it is missing, blank, or not a string. */
export function sinceOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const since = value.trim();
  return since === "" ? undefined : since;
}

/** The replacement link, when it is a safe URL (see {@link SAFE_URL}); otherwise undefined. */
export function replacementOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return SAFE_URL.test(url) ? url : undefined;
}

/** The states replacement evidence can be in, as `data-page-status-replacement`. */
export const REPLACEMENT_STATES = ["valid", "invalid", "not-applicable", "absent"] as const;

export type ReplacementState = (typeof REPLACEMENT_STATES)[number];

/** Replacement evidence: a safe link only when the state is `valid`. */
export type ReplacementEvidence = {
  state: ReplacementState;
  href?: string;
};

/** True when the prop was written with a non-blank string. */
function authored(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The replacement evidence for a page. `valid` carries a safe link on a deprecated page. An authored
 * value that is not a safe URL is `invalid`, and any replacement authored on another status is
 * `not-applicable`: neither becomes a link or guidance. No authored value means `absent`, which is
 * different from authored but unusable evidence.
 */
export function replacementEvidenceOf(status: BannerStatus, value: unknown): ReplacementEvidence {
  if (status !== "deprecated") return { state: authored(value) ? "not-applicable" : "absent" };
  const href = replacementOf(value);
  if (href !== undefined) return { state: "valid", href };
  return { state: authored(value) ? "invalid" : "absent" };
}

/**
 * A banner above the title for an experimental, beta, or deprecated page. It names the status and, when
 * the status was set in a version, that version. A deprecated page with a `replaced_by` also links to its
 * replacement. Renders nothing for any other status. Every label is read in the page language.
 *
 * The message element carries the page's lifecycle evidence: `data-page-status` is the normalized status,
 * `data-page-status-since` the trimmed version when one was authored, and `data-page-status-replacement`
 * the replacement state (`valid`, `invalid`, `not-applicable`, or `absent`). Lifecycle says nothing about
 * trust, review, or freshness, so the banner adds no such claim.
 *
 * shortcut: the evidence sits on the message rather than the banner root because the layout's markup test
 * asserts the root's exact opening tag; move it to the root once that shared assertion allows attributes.
 */
const pageStatus: Component<PageStatusProps> = ({ props, page }) => {
  const status = statusOf(props.status);
  if (status === undefined) return null;

  const lang = page.lang;
  const since = sinceOf(props.since);
  const replacement = replacementEvidenceOf(status, props.replaced_by);

  return h(
    "div",
    { class: classNameOf(status), role: "note" },
    h("strong", { class: "page-status-label" }, t(lang, LABEL_KEYS[status])),
    h(
      "span",
      {
        class: "page-status-message",
        "data-page-status": status,
        ...(since === undefined ? {} : { "data-page-status-since": since }),
        "data-page-status-replacement": replacement.state,
      },
      t(lang, MESSAGE_KEYS[status]),
    ),
    since === undefined ? null : h("span", { class: "page-status-since" }, `${t(lang, "status_since")} ${since}`),
    replacement.state !== "valid"
      ? null
      : h("a", { class: "page-status-replacement", href: replacement.href }, t(lang, "status_replacement_label")),
  );
};

export default pageStatus;
