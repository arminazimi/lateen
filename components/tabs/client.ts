/* Content tabs island: reveals a group's tab list, shows one section at a time, and keeps a chosen
 * label across every group on the page and across pages. Without this script the tab list stays
 * hidden and every section stays stacked under its title. The label sync itself is the code tabs
 * module (`../code-tabs/sync.ts`), reused rather than copied. */

import {
  PANEL_SELECTOR as CODE_PANEL_SELECTOR,
  TAB_SELECTOR,
  select,
  step,
  type TabsElement as IslandElement,
  type TabsEvent,
} from "../code-tabs/client.ts";
import { LANG_PARAM, sync, type SyncEnv, type SyncGroup } from "../code-tabs/sync.ts";

/** Attribute on each group root (`data-tabs-group`); the island finds groups by it. */
export const GROUP_SELECTOR = "[data-tabs-group]";

/** The tab list (`role="tablist"`). */
export const TABLIST_SELECTOR = "[role=tablist]";

/** One panel (`role="tabpanel"`). */
export const PANEL_SELECTOR = "[role=tabpanel]";

/** localStorage key the chosen label is remembered under. Content tabs keep their own, apart from code tabs. */
export const STORAGE_KEY = "slipway-tabs";

/** Query parameter whose value chooses the label and beats what is remembered. */
export const TAB_PARAM = "tab";

/** A tab or panel element the island touches. */
export interface TabsElement extends IslandElement {
  /** Reads one attribute, so the sync part can leave an already-selected tab alone. */
  getAttribute(name: string): string | null;
  /** The tab's label, as rendered (the button's text). */
  readonly textContent: string | null;
}

/** One group root as the island touches it. */
export interface TabsGroup {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(selector: string): TabsElement | null;
  querySelectorAll(selector: string): Iterable<TabsElement>;
}

/** What the island reads from the page, so tests can pass fakes instead of the browser. */
export interface TabsEnv {
  /** All group roots on the page. */
  groups(): Iterable<TabsGroup>;
  /** The page URL's query, as `location.search` gives it (`"?tab=macOS"` or `""`). */
  search(): string;
  /** The current vertical scroll offset, in pixels. */
  scrollY(): number;
  /** Scrolls back to a saved offset. */
  scrollTo(top: number): void;
  /** Reads one remembered value. May throw where storage is unavailable. */
  read(key: string): string | undefined;
  /** Remembers one value. May throw where storage is unavailable. */
  write(key: string, value: string): void;
}

/**
 * The page query with `?tab=` written as the `?lang=` that the shared sync module reads. With no
 * `?tab=`, the query is passed through, so `?lang=` keeps working as it does for code tabs.
 */
export function langSearch(search: string): string {
  const tab = new URLSearchParams(search).get(TAB_PARAM)?.trim();
  if (!tab) return search;
  return `?${new URLSearchParams({ [LANG_PARAM]: tab }).toString()}`;
}

/** One group as the shared sync module sees it: its panels are `[role=tabpanel]`, not the code tabs class. */
function synced(group: TabsGroup): SyncGroup {
  return {
    getAttribute: (name) => group.getAttribute(name),
    querySelectorAll: (selector) =>
      selector === CODE_PANEL_SELECTOR ? group.querySelectorAll(PANEL_SELECTOR) : group.querySelectorAll(selector),
  };
}

/**
 * Wires one group: reveals the tab list, pairs each panel with its tab, and selects the first tab. A group
 * whose tabs and panels do not pair up stays stacked: the island changes nothing. `rtl` is the group's
 * direction, which decides which arrow key moves forward.
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

/**
 * Applies the remembered label — `?tab=` from the URL, else the last label chosen — to every enhanced
 * group, then remembers each label a visitor clicks and switches every other group that has it. The
 * work is the code tabs sync module, given groups that find their panels by role instead of by class.
 */
export function syncTabs(env: TabsEnv): void {
  const groups = [...env.groups()];
  const shared: SyncEnv = {
    querySelectorAll: () => groups.map(synced),
    search: () => langSearch(env.search()),
    scrollY: () => env.scrollY(),
    scrollTo: (top) => env.scrollTo(top),
    read: () => env.read(STORAGE_KEY),
    write: (_key, value) => env.write(STORAGE_KEY, value),
  };
  sync(shared);
}

// The theme's tsconfig has no DOM lib; these are the browser globals the island needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare const window: { location: { search: string }; scrollY: number; scrollTo(x: number, y: number): void };
declare function getComputedStyle(element: unknown): { direction: string };

/** Reads one key from localStorage. Access itself can throw, so the whole touch is guarded. */
function storageRead(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Writes one key to localStorage. A write that throws is ignored, per the best-effort contract. */
function storageWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private modes and blocked storage: nothing to remember to.
  }
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const groups = [...document.querySelectorAll(GROUP_SELECTOR)] as TabsGroup[];
  for (const group of groups) activate(group, getComputedStyle(group).direction === "rtl");
  syncTabs({
    groups: () => groups,
    search: () => window.location.search,
    scrollY: () => window.scrollY,
    scrollTo: (top) => window.scrollTo(0, top),
    read: storageRead,
    write: storageWrite,
  });
}
