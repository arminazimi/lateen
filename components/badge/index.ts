import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";

/** Variants share the callout names and colors (`style.css` maps each to a token). */
export const VARIANTS = ["note", "tip", "important", "warning", "caution"] as const;

export type BadgeVariant = (typeof VARIANTS)[number];

/** Used when the variant is missing or unknown. */
export const DEFAULT_VARIANT: BadgeVariant = "note";

/** Props from the directive: `:badge[New]{variant=tip}` or `::badge{label=new}`. */
export type BadgeProps = {
  variant?: string;
  /** Text shown when the directive has no body. */
  label?: string;
};

/** Class names of a badge: `badge` plus `badge-<variant>`. */
export function classNameOf(variant: BadgeVariant): string {
  return `badge badge-${variant}`;
}

/** The variant to render: the given one when it is known, otherwise {@link DEFAULT_VARIANT}. */
export function variantOf(value: unknown): BadgeVariant {
  return typeof value === "string" && (VARIANTS as readonly string[]).includes(value)
    ? (value as BadgeVariant)
    : DEFAULT_VARIANT;
}

/** Small inline label for a version or status. */
const badge: Component<BadgeProps> = ({ props, html }) => {
  const className = classNameOf(variantOf(props.variant));
  if (html === "") return h("span", { class: className }, props.label ?? "");
  return h("span", { class: className, dangerouslySetInnerHTML: { __html: html } });
};

export default badge;
