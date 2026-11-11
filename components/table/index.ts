import { h } from "preact";
import type { ComponentChildren } from "preact";

/** Scroll region around a Markdown table. */
export const WRAPPER_CLASS = "table-scroll";

/** Styled table element class. */
export const TABLE_CLASS = "table";

/** Marks the scroll region for `client.ts`, which drops the tab stop when the table fits. */
export const REGION_ATTRIBUTE = "data-table-scroll";

export type TableProps = {
  children?: ComponentChildren;
  /** Accessible name for the scroll region when the table has no caption. */
  label?: string;
};

/**
 * Render a table inside a keyboard-focusable horizontal scroll region. Without JavaScript the region
 * always keeps its tab stop, so a wide table stays keyboard-scrollable; `client.ts` removes the tab
 * stop and the named region when the table fits. A caption names the region on the rendered page.
 */
export default function table({ children, label }: TableProps) {
  const name = typeof label === "string" ? label.trim() : "";
  return h(
    "div",
    {
      class: WRAPPER_CLASS,
      [REGION_ATTRIBUTE]: true,
      tabIndex: 0,
      ...(name === "" ? {} : { role: "region", "aria-label": name, "data-label": name }),
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
 * Rehype plugin: wrap every bare `<table>` in a scroll region. The wrapper is focusable so a wide
 * table scrolls from the keyboard without JavaScript; `client.ts` drops the tab stop and the region
 * role when the table fits. A caption names the region, and a table without one adds no unnamed
 * landmark.
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
      const caption = captionFor(child);
      children[i] = {
        type: "element",
        tagName: "div",
        properties: {
          className: [WRAPPER_CLASS],
          dataTableScroll: true,
          tabIndex: 0,
          ...(caption === undefined ? {} : { role: "region", ariaLabel: caption }),
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

/** The table's caption as plain text, or `undefined` when it has none or an empty one. */
function captionFor(tableNode: HastNode): string | undefined {
  const caption = tableNode.children?.find((child) => isElement(child, "caption"));
  if (!caption) return undefined;
  const text = textContent(caption).trim();
  return text.length > 0 ? text : undefined;
}

function textContent(node: HastNode): string {
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(textContent).join("");
}
