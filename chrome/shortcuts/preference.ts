/*
 * The reader's choice for unmodified character shortcuts. `/`, `m`, and `?` are one class: a single
 * stored preference turns all three off, while the modified Ctrl/Cmd+K keeps opening search. The
 * shortcuts dialog's checkbox writes it, and every island that reads a character key reads it again
 * on each press, so the choice takes effect at once and across a reload.
 *
 * Storage is best-effort. A browser that blocks it, or holds a value the theme did not write, reads
 * as "on", so a storage failure never takes a shortcut away from the reader.
 */

/** localStorage key for the preference; all three shortcut islands share it. */
export const STORAGE_KEY = "lateen-shortcuts";

/** The stored value that turns the unmodified shortcuts off; anything else reads as on. */
export const OFF = "off";

/** The parts of `Storage` the preference uses, so tests can pass plain objects. */
export interface ShortcutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// The theme's tsconfig has no DOM lib; this is the browser global the preference needs, no more.
declare const localStorage: ShortcutStorage;

/** The browser's storage, or none when the browser refuses access to it. */
export function liveStorage(): ShortcutStorage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Whether the reader still wants unmodified character shortcuts. Missing storage, a refusal, and an
 * unexpected stored value all read as on; only the value the dialog writes turns them off.
 */
export function shortcutsEnabled(storage: ShortcutStorage | undefined = liveStorage()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) !== OFF;
  } catch {
    return true;
  }
}

/**
 * Remembers `enabled`. Storage may throw (private mode): the shortcuts stay on for every press, since
 * the islands read the same key rather than a copy of the choice.
 */
export function rememberShortcuts(storage: ShortcutStorage | undefined, enabled: boolean): void {
  try {
    storage?.setItem(STORAGE_KEY, enabled ? "on" : OFF);
  } catch {
    /* storage is unavailable: nothing is remembered and no shortcut is lost */
  }
}
