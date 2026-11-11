import { h } from "preact";
import type { ComponentChildren } from "preact";

/** Responsive grid that holds the cards. */
export const GRID_CLASS = "cards";

/** One card: the whole card is one link, or plain content when the link would be unsafe. */
export const CARD_CLASS = "card";

/**
 * A destination a card may link to: root-relative (`/guide/`, but not protocol-relative `//host`)
 * or `http`/`https`. Matches the theme's link-card policy; anything else (`javascript:`, `data:`,
 * `mailto:`, a relative path, a blank value) is refused.
 */
const SAFE_HREF = /^(?:\/(?![/\\])|https?:\/\/)[^\s"'<>\\]*$/i;

/** The href to use, trimmed, or undefined when it is missing, blank, or unsafe. */
export function hrefOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.trim();
  return SAFE_HREF.test(href) ? href : undefined;
}

/** Text trimmed, or undefined when it is missing, blank, or not a string. */
function textOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
}

export type CardsProps = {
  children?: ComponentChildren;
};

/** Responsive grid of cards: one column on a narrow screen, more as the article widens. */
export default function cards({ children }: CardsProps) {
  return h("div", { class: GRID_CLASS }, children);
}

export type CardProps = {
  /** Where the whole card goes. Only safe destinations become links; see hrefOf. */
  href: string;
  title: string;
  /** Plain text only, so a card can never hold a nested link. */
  description?: string;
  /** Decorative (for example an inline SVG); hidden from assistive technology. */
  icon?: ComponentChildren;
};

/**
 * One card: a single link holding an optional icon, the title, and an optional description.
 * When the destination is missing or unsafe, or the title is blank, the card renders as
 * non-interactive content instead: a malformed card never becomes an executable `javascript:`
 * navigation or an unnamed anchor, and any retained text stays readable without JavaScript.
 */
export function card({ href, title, description, icon }: CardProps) {
  const safeHref = hrefOf(href);
  const heading = textOf(title);
  const body = textOf(description);

  const parts: ComponentChildren[] = [
    icon == null ? null : h("span", { class: "card-icon", "aria-hidden": "true" }, icon),
    heading === undefined ? null : h("span", { class: "card-title" }, heading),
    body === undefined ? null : h("span", { class: "card-description" }, body),
  ];

  if (safeHref === undefined || heading === undefined) {
    return h("div", { class: CARD_CLASS }, ...parts);
  }
  return h("a", { class: CARD_CLASS, href: safeHref }, ...parts);
}
