import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Class on the outer element; `style.css` styles it, and `client.ts` finds it by `data-code-tabs`. */
export const CODE_TABS_CLASS = "code-tabs";

/** Class on the tab list (`role="tablist"`). It starts `hidden` and the island reveals it. */
export const TABLIST_CLASS = "code-tabs-list";

/** Class on each tab button (`role="tab"`). */
export const TAB_CLASS = "code-tabs-tab";

/** Class on each panel: one code block with its title. */
export const PANEL_CLASS = "code-tabs-panel";

/** Class on each panel's title. Visible without JavaScript; the island hides it, since the tab shows it. */
export const TITLE_CLASS = "code-tabs-title";

/** Class on the element that holds one code block. */
export const BODY_CLASS = "code-tabs-body";

/** Id prefix used when the directive gives none. */
export const DEFAULT_ID = "code-tabs";

export type CodeTabsProps = {
  /** Prefix for this group's element ids. Give each group on a page its own id. */
  id?: string;
  /** JSON array of tab labels, one per code block in order: `["npm","pnpm"]`. A missing label reads as its position. */
  labels?: string;
};

/** Each `<pre>` block in the rendered body, as its own HTML string, in order. */
export function blocks(html: string): string[] {
  return [...html.matchAll(/<pre\b[\s\S]*?<\/pre>/gi)].map((match) => match[0]);
}

/** The labels from the JSON prop. Anything that is not a JSON array gives none; non-string items read as empty. */
export function parseLabels(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map((item) => (typeof item === "string" ? item : ""));
  } catch {
    return [];
  }
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: string | undefined): string {
  const clean = (raw ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean || DEFAULT_ID;
}

/**
 * A group of code blocks as tabs. Without JavaScript every block shows stacked under its title. The island
 * (`client.ts`) turns the titles into a WAI-ARIA tab list and shows one block at a time.
 */
export default function codeTabs({ props, html }: ComponentProps<CodeTabsProps>) {
  const base = idBase(props.id);
  const bodies = blocks(html);
  const labels = parseLabels(props.labels);
  const names = bodies.map((_, i) => labels[i]?.trim() || String(i + 1));

  const tabs = names.map((label, i) =>
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
      },
      label,
    ),
  );

  const panels = names.map((label, i) =>
    h(
      "div",
      { class: PANEL_CLASS, id: `${base}-panel-${i + 1}` },
      h("h3", { class: TITLE_CLASS, id: `${base}-title-${i + 1}` }, label),
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: bodies[i] ?? "" } }),
    ),
  );

  return h(
    "div",
    { class: CODE_TABS_CLASS, "data-code-tabs": "" },
    h("div", { class: TABLIST_CLASS, role: "tablist", hidden: true }, tabs),
    panels,
  );
}
