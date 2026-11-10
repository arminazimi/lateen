/* Sidebar groups: each group is a native <details>. The group that holds the page stays open; the rest remember their open or closed state in localStorage. */

/** localStorage key for the sidebar's group states (per site: one origin per site). */
export const STORAGE_KEY = "slipway-sidebar";

const GROUP_SELECTOR = "details[data-sidebar-group]";

/** Open (`true`) or closed (`false`) per group key. */
export type GroupState = Map<string, boolean>;

/** The parts of `Storage` the sidebar uses, so tests can pass plain objects. */
export interface SidebarStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A group `<details>` as the script touches it. */
export interface SidebarGroup {
  open: boolean;
  getAttribute(name: string): string | null;
  addEventListener(type: "toggle", listener: () => void): void;
}

/** The root the groups are found in: the document in a browser. */
export interface SidebarRoot {
  querySelectorAll(selector: string): Iterable<SidebarGroup>;
}

/** The environment the sidebar lives in; `live()` builds the browser's. `storage` is absent when the browser refuses it. */
export interface SidebarEnv {
  storage?: SidebarStorage | undefined;
  root: SidebarRoot;
}

// The theme's tsconfig has no DOM lib; these are the browser globals the sidebar needs, no more.
declare const document: SidebarRoot;
declare const localStorage: SidebarStorage;

/** The saved states; anything unreadable, or storage refusing to open, reads as nothing saved. */
export function read(storage: SidebarStorage | undefined): GroupState {
  const state: GroupState = new Map();
  try {
    const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return state;
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value === "boolean") state.set(key, value);
    }
  } catch {
    /* unreadable storage or saved data: nothing is remembered */
  }
  return state;
}

/** Remember the states. Storage may throw (private mode); the states still apply to this page view. */
export function save(storage: SidebarStorage | undefined, state: GroupState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state)));
  } catch {
    /* storage is unavailable: apply the states without remembering them */
  }
}

/** Open the page's own group; open or close the others as they were left. Groups with no saved state keep the server's default. */
export function restore(groups: Iterable<SidebarGroup>, state: GroupState): void {
  for (const group of groups) {
    const key = group.getAttribute("data-sidebar-group");
    if (key === null) continue;
    if (group.getAttribute("data-current") === "true") group.open = true;
    else {
      const saved = state.get(key);
      if (saved !== undefined) group.open = saved;
    }
  }
}

/** Restore the saved states, then remember every later toggle. */
export function activate(env: SidebarEnv): void {
  const groups = [...env.root.querySelectorAll(GROUP_SELECTOR)];
  const state = read(env.storage);
  restore(groups, state);
  for (const group of groups) {
    group.addEventListener("toggle", () => {
      const key = group.getAttribute("data-sidebar-group");
      if (key === null) return;
      state.set(key, group.open);
      save(env.storage, state);
    });
  }
}

/** The browser's storage, or none when the browser refuses access to it. */
function liveStorage(): SidebarStorage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  activate({ storage: liveStorage(), root: document });
}
