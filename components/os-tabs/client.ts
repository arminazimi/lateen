/* OS tabs island: turns a group's section headings into a WAI-ARIA tab list, selects the reader's
 * operating system, and keeps a manual choice for every OS tab on the site — in the query, in every
 * other browser tab, and in storage. Without this script the tab list stays hidden and every section
 * stays stacked. */

/** Attribute on each group root (`data-os-tabs`); the island finds groups by it. */
export const GROUP_SELECTOR = "[data-os-tabs]";
export const TABLIST_SELECTOR = ".os-tabs-list";
export const TAB_SELECTOR = "[role=tab]";
export const PANEL_SELECTOR = ".os-tabs-panel";

/** localStorage key the chosen operating system is remembered under. */
export const STORAGE_KEY = "lateen-os-tabs";

/** Query parameter whose value chooses the operating system and beats what is remembered. */
export const OS_PARAM = "os";

/** Attribute `activate()` leaves on the groups it wired; a stacked group never carries it. */
export const ENHANCED_ATTR = "data-enhanced";

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

/** The operating system a shared URL names, when `?os=` holds one the island can choose. */
export function osFromUrl(search: string): KnownOs | undefined {
  const value = new URLSearchParams(search).get(OS_PARAM)?.trim().toLowerCase();
  return isKnownOs(value) ? value : undefined;
}

/** The page URL's query with `?os=` set to `os`; every other parameter stays, and `hash` is kept. */
export function withOs(search: string, hash: string, os: KnownOs): string {
  const params = new URLSearchParams(search);
  params.set(OS_PARAM, os);
  return `?${params.toString()}${hash}`;
}

/**
 * The operating system this page starts on: a valid `?os=` in `search` wins, then what `read`
 * remembers. An `?os=` that names none is ignored, so the remembered choice or the platform applies.
 * A storage read that throws counts as nothing remembered.
 */
export function readChoice(search: string, read: (key: string) => string | undefined): KnownOs | undefined {
  const fromUrl = osFromUrl(search);
  if (fromUrl !== undefined) return fromUrl;
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
  getAttribute(name: string): string | null;
  querySelector(selector: string): TabsElement | null;
  querySelectorAll(selector: string): Iterable<TabsElement>;
}

/** What the island reads from the page, so tests can pass fakes instead of the browser. */
export interface OsEnv {
  /** All group roots on the page. */
  querySelectorAll(selector: string): Iterable<TabsGroup>;
  /** The browser's platform string, as `navigator.platform` gives it. */
  platform(): string;
  /** The page URL's query, as `location.search` gives it (`"?os=mac"` or `""`). */
  search(): string;
  /** The page URL's fragment, as `location.hash` gives it (`"#install"` or `""`). */
  hash(): string;
  /** Replaces the page URL, without a history entry, a reload, a scroll, or a focus change. */
  replaceUrl(url: string): void;
  /** Hears each storage change another browser tab makes; `value` is `undefined` when it was removed. */
  listen(listener: (key: string, value: string | undefined) => void): void;
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
declare const window: {
  location: { search: string; hash: string };
  scrollY: number;
  scrollTo(x: number, y: number): void;
  addEventListener(type: string, listener: (event: { key: string | null; newValue: string | null }) => void): void;
};
declare const history: { replaceState(data: unknown, unused: string, url: string): void };
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
 * direction, which decides which arrow key moves forward. `onSelect` hears every explicit choice — a
 * click or an arrow key — as the OS it names, so the page can remember and share it. The group is
 * enhanced only after every part is wired; a failure halfway through leaves its sections stacked.
 */
export function activate(group: TabsGroup, rtl: boolean, onSelect?: (os: KnownOs) => void): void {
  const list = group.querySelector(TABLIST_SELECTOR);
  const tabs = [...group.querySelectorAll(TAB_SELECTOR)];
  const panels = [...group.querySelectorAll(PANEL_SELECTOR)];
  if (!list || tabs.length === 0 || tabs.length !== panels.length) return;

  const chose = (index: number): void => {
    select(tabs, panels, index);
    const value = tabs[index]?.getAttribute("data-os");
    if (isKnownOs(value)) onSelect?.(value);
  };

  try {
    tabs.forEach((tab, i) => {
      const panel = panels[i];
      if (panel) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
      }
      tab.addEventListener("click", () => chose(i));
    });

    list.addEventListener("keydown", (event) => {
      const from = tabs.indexOf(event.target as TabsElement);
      if (from === -1) return;
      const to = step(event.key ?? "", from, tabs.length, rtl);
      if (to === undefined) return;
      event.preventDefault();
      chose(to);
      tabs[to]?.focus();
    });

    select(tabs, panels, 0);
    list.hidden = false;
  } catch {
    list.hidden = true;
    for (const panel of panels) panel.hidden = false;
    return;
  }

  group.setAttribute(ENHANCED_ATTR, "");
}

/**
 * Wires the page: chooses the starting OS — a valid `?os=`, else what was remembered, else what the
 * browser reports, else the first tab — and switches every enhanced group to it. Returns the handler
 * for an explicit choice: it remembers the OS, switches every group that offers it, restores the scroll
 * offset, and writes `?os=` into the URL without touching other parameters or the fragment. It also
 * follows valid choices made in other browser tabs, ignoring an event that a newer write already
 * replaced so a stale one never undoes a newer explicit choice. A group the island could not enhance
 * stays stacked and is never switched.
 */
export function sync(env: OsEnv): (os: KnownOs) => void {
  const groups = [...env.querySelectorAll(GROUP_SELECTOR)].filter(
    (group) => group.getAttribute(ENHANCED_ATTR) !== null,
  );

  const apply = (value: KnownOs): void => {
    const top = env.scrollY();
    let moved = false;
    for (const group of groups) {
      if (choose(group, value)) moved = true;
    }
    if (moved) env.scrollTo(top);
  };

  const os = readChoice(env.search(), env.read) ?? detectOs(env.platform());
  for (const group of groups) choose(group, os);

  env.listen((key, value) => {
    if (key !== STORAGE_KEY || !isKnownOs(value)) return;
    // Another tab may have written again between the event and this read; the newer value wins.
    if (readChoice("", env.read) !== value) return;
    apply(value);
  });

  return (value) => {
    saveChoice(value, env.write);
    apply(value);
    try {
      env.replaceUrl(withOs(env.search(), env.hash(), value));
    } catch {
      // A URL the browser refuses costs sharing only; the tabs still work.
    }
  };
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
  let explicit: (os: KnownOs) => void = () => {};

  for (const group of groups) {
    try {
      activate(group, getComputedStyle(group).direction === "rtl", (os) => explicit(os));
    } catch {
      // One group that cannot be read must not keep the rest of the page from enhancing.
    }
  }
  explicit = sync({
    querySelectorAll: (selector) => (selector === GROUP_SELECTOR ? groups : []),
    platform: platformOf,
    search: () => window.location.search,
    hash: () => window.location.hash,
    replaceUrl: (url) => history.replaceState(null, "", url),
    listen: (listener) =>
      window.addEventListener("storage", (event) => listener(event.key ?? "", event.newValue ?? undefined)),
    scrollY: () => window.scrollY,
    scrollTo: (top) => window.scrollTo(0, top),
    read: storageRead,
    write: storageWrite,
  });
}
