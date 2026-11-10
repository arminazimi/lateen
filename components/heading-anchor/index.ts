import { h } from "preact";
import type { ComponentChildren } from "preact";

/** Class on the link that points at the heading. */
export const ANCHOR_CLASS = "heading-anchor";

/** Class on the span that holds the heading's own text. */
export const TEXT_CLASS = "heading-text";

/** Heading levels that get an anchor (design brief: h2 to h4). */
export const LEVELS = ["h2", "h3", "h4"] as const;

const DEFAULT_LABEL = "Link to this heading";

/** Path data of the link icon (a chain, 16 by 16). */
const ANCHOR_PATH =
  "m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z";

export type HeadingAnchorProps = {
  /** The heading's anchor id, from the slug stage. */
  id: string;
  /** Heading level, 2 to 4. */
  level: 2 | 3 | 4;
  children?: ComponentChildren;
  /** Accessible name of the link. */
  label?: string;
};

/**
 * A heading followed by a link icon to itself. The heading's accessible name is
 * its text alone: `aria-labelledby` points at the text span, so the icon and its
 * link label stay out of the name.
 */
export default function headingAnchor({ id, level, children, label = DEFAULT_LABEL }: HeadingAnchorProps) {
  return h(
    `h${level}`,
    { id, "aria-labelledby": textIdFor(id) },
    h("span", { id: textIdFor(id), class: TEXT_CLASS }, children),
    anchorElement(id, label),
  );
}

/** Id of the span that holds a heading's text, unique per page because the slug is. */
export function textIdFor(id: string): string {
  return `heading-text-${id}`;
}

/** The link icon: a chain drawn in `currentColor`, hidden from assistive tech. */
function anchorElement(id: string, label: string) {
  return h(
    "a",
    { class: ANCHOR_CLASS, href: `#${id}`, "aria-label": label },
    h(
      "svg",
      { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true", focusable: "false" },
      h("path", { d: ANCHOR_PATH }),
    ),
  );
}

/** Minimal hast node the rehype step walks. */
export type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

/**
 * Rehype plugin: adds the same anchor to every h2 to h4 that has an id (put there
 * by the slug stage). A heading that already has the anchor is left alone.
 */
export function rehype() {
  return function headingAnchorRehype(tree: HastNode): void {
    anchorHeadings(tree);
  };
}

function anchorHeadings(node: HastNode): void {
  const children = node.children;
  if (!children) return;

  for (const child of children) {
    if (child.type === "element" && isLevel(child.tagName)) {
      anchorHeading(child);
      continue;
    }
    anchorHeadings(child);
  }
}

function isLevel(tagName: string | undefined): boolean {
  return (LEVELS as readonly string[]).includes(tagName ?? "");
}

function anchorHeading(heading: HastNode): void {
  const id = heading.properties?.id;
  if (typeof id !== "string" || id.length === 0) return;
  if (heading.children?.some((child) => hasClass(child, ANCHOR_CLASS))) return;

  const textId = textIdFor(id);
  const text: HastNode = {
    type: "element",
    tagName: "span",
    properties: { id: textId, className: [TEXT_CLASS] },
    children: heading.children ?? [],
  };
  heading.properties = { ...heading.properties, ariaLabelledBy: textId };
  heading.children = [text, anchorNode(id)];
}

function anchorNode(id: string): HastNode {
  return {
    type: "element",
    tagName: "a",
    properties: { className: [ANCHOR_CLASS], href: `#${id}`, ariaLabel: DEFAULT_LABEL },
    children: [
      {
        type: "element",
        tagName: "svg",
        properties: { viewBox: "0 0 16 16", width: 16, height: 16, ariaHidden: "true", focusable: "false" },
        children: [
          {
            type: "element",
            tagName: "path",
            properties: { d: ANCHOR_PATH },
            children: [],
          },
        ],
      },
    ],
  };
}

function hasClass(node: HastNode, name: string): boolean {
  if (node.type !== "element") return false;
  const value = node.properties?.className ?? node.properties?.class;
  if (Array.isArray(value)) return value.map(String).includes(name);
  if (typeof value === "string") return value.split(/\s+/).includes(name);
  return false;
}
