import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:::os-tabs`. */
export const directive = "os-tabs";

/** Class on the outer element; `style.css` styles it, and `client.ts` finds it by `data-os-tabs`. */
export const OS_TABS_CLASS = "os-tabs";

/** Class on the tab list (`role="tablist"`). It starts `hidden` and the island reveals it. */
export const TABLIST_CLASS = "os-tabs-list";

/** Class on each tab button (`role="tab"`). */
export const TAB_CLASS = "os-tabs-tab";

/** Class on each panel: one OS section with its title and content. */
export const PANEL_CLASS = "os-tabs-panel";

/** Class on each panel's title. Visible without JavaScript; the island hides it, since the tab shows it. */
export const TITLE_CLASS = "os-tabs-title";

/** Class on the element that holds one OS section's content. */
export const BODY_CLASS = "os-tabs-body";

/** Id prefix used when the directive gives none. */
export const DEFAULT_ID = "os-tabs";

/** The operating systems a tab can name. Anything else is `unknown`, which the island never selects by name. */
export type Os = "mac" | "win" | "linux" | "unknown";

export type OsTabsProps = {
  /** Prefix for this group's element ids. Give each group on a page its own id. */
  id?: string;
};

/** One section of the directive body: its heading label, the OS that label names, and its content HTML. */
export interface OsSection {
  readonly label: string;
  readonly os: Os;
  readonly html: string;
}

/** The heading labels an OS, after lowercasing and collapsing punctuation to spaces. */
const OS_NAMES: Readonly<Record<string, Os>> = {
  arch: "linux",
  darwin: "mac",
  debian: "linux",
  fedora: "linux",
  "gnu linux": "linux",
  linux: "linux",
  mac: "mac",
  "mac os": "mac",
  macos: "mac",
  "os x": "mac",
  osx: "mac",
  ubuntu: "linux",
  win: "win",
  win32: "win",
  win64: "win",
  windows: "win",
};

/** A heading that starts a section: `## macOS`, `### Windows`, and any attributes the Markdown stage adds. */
const HEADING = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/** Tags in a heading, so its label becomes plain text rather than markup. */
const TAG = /<[^>]*>/g;

/** A named or numeric character reference in a heading. */
const ENTITY = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi;

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: "\u00a0", quot: '"' };

/** The OS a section label names. A label that names none reads as `unknown`. */
export function osOf(label: string): Os {
  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return OS_NAMES[key] ?? "unknown";
}

function decodeEntity(match: string, hex: string | undefined, decimal: string | undefined, named: string | undefined): string {
  if (named !== undefined) return ENTITIES[named.toLowerCase()] ?? match;
  const code = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? "", 10);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** A heading's inner HTML as plain text: tags removed and character references decoded. */
export function labelOf(html: string): string {
  return html
    .replace(TAG, "")
    .replace(ENTITY, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits the directive body into one section per `##` or `###` heading. A section runs from its heading
 * to the next one; text before the first heading joins the first section so it still reads. A body with
 * no headings gives no sections, and the component keeps it as it is.
 */
export function sections(html: string): OsSection[] {
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
    return { label, os: osOf(label), html: withLeading };
  });
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: string | undefined): string {
  const clean = (raw ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean || DEFAULT_ID;
}

/**
 * Install instructions as one tab per operating system. Each `##` or `###` heading in the body names an
 * OS and starts its section. Without JavaScript the tab list is hidden and every section shows stacked
 * under its title; the island (`client.ts`) selects the reader's OS and shares a manual choice.
 */
export default function osTabs({ props, html }: ComponentProps<OsTabsProps>) {
  const base = idBase(typeof props.id === "string" ? props.id : undefined);
  const list = sections(html);

  if (list.length === 0) {
    return h(
      "div",
      { class: OS_TABS_CLASS, "data-os-tabs": "" },
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: html } }),
    );
  }

  const tabs = list.map((section, i) =>
    h(
      "button",
      {
        type: "button",
        class: TAB_CLASS,
        role: "tab",
        id: `${base}-tab-${i + 1}`,
        "aria-controls": `${base}-panel-${i + 1}`,
        "aria-selected": i === 0 ? "true" : "false",
        tabindex: i === 0 ? 0 : -1,
        "data-os": section.os,
      },
      section.label,
    ),
  );

  const panels = list.map((section, i) =>
    h(
      "div",
      { class: PANEL_CLASS, id: `${base}-panel-${i + 1}`, "data-os": section.os },
      h("h3", { class: TITLE_CLASS, id: `${base}-title-${i + 1}` }, section.label),
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: section.html } }),
    ),
  );

  return h(
    "div",
    { class: OS_TABS_CLASS, "data-os-tabs": "" },
    h("div", { class: TABLIST_CLASS, role: "tablist", hidden: true }, tabs),
    panels,
  );
}
