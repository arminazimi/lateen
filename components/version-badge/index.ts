import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::version-badge{version=0.3}`. */
export const directive = "version-badge";

/** The changes a version badge can report. */
export const VARIANTS = ["added", "changed", "removed"] as const;

export type VersionBadgeVariant = (typeof VARIANTS)[number];

/**
 * Used when the variant is omitted or blank: the documented backward-compatible default. An
 * explicit but unrecognized variant is {@link UNKNOWN_VARIANT} instead.
 */
export const DEFAULT_VARIANT: VersionBadgeVariant = "added";

/** An explicit variant that is not one of {@link VARIANTS}: render it neutrally, not as `added`. */
export const UNKNOWN_VARIANT = "unknown";

export type VersionBadgeState = VersionBadgeVariant | typeof UNKNOWN_VARIANT;

/**
 * The icon before the version. Each state has its own, so they differ by shape as well as by the
 * sentence a screen reader hears, never by color alone.
 */
export const ICONS: Readonly<Record<VersionBadgeState, string>> = {
  added: "+",
  changed: "~",
  removed: "−",
  unknown: "?",
};

/** The i18n key with the sentence a screen reader hears; `{version}` is replaced. */
export const LABEL_KEYS: Readonly<Record<VersionBadgeVariant, string>> = {
  added: "version_added",
  changed: "version_changed",
  removed: "version_removed",
};

/** Props from the directive: `::version-badge{version=0.3 variant=added block}`. */
export type VersionBadgeProps = {
  /** The version the change landed in, such as `0.3`. Missing, blank, or not a string renders nothing. */
  version?: string;
  /** `added`, `changed`, or `removed`, trimmed and case-insensitive; any other non-blank value is `unknown`; none or blank is `added`. */
  variant?: string;
  /** Present (any value, as in `::version-badge{version=0.3 block}`) for block layout instead of inline. */
  block?: string;
};

/** The version text, trimmed, or undefined when it is missing, blank, or not a string. */
export function versionOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const version = value.trim();
  return version === "" ? undefined : version;
}

/**
 * The state to render: a known variant after trimming and lowercasing, {@link UNKNOWN_VARIANT} for
 * any other non-blank value, and {@link DEFAULT_VARIANT} when the variant is omitted or blank.
 */
export function variantOf(value: unknown): VersionBadgeState {
  if (value === undefined || value === null || value === false) return DEFAULT_VARIANT;
  if (typeof value !== "string") return UNKNOWN_VARIANT;
  const variant = value.trim().toLowerCase();
  if (variant === "") return DEFAULT_VARIANT;
  return (VARIANTS as readonly string[]).includes(variant) ? (variant as VersionBadgeVariant) : UNKNOWN_VARIANT;
}

/**
 * The directive attributes are strings, and a bare word such as `block` arrives as `""`. Only the
 * explicit false words turn it off, so `block`, `block=true`, and `block=""` all mean block layout.
 */
export function blockOf(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") {
    return !["false", "no", "0", "off"].includes(value.trim().toLowerCase());
  }
  return true;
}

/** Class names of a badge: `version-badge`, `version-badge-<state>`, and `version-badge-block` when block. */
export function classNameOf(state: VersionBadgeState, block = false): string {
  return `version-badge version-badge-${state}${block ? " version-badge-block" : ""}`;
}

/**
 * A small badge that says when a feature was added, changed, or removed: `v0.3` on screen and
 * "Added in version 0.3" to a screen reader. It is inline by default and block with `block`. An
 * unrecognized variant stays neutral: it shows the version without claiming a change.
 */
const versionBadge: Component<VersionBadgeProps> = ({ props, page }) => {
  const version = versionOf(props.version);
  if (version === undefined) return null;

  const state = variantOf(props.variant);
  const block = blockOf(props.block);
  const labelKey = state === UNKNOWN_VARIANT ? undefined : LABEL_KEYS[state];

  return h(
    "span",
    { class: classNameOf(state, block), "data-version": version, "data-variant": state },
    h("span", { class: "version-badge-icon", "aria-hidden": "true" }, ICONS[state]),
    // With no sentence to announce, the authored version itself stays in the accessibility tree.
    h(
      "span",
      { class: "version-badge-value", ...(labelKey === undefined ? {} : { "aria-hidden": "true" }), dir: "ltr" },
      `v${version}`,
    ),
    labelKey === undefined ? null : h("span", { class: "version-badge-sr" }, t(page.lang, labelKey, { version })),
  );
};

export default versionBadge;
