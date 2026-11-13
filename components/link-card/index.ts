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
  /** The card's source position, as the engine writes it: `path:line:column-endLine:endColumn`. */
  src?: string;
};

/** Which way a card points: a path on this site, or an `http`/`https` address somewhere else. */
export type LinkCardRelation = "internal" | "external";

/**
 * One card's record for automation: the title and description it shows, the destination it finally
 * uses, which way it points, and where it came from. `version` is bumped when a field changes meaning.
 */
export interface LinkCardRecord {
  /** Names the component, so a consumer knows how to read the rest. */
  readonly component: "link-card";
  /** Shape version; bumped when a field changes meaning. */
  readonly version: 1;
  /** The card's heading, as the link's accessible name shows it. */
  readonly title: string;
  /** The plain text under the heading, when the card has one. */
  readonly description?: string;
  /** The final destination the link uses, with the site base already resolved. */
  readonly href: string;
  /** `internal` for a path on this site, `external` for an `http`/`https` address. */
  readonly relation: LinkCardRelation;
  /** The validated source position, when the card was given one. */
  readonly src?: string;
}

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

/** The site's `base` without a trailing slash, so paths join with one `/`. The root is the empty string. */
function baseOf(base: string | undefined): string {
  if (base === undefined || base === "" || base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * A safe card destination with the site base in front of a root-relative path, so the same card works
 * at a domain root and under a subpath. An external address is returned unchanged, and a path that
 * already carries the base is not prefixed twice.
 */
export function withBase(base: string, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const prefix = baseOf(base);
  if (prefix === "" || href === prefix || href.startsWith(`${prefix}/`)) return href;
  return `${prefix}${href}`;
}

/** Which way a safe href points; a scheme makes it external, everything else is a path on this site. */
export function relationOf(href: string): LinkCardRelation {
  return /^https?:\/\//i.test(href) ? "external" : "internal";
}

/** A full source span: `path:line:column-endLine:endColumn`. */
const FULL_SPAN = /^(.*):(\d+):(\d+)-(\d+):(\d+)$/;

/** A point with a column: `path:line:column`. */
const POINT_WITH_COLUMN = /^(.*):(\d+):(\d+)$/;

/** A point without a column: `path:line`. */
const POINT = /^(.*):(\d+)$/;

/** True when every part is a real 1-based line or column. */
function positive(...values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value) && value >= 1);
}

/**
 * The validated source position, trimmed, or undefined when it is missing or malformed. A span is
 * `path:line:column-endLine:endColumn`; `path:line:column` and `path:line` are points, whose end is
 * their start. A path may contain a colon, since the numbers are read from the right. An impossible
 * position — a zero part, or an end before its start — is refused rather than published as evidence.
 */
export function sourcePositionOf(value: unknown): string | undefined {
  const text = textOf(value);
  if (text === undefined) return undefined;

  const full = FULL_SPAN.exec(text);
  if (full !== null) {
    const [, file, line, column, endLine, endColumn] = full;
    const startLine = Number(line);
    const startColumn = Number(column);
    const lastLine = Number(endLine);
    const lastColumn = Number(endColumn);
    if (file === undefined || file === "") return undefined;
    if (!positive(startLine, startColumn, lastLine, lastColumn)) return undefined;
    if (lastLine < startLine || (lastLine === startLine && lastColumn < startColumn)) return undefined;
    return text;
  }

  const withColumn = POINT_WITH_COLUMN.exec(text);
  if (withColumn !== null) {
    const [, file, line, column] = withColumn;
    return file !== undefined && file !== "" && positive(Number(line), Number(column)) ? text : undefined;
  }

  const point = POINT.exec(text);
  if (point !== null) {
    const [, file, line] = point;
    return file !== undefined && file !== "" && positive(Number(line)) ? text : undefined;
  }

  return undefined;
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
function recordJson(record: LinkCardRecord): string {
  return JSON.stringify(record).replace(/</g, "\\u003c");
}

/**
 * `::link-card{href=… title=…}` renders one card that is a single link, with an optional decorative
 * icon and an optional plain-text description. Without a safe href or a title it renders nothing, so
 * a malformed card can never become an unlabeled or `javascript:` link. A root-relative destination
 * gets the site base, so the card works at a domain root and under a subpath. An inert JSON record
 * publishes the same title, description, final href, internal/external relation, and source position
 * for agents. Place several inside `<div class="link-card-grid">` for a responsive grid.
 */
const linkCard: Component<LinkCardProps> = ({ props, site }) => {
  const href = hrefOf(props.href);
  const title = textOf(props.title);
  if (href === undefined || title === undefined) return null;

  const description = textOf(props.description);
  const icon = textOf(props.icon);
  const src = sourcePositionOf(props.src);
  const finalHref = withBase(site?.config?.base ?? "", href);

  const record: LinkCardRecord = {
    component: "link-card",
    version: 1,
    title,
    ...(description === undefined ? {} : { description }),
    href: finalHref,
    relation: relationOf(href),
    ...(src === undefined ? {} : { src }),
  };

  return [
    h(
      "a",
      { class: LINK_CARD_CLASS, href: finalHref },
      icon === undefined
        ? null
        : h("span", { class: ICON_CLASS, "aria-hidden": "true", dangerouslySetInnerHTML: { __html: icon } }),
      h("span", { class: TITLE_CLASS }, title),
      description === undefined ? null : h("span", { class: DESCRIPTION_CLASS }, description),
    ),
    h("script", {
      type: "application/json",
      "data-link-card": "",
      dangerouslySetInnerHTML: { __html: recordJson(record) },
    }),
  ];
};

export default linkCard;
