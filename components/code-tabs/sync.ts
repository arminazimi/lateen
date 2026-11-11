/* Sync part of the code tabs island: the label a visitor chooses applies to every group with that
 * label on the page, and is remembered for the pages they open later. An explicit choice is also
 * written to `?lang=`, so a copied URL reopens it everywhere; a fragment pointing into a hidden
 * panel reveals that panel on load and on later hash changes. `?lang=` in the URL wins over what is
 * remembered. `client.ts` imports this module for its side effect, because the engine loads exactly
 * one file per component island. */

import { GROUP_SELECTOR, PANEL_SELECTOR, TAB_SELECTOR, select, type TabsElement } from "./client.ts";

/** localStorage key the chosen label is remembered under. */
export const STORAGE_KEY = "lateen-code-tabs";

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

/** The id a fragment names, without its `#` and percent-decoded. An empty or malformed fragment has none. */
export function hashId(hash: string): string | undefined {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return undefined;
  try {
    const id = decodeURIComponent(raw).trim();
    return id === "" ? undefined : id;
  } catch {
    return undefined;
  }
}

/** The page query with `?lang=` set to `label`, keeping every other parameter where it was. */
export function withLang(search: string, label: string): string {
  const params = new URLSearchParams(search);
  params.set(LANG_PARAM, label);
  return `?${params.toString()}`;
}

/**
 * One group root as the fragment helpers need it. `getAttribute` is optional so a group read only
 * for its panels can be passed too.
 */
export interface HashGroup {
  getAttribute?(name: string): string | null;
  querySelectorAll(selector: string): Iterable<TabsElement>;
}

/** The group and panel index a fragment belongs to. */
export interface HashTarget {
  group: HashGroup;
  index: number;
}

/**
 * Resolves a fragment to the panel that owns its element. `panelOf` finds the panel the target id
 * sits in, so a heading inside a panel resolves as well as the panel itself. An unknown id, or a
 * group whose tabs and panels do not pair up, resolves to nothing.
 */
export function targetOf(
  groups: Iterable<HashGroup>,
  panelOf: (id: string) => TabsElement | null | undefined,
  hash: string,
): HashTarget | undefined {
  const id = hashId(hash);
  if (id === undefined) return undefined;
  const panel = panelOf(id);
  if (!panel) return undefined;

  for (const group of groups) {
    const tabs = [...group.querySelectorAll(TAB_SELECTOR)];
    const panels = [...group.querySelectorAll(PANEL_SELECTOR)];
    if (tabs.length === 0 || tabs.length !== panels.length) continue;
    const index = panels.indexOf(panel);
    if (index >= 0) return { group, index };
  }
  return undefined;
}

/**
 * Reveals the panel a fragment names and reports whether a hidden panel had to be shown. A group the
 * island did not enhance stays stacked with every block visible, so touching it would hide content;
 * it is left alone.
 */
export function revealTarget(target: HashTarget): boolean {
  if (target.group.getAttribute && target.group.getAttribute(ENHANCED_ATTR) === null) return false;
  const tabs = [...target.group.querySelectorAll(TAB_SELECTOR)];
  const panels = [...target.group.querySelectorAll(PANEL_SELECTOR)];
  if (tabs.length === 0 || tabs.length !== panels.length || target.index >= tabs.length) return false;
  const wasHidden = panels[target.index]?.hidden === true;
  select(tabs, panels, target.index);
  return wasHidden;
}

/** Shows the panel a fragment names, reporting whether a hidden panel had to be shown. */
export function revealHash(
  groups: Iterable<HashGroup>,
  panelOf: (id: string) => TabsElement | null | undefined,
  hash: string,
): boolean {
  const target = targetOf(groups, panelOf, hash);
  return target !== undefined && revealTarget(target);
}

/** What sharing one choice touches, so tests can watch it instead of the browser. */
export interface ShareEnv {
  /** The page URL's query, as `location.search` gives it. */
  search(): string;
  /** The page URL's fragment, as `location.hash` gives it (`"#install"` or `""`). */
  hash(): string;
  /** Replaces the current history entry's URL, so a repeated choice adds no history entry. */
  replace(url: string): void;
}

/**
 * The URL to show for `label`: `?lang=` set, every other parameter kept, and the fragment kept too
 * unless it points into the group being switched (`inside`), where it would name a hidden panel.
 */
export function urlFor(search: string, hash: string, label: string, inside: boolean): string {
  return `${withLang(search, label)}${inside ? "" : hash}`;
}

/** Writes an explicit choice to the URL of the current history entry; a browser that refuses costs sharing only. */
export function share(env: ShareEnv, label: string, inside: boolean): void {
  try {
    env.replace(urlFor(env.search(), env.hash(), label, inside));
  } catch {
    // A URL the browser refuses costs sharing only; the tabs still work.
  }
}

/** The panel an element id sits in, so a heading inside a panel resolves to the panel's group. */
function panelOf(id: string): TabsElement | undefined {
  return (document.getElementById(id)?.closest(PANEL_SELECTOR) as TabsElement | null) ?? undefined;
}

/** Shares one explicit choice from this page: sets `?lang=` and keeps the rest of the URL. */
export function shareChoice(label: string, group?: HashGroup): void {
  const inside = group !== undefined && targetOf([group], panelOf, window.location.hash) !== undefined;
  share(
    {
      search: () => window.location.search,
      hash: () => window.location.hash,
      replace: (url) => history.replaceState(null, "", url),
    },
    label,
    inside,
  );
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
declare const document: {
  querySelectorAll(selector: string): Iterable<unknown>;
  getElementById(id: string): { closest(selector: string): unknown; scrollIntoView?(): void } | null;
};
declare const window: {
  location: { search: string; hash: string };
  scrollY: number;
  scrollTo(x: number, y: number): void;
  addEventListener(type: string, listener: () => void): void;
};
declare const history: { replaceState(data: unknown, unused: string, url: string): void };

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
  const groups = (): HashGroup[] =>
    [...document.querySelectorAll(GROUP_SELECTOR)].map((element) => element as HashGroup);

  queueMicrotask(() => {
    sync({
      querySelectorAll: (selector) => [...document.querySelectorAll(selector)].map((element) => element as SyncGroup),
      search: () => window.location.search,
      scrollY: () => window.scrollY,
      scrollTo: (top) => window.scrollTo(0, top),
      read: storageRead,
      write: storageWrite,
    });
    // After the shared label, so a fragment can open the panel `?lang=` would otherwise keep closed.
    revealHash(groups(), panelOf, window.location.hash);
  });

  // A later fragment may name content in a panel the current label keeps closed. The browser could
  // not scroll to a hidden target, so it is shown first and the reader is then brought to it. A
  // target that was already visible was scrolled to by the browser and is left where it is, so a
  // hash change never adds a jump of its own.
  window.addEventListener("hashchange", () => {
    if (!revealHash(groups(), panelOf, window.location.hash)) return;
    const id = hashId(window.location.hash);
    if (id !== undefined) document.getElementById(id)?.scrollIntoView?.();
  });
}
