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

/**
 * A banner above the title for an experimental, beta, or deprecated page. It names the status and, when
 * the status was set in a version, that version. A deprecated page with a `replaced_by` also links to its
 * replacement. Renders nothing for any other status. Every label is read in the page language.
 */
const pageStatus: Component<PageStatusProps> = ({ props, page }) => {
  const status = statusOf(props.status);
  if (status === undefined) return null;

  const lang = page.lang;
  const since = sinceOf(props.since);
  const replacement = status === "deprecated" ? replacementOf(props.replaced_by) : undefined;

  return h(
    "div",
    { class: classNameOf(status), role: "note" },
    h("strong", { class: "page-status-label" }, t(lang, LABEL_KEYS[status])),
    h("span", { class: "page-status-message" }, t(lang, MESSAGE_KEYS[status])),
    since === undefined ? null : h("span", { class: "page-status-since" }, `${t(lang, "status_since")} ${since}`),
    replacement === undefined
      ? null
      : h("a", { class: "page-status-replacement", href: replacement }, t(lang, "status_replacement_label")),
  );
};

export default pageStatus;
