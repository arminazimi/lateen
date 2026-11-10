import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::version-badge{version=0.3}`. */
export const directive = "version-badge";

/** The changes a version badge can report. */
export const VARIANTS = ["added", "changed", "removed"] as const;

export type VersionBadgeVariant = (typeof VARIANTS)[number];

/** Used when the variant is missing or unknown. */
export const DEFAULT_VARIANT: VersionBadgeVariant = "added";

/**
 * The icon before the version. Each variant has its own, so the variants differ by shape as well
 * as by the sentence a screen reader hears, never by color alone.
 */
export const ICONS: Readonly<Record<VersionBadgeVariant, string>> = {
  added: "+",
  changed: "~",
  removed: "−",
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
  /** `added`, `changed`, or `removed`; any other value, or none, is `added`. */
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

/** The variant to render: the given one when it is known, otherwise {@link DEFAULT_VARIANT}. */
export function variantOf(value: unknown): VersionBadgeVariant {
  return typeof value === "string" && (VARIANTS as readonly string[]).includes(value)
    ? (value as VersionBadgeVariant)
    : DEFAULT_VARIANT;
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

/** Class names of a badge: `version-badge`, `version-badge-<variant>`, and `version-badge-block` when block. */
export function classNameOf(variant: VersionBadgeVariant, block = false): string {
  return `version-badge version-badge-${variant}${block ? " version-badge-block" : ""}`;
}

/**
 * A small badge that says when a feature was added, changed, or removed: `v0.3` on screen and
 * "Added in version 0.3" to a screen reader. It is inline by default and block with `block`.
 */
const versionBadge: Component<VersionBadgeProps> = ({ props, page }) => {
  const version = versionOf(props.version);
  if (version === undefined) return null;

  const variant = variantOf(props.variant);
  const block = blockOf(props.block);

  return h(
    "span",
    { class: classNameOf(variant, block), "data-version": version },
    h("span", { class: "version-badge-icon", "aria-hidden": "true" }, ICONS[variant]),
    h("span", { class: "version-badge-value", "aria-hidden": "true", dir: "ltr" }, `v${version}`),
    h("span", { class: "version-badge-sr" }, t(page.lang, LABEL_KEYS[variant], { version })),
  );
};

export default versionBadge;
