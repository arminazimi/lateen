import { h } from "preact";
import type { ComponentChildren } from "preact";

/** Responsive grid that holds the cards. */
export const GRID_CLASS = "cards";

/** One card: the whole card is one link. */
export const CARD_CLASS = "card";

export type CardsProps = {
  children?: ComponentChildren;
};

/** Responsive grid of cards: one column on a narrow screen, more as the article widens. */
export default function cards({ children }: CardsProps) {
  return h("div", { class: GRID_CLASS }, children);
}

export type CardProps = {
  /** Where the whole card goes. */
  href: string;
  title: string;
  /** Plain text only, so a card can never hold a nested link. */
  description?: string;
  /** Decorative (for example an inline SVG); hidden from assistive technology. */
  icon?: ComponentChildren;
};

/** One card: a single link holding an optional icon, the title, and an optional description. */
export function card({ href, title, description, icon }: CardProps) {
  return h(
    "a",
    { class: CARD_CLASS, href },
    icon == null ? null : h("span", { class: "card-icon", "aria-hidden": "true" }, icon),
    h("span", { class: "card-title" }, title),
    description ? h("span", { class: "card-description" }, description) : null,
  );
}
