/* OS tabs island: turns a group's section headings into a WAI-ARIA tab list, selects the reader's
 * operating system, and keeps a manual choice for every OS tab on the site. Without this script the
 * tab list stays hidden and every section stays stacked. */

/** Attribute on each group root (`data-os-tabs`); the island finds groups by it. */
export const GROUP_SELECTOR = "[data-os-tabs]";
export const TABLIST_SELECTOR = ".os-tabs-list";
export const TAB_SELECTOR = "[role=tab]";
export const PANEL_SELECTOR = ".os-tabs-panel";

/** localStorage key the chosen operating system is remembered under. */
export const STORAGE_KEY = "slipway-os-tabs";

/** The operating systems a tab can name. `unknown` means the browser did not say, or a tab named none. */
export type Os = "mac" | "win" | "linux" | "unknown";

/** An operating system the island can choose by name. */
export type KnownOs = Exclude<Os, "unknown">;

const KNOWN: readonly KnownOs[] = ["mac", "win", "linux"];

/** Whether a stored or clicked value names an operating system the island can choose. */
export function isKnownOs(value: unknown): value is KnownOs {
  return typeof value === "string" && (KNOWN as readonly string[]).includes(value);
}

/**
 * The operating system a platform string names. `platform` is `navigator.platform` (or its
 * `userAgentData` replacement): "MacIntel" is `mac`, "Win32" is `win`, "Linux x86_64" is `linux`.
 * Phones and tablets name no desktop install target, so they read as `unknown`.
 */
export function detectOs(platform: string | null | undefined): Os {
  const value = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (value === "" || /android|iphone|ipad|ipod/.test(value)) return "unknown";
  if (/mac|darwin/.test(value)) return "mac";
  if (/windows|\bwin\d*/.test(value)) return "win";
  if (/linux|x11/.test(value)) return "linux";
  return "unknown";
}

/** Reads the remembered operating system. A value that names none, or storage that throws, reads as absent. */
export function readChoice(read: (key: string) => string | undefined): KnownOs | undefined {
  try {
    const value = read(STORAGE_KEY);
    return isKnownOs(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers `os` under the storage key. Remembering is best-effort: storage that throws is ignored. */
export function saveChoice(os: KnownOs, write: (key: string, value: string) => void): void {
  try {
    write(STORAGE_KEY, os);
  } catch {
    // Private modes and blocked storage: the tabs still work, they just start over next page.
  }
}

/** An element the island touches: a tab, a panel, or the tab list. */
export interface TabsElement {
  readonly id: string;
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
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

/** What the island reads from the page, so tests can pass fakes instead of the browser. */
export interface OsEnv {
  /** All group roots on the page. */
  querySelectorAll(selector: string): Iterable<TabsGroup>;
  /** The browser's platform string, as `navigator.platform` gives it. */
  platform(): string;
  /** The current vertical scroll offset, in pixels. */
  scrollY(): number;
  /** Scrolls back to a saved offset. */
  scrollTo(top: number): void;
  /** Reads one remembered value. May throw where storage is unavailable. */
  read(key: string): string | undefined;
  /** Remembers one value. May throw where storage is unavailable. */
  write(key: string, value: string): void;
}

// The theme's tsconfig has no DOM lib; these are the browser globals the island needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare const window: { scrollY: number; scrollTo(x: number, y: number): void };
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
 * Switches one group to the tab for `os`, and reports whether it switched. A group without that OS, or
 * one whose tabs and panels do not pair up, falls back to its first tab; `unknown` always does.
 */
export function choose(group: TabsGroup, os: Os): boolean {
  const tabs = [...group.querySelectorAll(TAB_SELECTOR)];
  const panels = [...group.querySelectorAll(PANEL_SELECTOR)];
  if (tabs.length === 0 || tabs.length !== panels.length) return false;
  let index = os === "unknown" ? -1 : tabs.findIndex((tab) => tab.getAttribute("data-os") === os);
  if (index < 0) index = 0;
  if (tabs[index]?.getAttribute("aria-selected") === "true") return false;
  select(tabs, panels, index);
  return true;
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
 * Chooses the starting operating system for every group — what was remembered, else what the browser
 * reports, else the first tab — then remembers each tab a visitor clicks and switches every other
 * group that offers it. Switching can change how tall the page is, so the scroll offset is put back.
 */
export function sync(env: OsEnv): void {
  const groups = [...env.querySelectorAll(GROUP_SELECTOR)];
  const os = readChoice(env.read) ?? detectOs(env.platform());
  for (const group of groups) choose(group, os);

  for (const group of groups) {
    for (const tab of group.querySelectorAll(TAB_SELECTOR)) {
      tab.addEventListener("click", () => {
        const value = tab.getAttribute("data-os");
        if (!isKnownOs(value)) return;
        saveChoice(value, env.write);
        const top = env.scrollY();
        let moved = false;
        for (const other of groups) {
          if (other !== group && choose(other, value)) moved = true;
        }
        if (moved) env.scrollTo(top);
      });
    }
  }
}

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

/** The platform string the browser reports. `userAgentData` is the newer source; `platform` is the fallback. */
function platformOf(): string {
  const agent = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return agent?.platform ?? navigator.platform ?? "";
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const groups = [...document.querySelectorAll(GROUP_SELECTOR)] as TabsGroup[];
  for (const group of groups) activate(group, getComputedStyle(group).direction === "rtl");
  sync({
    querySelectorAll: (selector) => (selector === GROUP_SELECTOR ? groups : []),
    platform: platformOf,
    scrollY: () => window.scrollY,
    scrollTo: (top) => window.scrollTo(0, top),
    read: storageRead,
    write: storageWrite,
  });
}
