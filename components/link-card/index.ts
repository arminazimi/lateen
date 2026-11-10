import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `::link-card{href="/guide/" title="Guides"}`. */
export const directive = "link-card";

/** Class on the card. It is the link itself, so the focus ring covers the whole card. */
export const LINK_CARD_CLASS = "link-card";

/** Class on the optional wrapper that lays several cards out in a responsive grid. */
export const LINK_CARD_GRID_CLASS = "link-card-grid";

/** Class on the decorative icon. It is hidden from assistive technology. */
export const ICON_CLASS = "link-card-icon";

/** Class on the title. */
export const TITLE_CLASS = "link-card-title";

/** Class on the description. */
export const DESCRIPTION_CLASS = "link-card-description";

/** Props from the directive: `::link-card{href=… title=… description=… icon=…}`. Every value is a string. */
export type LinkCardProps = {
  /** Where the whole card goes: a path on this site, or an `http`/`https` address. */
  href?: string;
  /** The card's heading. Required: without it the card renders nothing. */
  title?: string;
  /** Plain text under the heading, so a card can never hold a nested link. */
  description?: string;
  /** Decorative HTML, such as an inline SVG; hidden from assistive technology. */
  icon?: string;
};

/**
 * A URL a link card may use: root-relative (`/guide/`, but not protocol-relative `//host`) or
 * `http`/`https`. Anything else (`javascript:`, `data:`, `mailto:`, a relative path) is refused.
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

/**
 * `::link-card{href=… title=…}` renders one card that is a single link, with an optional decorative
 * icon and an optional plain-text description. Without a safe href or a title it renders nothing, so
 * a malformed card can never become an unlabeled or `javascript:` link. Place several inside
 * `<div class="link-card-grid">` for a responsive grid.
 */
const linkCard: Component<LinkCardProps> = ({ props }) => {
  const href = hrefOf(props.href);
  const title = textOf(props.title);
  if (href === undefined || title === undefined) return null;

  const description = textOf(props.description);
  const icon = textOf(props.icon);

  return h(
    "a",
    { class: LINK_CARD_CLASS, href },
    icon === undefined
      ? null
      : h("span", { class: ICON_CLASS, "aria-hidden": "true", dangerouslySetInnerHTML: { __html: icon } }),
    h("span", { class: TITLE_CLASS }, title),
    description === undefined ? null : h("span", { class: DESCRIPTION_CLASS }, description),
  );
};

export default linkCard;
