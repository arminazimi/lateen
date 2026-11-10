/* Sync part of the code tabs island: the label a visitor chooses applies to every group with that
 * label on the page, and is remembered for the pages they open later. `?lang=` in the URL wins over
 * what is remembered. `client.ts` imports this module for its side effect, because the engine loads
 * exactly one file per component island (ADR 0022, rule 3). */

import { GROUP_SELECTOR, PANEL_SELECTOR, TAB_SELECTOR, select, type TabsElement } from "./client.ts";

/** localStorage key the chosen label is remembered under. */
export const STORAGE_KEY = "slipway-code-tabs";

/** Query parameter whose value chooses the label and beats what is remembered. */
export const LANG_PARAM = "lang";

/** The `data-enhanced` marker `client.ts` leaves on groups it turned into tabs. */
export const ENHANCED_ATTR = "data-enhanced";

/** A tab button as the sync part sees it: an island element that also carries its label text. */
export type SyncTab = TabsElement & {
  /** The tab's label, as rendered (the button's text). */
  readonly textContent: string | null;
  /** Reads one attribute, so an already-selected tab is left alone. */
  getAttribute(name: string): string | null;
};

/** One group root as the sync part sees it. */
export interface SyncGroup {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): Iterable<SyncTab>;
}

/** What the sync part touches, so tests can pass fakes instead of the browser. */
export interface SyncEnv {
  /** All group roots on the page. */
  querySelectorAll(selector: string): Iterable<SyncGroup>;
  /** The page URL's query, as `location.search` gives it (`"?lang=npm"` or `""`). */
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

/** The label of a tab, trimmed; a tab with no text has none. */
function labelOf(tab: SyncTab): string | undefined {
  const label = tab.textContent?.trim();
  return label ? label : undefined;
}

/**
 * The label this page starts on: `?lang=` from `search` wins, then what `read` remembers. An empty
 * `?lang=` counts as absent. A storage read that throws counts as nothing remembered.
 */
export function readChoice(search: string, read: (key: string) => string | undefined): string | undefined {
  const fromUrl = new URLSearchParams(search).get(LANG_PARAM)?.trim();
  if (fromUrl) return fromUrl;
  try {
    return read(STORAGE_KEY);
  } catch {
    return undefined;
  }
}

/** Remembers `label` under the storage key. Remembering is best-effort: storage that throws is ignored. */
export function saveChoice(label: string, write: (key: string, value: string) => void): void {
  try {
    write(STORAGE_KEY, label);
  } catch {
    // Private modes and blocked storage: the tabs still work, they just start over next page.
  }
}

/**
 * Switches one group to its first tab labeled `label`, and reports whether it switched. A group
 * without that label, a group already showing it, or one whose tabs and panels do not pair up stays
 * as it is.
 */
export function choose(group: SyncGroup, label: string): boolean {
  const tabs = [...group.querySelectorAll(TAB_SELECTOR)];
  const panels = [...group.querySelectorAll(PANEL_SELECTOR)];
  if (tabs.length === 0 || tabs.length !== panels.length) return false;
  const index = tabs.findIndex((tab) => labelOf(tab) === label);
  if (index < 0) return false;
  if (tabs[index]?.getAttribute("aria-selected") === "true") return false;
  select(tabs, panels, index);
  return true;
}

/** A group the island enhanced, so one whose blocks still sit stacked is never touched. */
function enhanced(group: SyncGroup): boolean {
  return group.getAttribute(ENHANCED_ATTR) !== null;
}

/**
 * Wires the page: applies the starting label to every enhanced group, then remembers each label a
 * visitor clicks and switches every other group that has it. Switching the other groups can change
 * how tall the page is, so the scroll offset is put back the way it was — the group under the
 * visitor's pointer is the one they chose, and the rest of the page must not move.
 */
export function sync(env: SyncEnv): void {
  const groups = [...env.querySelectorAll(GROUP_SELECTOR)].filter(enhanced);

  const choice = readChoice(env.search(), env.read);
  if (choice !== undefined) {
    for (const group of groups) choose(group, choice);
  }

  for (const group of groups) {
    for (const tab of group.querySelectorAll(TAB_SELECTOR)) {
      tab.addEventListener("click", () => {
        const label = labelOf(tab);
        if (label === undefined) return;
        saveChoice(label, env.write);
        const top = env.scrollY();
        let moved = false;
        for (const other of groups) {
          if (other !== group && choose(other, label)) moved = true;
        }
        if (moved) env.scrollTo(top);
      });
    }
  }
}

// The theme's tsconfig has no DOM lib; these are the browser globals the sync part needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare const window: { location: { search: string }; scrollY: number; scrollTo(x: number, y: number): void };

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

// The island runs when the browser loads it. `client.ts` imports this module first, so this body
// runs before client.ts has enhanced any group; one microtask later, it has. Nothing happens in a
// runtime without a document.
if (typeof document !== "undefined") {
  queueMicrotask(() => {
    sync({
      querySelectorAll: (selector) => [...document.querySelectorAll(selector)].map((element) => element as SyncGroup),
      search: () => window.location.search,
      scrollY: () => window.scrollY,
      scrollTo: (top) => window.scrollTo(0, top),
      read: storageRead,
      write: storageWrite,
    });
  });
}
