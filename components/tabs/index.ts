import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:::tabs`. */
export const directive = "tabs";

/** Class on the outer element; `style.css` styles it, and `client.ts` finds it by `data-tabs-group`. */
export const TABS_CLASS = "tabs";

/** Class on each panel's title. Visible without JavaScript; the island hides it, since the tab shows it. */
export const TITLE_CLASS = "tabs-title";

/** Class on the element that holds one section's content. */
export const BODY_CLASS = "tabs-body";

/** Id prefix used when the directive gives none. */
export const DEFAULT_ID = "tabs";

export type TabsProps = {
  /** Prefix for this group's element ids. The directive's `group` attribute is the same key the engine's tab markup uses. */
  group?: string;
  /** Fallback id prefix when the directive has no `group`. */
  id?: string;
};

/** One section of the directive body: its heading label and the content under it. */
export interface TabSection {
  readonly label: string;
  readonly html: string;
}

/** A heading that starts a section: `## macOS`, `### Windows`, and any attributes the Markdown stage adds. */
const HEADING = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/** Tags in a heading, so its label becomes plain text rather than markup. */
const TAG = /<[^>]*>/g;

/** A named or numeric character reference in a heading. */
const ENTITY = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi;

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: "\u00a0", quot: '"' };

function decodeEntity(match: string, hex: string | undefined, decimal: string | undefined, named: string | undefined): string {
  if (named !== undefined) return ENTITIES[named.toLowerCase()] ?? match;
  const code = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? "", 10);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** A heading's inner HTML as plain text: tags removed and character references decoded. */
export function labelOf(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(TAG, "");
  } while (text !== previous);

  return text
    .replace(ENTITY, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits the directive body into one section per `##` or `###` heading. A section runs from its heading
 * to the next one; text before the first heading joins the first section so it still reads. A body with
 * no headings gives no sections, and the component keeps it as it is.
 */
export function sections(html: string): TabSection[] {
  const headings = [...html.matchAll(HEADING)];
  const first = headings[0];
  if (first === undefined) return [];

  const leading = html.slice(0, first.index ?? 0).trim();
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = next?.index ?? html.length;
    const content = html.slice(start, end).trim();
    const withLeading = index === 0 && leading !== "" ? `${leading}\n${content}`.trim() : content;
    const label = labelOf(heading[2] ?? "");
    return { label, html: withLeading };
  });
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: string | undefined): string {
  const clean = (raw ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean || DEFAULT_ID;
}

/** The directive's group key, from `group` first and `id` second. */
export function groupKey(props: TabsProps): string {
  const group = typeof props.group === "string" ? props.group.trim() : "";
  return idBase(group || (typeof props.id === "string" ? props.id : undefined));
}

/**
 * Content tabs: each `##` or `###` heading in the body names a tab and starts its section. Without
 * JavaScript the tab list is hidden and every section shows stacked under its title; the island
 * (`client.ts`) reveals the list, shows one section at a time, and shares a choice by label with every
 * other group on the page and with later pages.
 *
 * The markup contract is the same one the engine's `:::tabs`/`::tab` markup uses: a `role="tablist"`
 * of `role="tab"` buttons and one `role="tabpanel"` per tab, so one stylesheet and one island serve both.
 */
export default function tabs({ props, html }: ComponentProps<TabsProps>) {
  const base = groupKey(props);
  const list = sections(html);

  if (list.length === 0) {
    return h(
      "div",
      { class: TABS_CLASS, "data-tabs-group": base },
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: html } }),
    );
  }

  const buttons = list.map((section, i) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `${base}-tab-${i + 1}`,
        "aria-controls": `${base}-panel-${i + 1}`,
        "aria-selected": i === 0 ? "true" : "false",
        tabindex: i === 0 ? 0 : -1,
      },
      section.label,
    ),
  );

  const panels = list.map((section, i) =>
    h(
      "div",
      { role: "tabpanel", id: `${base}-panel-${i + 1}`, "aria-labelledby": `${base}-tab-${i + 1}` },
      h("h3", { class: TITLE_CLASS, id: `${base}-title-${i + 1}` }, section.label),
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: section.html } }),
    ),
  );

  return h(
    "div",
    { class: TABS_CLASS, "data-tabs-group": base },
    h("div", { role: "tablist", hidden: true }, buttons),
    panels,
  );
}
