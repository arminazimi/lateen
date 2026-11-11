/*
 * Search shortcuts: ⌘K on Apple platforms and Ctrl+K elsewhere open the search dialog from anywhere,
 * and `/` opens it too. A key pressed while the reader is typing in a field stays in that field, and
 * `/` steps aside while the reader has turned unmodified character shortcuts off. The modified
 * command key is never gated: it is how a reader who types `/` all day still reaches search.
 *
 * The module is pure: `client.ts` calls `activateShortcuts` with the search button and the platform,
 * so tests need no browser. That same call puts the platform's hint on the search button.
 */

import { shortcutsEnabled, type ShortcutStorage } from "../shortcuts/preference.ts";

/** The hint the search button shows on Apple platforms. */
export const MAC_HINT = "⌘K";

/** The hint the search button shows everywhere else. */
export const OTHER_HINT = "Ctrl+K";

/** Whether `platform` (as `navigator.platform` reports it) is an Apple one. */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The hint for `platform`: ⌘K on Apple platforms, Ctrl+K elsewhere. */
export function hintFor(platform: string): string {
  return isMacPlatform(platform) ? MAC_HINT : OTHER_HINT;
}

/** A keyboard event as the shortcut reads it. */
export interface ShortcutEvent {
  readonly key?: string | undefined;
  readonly metaKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly target?: unknown;
  preventDefault(): void;
}

/** The search button: a shortcut presses it, exactly as a reader would. */
export interface ShortcutButton {
  click(): void;
}

/** The element inside the search button that shows the hint. */
export interface ShortcutHint {
  textContent: string | null;
}

/** The elements `activateShortcuts` wires. */
export interface ShortcutParts {
  readonly button: ShortcutButton;
  readonly hint?: ShortcutHint;
}

/** Where the shortcut listens; the browser passes `document`, tests a fake. */
export interface ShortcutEnv {
  readonly platform: string;
  addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
  /** The preference storage; absent reads the browser's own, and an unreadable one reads as on. */
  readonly storage?: ShortcutStorage | undefined;
}

/** Elements that take typed text, where `/` and the shortcut must stay ordinary keys. */
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether the key event happens in a field the reader is typing in. A shortcut never takes a key from
 * a field, so every input, textarea, select, and contenteditable element counts.
 */
export function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return TYPING_TAGS.has(tag) || element.isContentEditable === true;
}

/** The command modifier that opens search on `platform`: ⌘ on Apple platforms, Ctrl elsewhere. */
function primaryModifier(event: ShortcutEvent, platform: string): boolean {
  return isMacPlatform(platform)
    ? event.metaKey === true && event.ctrlKey !== true
    : event.ctrlKey === true && event.metaKey !== true;
}

/**
 * Whether `event` is the search shortcut: ⌘K or Ctrl+K for the platform, or `/` with no command
 * modifier. Shift is allowed for `/` because some keyboard layouts need it to type the character.
 */
export function isSearchShortcut(event: ShortcutEvent, platform: string): boolean {
  if (event.altKey === true) return false;
  const key = event.key?.toLowerCase();
  if (key === "k") return primaryModifier(event, platform) && event.shiftKey !== true;
  return key === "/" && event.metaKey !== true && event.ctrlKey !== true;
}

/**
 * Puts the platform's hint on the search button and opens search on the shortcut from anywhere except
 * a field. The listener is on the document, so a key pressed with focus on the page still counts. The
 * unmodified `/` is read from the reader's preference on every press; `⌘K`/`Ctrl+K` never is.
 */
export function activateShortcuts(parts: ShortcutParts, env: ShortcutEnv): void {
  if (parts.hint !== undefined) parts.hint.textContent = hintFor(env.platform);
  env.addEventListener("keydown", (event) => {
    if (!isSearchShortcut(event, env.platform)) return;
    if (event.key?.toLowerCase() === "/" && !shortcutsEnabled(env.storage)) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    parts.button.click();
  });
}
