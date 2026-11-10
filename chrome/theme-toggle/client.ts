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

/** The environment the switch lives in; `live()` builds the browser's. */
export interface ThemeEnv {
  storage: ThemeStorage;
  root: ThemeRoot;
  prefersLight: boolean;
}

// The theme's tsconfig has no DOM lib; these are the browser globals the switch needs, no more.
declare const document: { querySelector(selector: string): unknown; documentElement: ThemeRoot };
declare function matchMedia(query: string): { matches: boolean };
declare const localStorage: ThemeStorage;

const WORDS: Record<ThemeChoice, string> = { light: "Light", system: "System", dark: "Dark" };

/** A stored `system` follows the OS preference; an explicit light or dark wins as stored. */
export function resolve(choice: ThemeChoice, prefersLight: boolean): AppliedTheme {
  if (choice === "system") return prefersLight ? "light" : "dark";
  return choice;
}

/** The saved choice; anything unknown — or storage refusing to open — reads as `system`, the default. */
export function read(storage: ThemeStorage): ThemeChoice {
  try {
    const saved = storage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
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

/** Reveal the switch, show and apply the saved choice, and move to the next choice on every press. */
export function activate(toggle: ThemeToggleRoot, env: ThemeEnv): void {
  let current = read(env.storage);
  sync(toggle, current);
  apply(env, current);
  toggle.addEventListener("click", () => {
    current = next(current);
    choose(env, toggle, current);
  });
}

/** The browser environment: page storage, `<html>`, and the OS color-scheme preference. */
function live(): ThemeEnv {
  return {
    storage: localStorage,
    root: document.documentElement,
    prefersLight: matchMedia("(prefers-color-scheme: light)").matches,
  };
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) activate(toggle as ThemeToggleRoot, live());
}
