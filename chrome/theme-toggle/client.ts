import { THEME_KEY } from "./key.ts";

/** What the switch can hold: the visitor's choice, stored under `THEME_KEY`. */
export type ThemeChoice = "light" | "dark" | "system";

/** The theme a choice puts on the page. */
export type AppliedTheme = "light" | "dark";

/** The parts of `Storage` the switch uses, so tests can pass plain objects. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** An element of the switch the script writes to: the button or the status region. */
export interface ThemeElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
}

/** A click event; the switch needs nothing from it. */
export interface ThemeClick {
  target?: unknown;
}

/** The switch root as the script touches it. */
export interface ThemeToggleRoot {
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): ThemeElement | null;
  addEventListener(type: string, listener: (event: ThemeClick) => void): void;
}

/** The one element `data-theme` is set on (`document.documentElement`). */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

/** The color-scheme query and the change listener the switch needs from it. */
export interface ThemeMedia {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: "change", listener: (event: { matches: boolean }) => void): void;
}

/** A storage event from another tab; the switch reads only the key and its new value. */
export interface ThemeStorageEvent {
  readonly key?: string | null;
  readonly newValue?: string | null;
}

/** The window events the switch listens to for other tabs. */
export interface ThemeEvents {
  addEventListener?(type: "storage", listener: (event: ThemeStorageEvent) => void): void;
  removeEventListener?(type: "storage", listener: (event: ThemeStorageEvent) => void): void;
}

/** The environment the switch lives in; `live()` builds the browser's. */
export interface ThemeEnv {
  storage: ThemeStorage;
  root: ThemeRoot;
  prefersLight: boolean;
  media?: ThemeMedia;
  events?: ThemeEvents;
}

// The theme's tsconfig has no DOM lib; these are the browser globals the switch needs, no more.
declare const document: { querySelector(selector: string): unknown; documentElement: ThemeRoot };
declare const matchMedia: ((query: string) => ThemeMedia) | undefined;
declare const localStorage: ThemeStorage;

const WORDS: Record<ThemeChoice, string> = { light: "Light", system: "System", dark: "Dark" };

/** A stored `system` follows the OS preference; an explicit light or dark wins as stored. */
export function resolve(choice: ThemeChoice, prefersLight: boolean): AppliedTheme {
  if (choice === "system") return prefersLight ? "light" : "dark";
  return choice;
}

/** What a stored string means: the three choices pass, anything else is the `system` default. */
function parse(saved: string | null): ThemeChoice {
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

/** The saved choice; anything unknown — or storage refusing to open — reads as `system`, the default. */
export function read(storage: ThemeStorage): ThemeChoice {
  try {
    return parse(storage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/** Remember the choice. Storage may throw (private mode); the choice still applies to this page view. */
export function save(storage: ThemeStorage, choice: ThemeChoice): void {
  try {
    storage.setItem(THEME_KEY, choice);
  } catch {
    /* storage is unavailable: apply the choice without remembering it */
  }
}

/** Put the theme for `choice` on the page. */
export function apply(env: ThemeEnv, choice: ThemeChoice): void {
  env.root.setAttribute("data-theme", resolve(choice, env.prefersLight));
}

/** Light, then system, then dark, then light again. */
const ORDER: readonly ThemeChoice[] = ["light", "system", "dark"];

/** The choice a press moves to from `choice`. */
export function next(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
}

/** Reveal the switch, show the icon of `choice`, and name the choice and the next one on the button. */
export function sync(toggle: ThemeToggleRoot, choice: ThemeChoice): void {
  toggle.hidden = false;
  toggle.setAttribute("data-choice", choice);
  const label = `Color theme: ${WORDS[choice]}. Switch to ${WORDS[next(choice)].toLowerCase()}.`;
  toggle.querySelector(".theme-toggle-button")?.setAttribute("aria-label", label);
}

/** Announce the new choice on the switch's status region. */
export function announce(toggle: ThemeToggleRoot, choice: ThemeChoice): void {
  const status = toggle.querySelector(".theme-toggle-status");
  if (status) status.textContent = `${WORDS[choice]} theme.`;
}

/** One change of the switch: remember the choice, apply it, reflect it, and announce it. */
export function choose(env: ThemeEnv, toggle: ThemeToggleRoot, choice: ThemeChoice): void {
  save(env.storage, choice);
  apply(env, choice);
  sync(toggle, choice);
  announce(toggle, choice);
}

/**
 * Reveal the switch, show and apply the saved choice, move to the next choice on every press, and follow
 * the OS and other tabs; returns a cleanup that stops listening.
 */
export function activate(toggle: ThemeToggleRoot, env: ThemeEnv): () => void {
  let current = read(env.storage);
  if (env.media) env.prefersLight = env.media.matches;
  sync(toggle, current);
  apply(env, current);

  /** Take a choice made elsewhere (another tab), without saving it back. */
  const follow = (choice: ThemeChoice) => {
    if (choice === current) return;
    current = choice;
    apply(env, choice);
    sync(toggle, choice);
    announce(toggle, choice);
  };

  const onMedia = (event: { matches: boolean }) => {
    // Remember the new OS preference even for an explicit choice, so a later switch to system is fresh.
    env.prefersLight = event.matches;
    if (current === "system") apply(env, current);
  };

  const onStorage = (event: ThemeStorageEvent) => {
    if (event.key != null && event.key !== THEME_KEY) return;
    const saved = event.newValue ?? null;
    // A removed key reads as the default; an unknown value is ignored rather than trusted.
    if (saved !== null && saved !== "light" && saved !== "dark" && saved !== "system") return;
    follow(parse(saved));
  };

  env.media?.addEventListener?.("change", onMedia);
  env.events?.addEventListener?.("storage", onStorage);

  toggle.addEventListener("click", () => {
    current = next(current);
    choose(env, toggle, current);
  });

  return () => {
    env.media?.removeEventListener?.("change", onMedia);
    env.events?.removeEventListener?.("storage", onStorage);
  };
}

/** The browser environment: page storage, `<html>`, the OS color-scheme query, and other tabs' storage events. */
function live(): ThemeEnv {
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : undefined;
  return {
    storage: localStorage,
    root: document.documentElement,
    prefersLight: media?.matches ?? false,
    ...(media === undefined ? {} : { media }),
    events: globalThis as unknown as ThemeEvents,
  };
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) activate(toggle as ThemeToggleRoot, live());
}
