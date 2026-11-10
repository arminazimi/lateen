import { h } from "preact";
import type { ComponentChildren } from "preact";

/** Scroll region around a Markdown table. */
export const WRAPPER_CLASS = "table-scroll";

/** Styled table element class. */
export const TABLE_CLASS = "table";

const DEFAULT_LABEL = "Table";

export type TableProps = {
  children?: ComponentChildren;
  /** Accessible name for the scroll region. */
  label?: string;
};

/** Render a table inside a keyboard-focusable horizontal scroll region. */
export default function table({ children, label = DEFAULT_LABEL }: TableProps) {
  return h(
    "div",
    {
      class: WRAPPER_CLASS,
      tabIndex: 0,
      role: "region",
      "aria-label": label,
    },
    h("table", { class: TABLE_CLASS }, children),
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
 * Rehype plugin: wrap every bare `<table>` in a scroll region with
 * `tabindex="0"` and an accessible label (design brief: wide tables scroll
 * inside the article with a visible edge).
 */
export function rehype() {
  return function tableRehype(tree: HastNode): void {
    wrapTables(tree);
  };
}

function wrapTables(node: HastNode): void {
  const children = node.children;
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;

    if (isElement(child, "table")) {
      if (isElement(node, "div") && hasClass(node, WRAPPER_CLASS)) {
        ensureTableClass(child);
        continue;
      }
      ensureTableClass(child);
      children[i] = {
        type: "element",
        tagName: "div",
        properties: {
          className: [WRAPPER_CLASS],
          tabIndex: 0,
          role: "region",
          ariaLabel: labelFor(child),
        },
        children: [child],
      };
      continue;
    }

    wrapTables(child);
  }
}

function isElement(node: HastNode, tagName: string): boolean {
  return node.type === "element" && node.tagName === tagName;
}

function ensureTableClass(tableNode: HastNode): void {
  const properties = (tableNode.properties ??= {});
  if (!hasClass({ properties } as HastNode, TABLE_CLASS)) {
    const existing = properties.className ?? properties.class;
    if (Array.isArray(existing)) properties.className = [...existing, TABLE_CLASS];
    else if (typeof existing === "string" && existing.length > 0) {
      properties.className = `${existing} ${TABLE_CLASS}`;
    } else properties.className = [TABLE_CLASS];
  }
}

function hasClass(node: HastNode, name: string): boolean {
  const properties = node.properties;
  if (!properties) return false;
  const value = properties.className ?? properties.class;
  if (Array.isArray(value)) return value.map(String).includes(name);
  if (typeof value === "string") return value.split(/\s+/).includes(name);
  return false;
}

function labelFor(tableNode: HastNode): string {
  const caption = tableNode.children?.find((child) => isElement(child, "caption"));
  if (!caption) return DEFAULT_LABEL;
  const text = textContent(caption).trim();
  return text.length > 0 ? text : DEFAULT_LABEL;
}

function textContent(node: HastNode): string {
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(textContent).join("");
}
