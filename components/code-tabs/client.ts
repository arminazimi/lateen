/* Code tabs island: turns a group's titles into a WAI-ARIA tab list. Without this script the blocks stay stacked. */

// The sync part (`sync.ts`) rides along through this import: the engine loads exactly this one file
// as the component's island (ADR 0022, rule 3), so the import is the only way the sync module
// reaches the browser. It waits a microtask before it starts, so every group is already enhanced.
import "./sync.ts";

/** Attribute on each group root (`data-code-tabs`); the island finds groups by it. */
export const GROUP_SELECTOR = "[data-code-tabs]";
export const TABLIST_SELECTOR = ".code-tabs-list";
export const TAB_SELECTOR = "[role=tab]";
export const PANEL_SELECTOR = ".code-tabs-panel";

/** An element the island touches: a tab, a panel, or the tab list. */
export interface TabsElement {
  readonly id: string;
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  focus(): void;
  addEventListener(type: string, listener: (event: TabsEvent) => void): void;
}

/** A DOM event as the island reads it. */
export interface TabsEvent {
  readonly key?: string;
  readonly target: unknown;
  preventDefault(): void;
}

/** One group root as the island touches it. */
export interface TabsGroup {
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): TabsElement | null;
  querySelectorAll(selector: string): Iterable<TabsElement>;
}

// The theme's tsconfig has no DOM lib; these are the browser globals the island needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare function getComputedStyle(element: unknown): { direction: string };

/**
 * The tab a key moves to, from tab `index` of `count`, or `undefined` for any other key. Arrow keys wrap;
 * in a right-to-left group ArrowRight moves back and ArrowLeft forward, since the tabs run the other way.
 */
export function step(key: string, index: number, count: number, rtl: boolean): number | undefined {
  if (count <= 0) return undefined;
  const forward = rtl ? -1 : 1;
  const wrap = (n: number): number => ((n % count) + count) % count;
  switch (key) {
    case "ArrowRight":
      return wrap(index + forward);
    case "ArrowLeft":
      return wrap(index - forward);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** Shows the panel at `index`, hides the others, and makes that tab the one in the tab order. */
export function select(tabs: readonly TabsElement[], panels: readonly TabsElement[], index: number): void {
  tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute("aria-selected", on ? "true" : "false");
    tab.setAttribute("tabindex", on ? "0" : "-1");
  });
  panels.forEach((panel, i) => {
    panel.hidden = i !== index;
  });
}

/**
 * Wires one group. A group whose tabs and panels do not pair up stays stacked: the island changes nothing.
 * `rtl` is the group's direction, which decides which arrow key moves forward.
 */
export function activate(group: TabsGroup, rtl: boolean): void {
  const list = group.querySelector(TABLIST_SELECTOR);
  const tabs = [...group.querySelectorAll(TAB_SELECTOR)];
  const panels = [...group.querySelectorAll(PANEL_SELECTOR)];
  if (!list || tabs.length === 0 || tabs.length !== panels.length) return;

  tabs.forEach((tab, i) => {
    const panel = panels[i];
    if (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
    }
    tab.addEventListener("click", () => select(tabs, panels, i));
  });

  list.addEventListener("keydown", (event) => {
    const from = tabs.indexOf(event.target as TabsElement);
    if (from === -1) return;
    const to = step(event.key ?? "", from, tabs.length, rtl);
    if (to === undefined) return;
    event.preventDefault();
    select(tabs, panels, to);
    tabs[to]?.focus();
  });

  group.setAttribute("data-enhanced", "");
  list.hidden = false;
  select(tabs, panels, 0);
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(GROUP_SELECTOR)) {
    const group = element as TabsGroup;
    activate(group, getComputedStyle(element).direction === "rtl");
  }
}
