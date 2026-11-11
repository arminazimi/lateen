/*
 * The reader's choice for unmodified character shortcuts. `/`, `m`, and `?` are one class: a single
 * preference turns all three off, while the modified Ctrl/Cmd+K keeps opening search. The shortcuts
 * dialog's checkbox writes a shared in-memory override and, best-effort, storage; every island that
 * reads a character key reads the override again on each press, so the choice takes effect at once on
 * this page and across a reload when storage works.
 *
 * Storage is best-effort. A browser that blocks it, or holds a value the theme did not write, reads
 * as "on" until the reader makes an explicit choice, so a storage failure never takes a shortcut away.
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

/**
 * The reader's explicit choice on this page, shared by every island. Storage only carries it to the
 * next page: a blocked or read-only store still applies the choice at once.
 */
let override: boolean | undefined;

/** The browser's storage, or none when the browser refuses access to it. */
export function liveStorage(): ShortcutStorage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Whether the reader still wants unmodified character shortcuts. An explicit choice on this page wins;
 * otherwise missing storage, a refusal, and an unexpected stored value all read as on, and only the
 * value the dialog writes turns them off.
 */
export function shortcutsEnabled(storage: ShortcutStorage | undefined = liveStorage()): boolean {
  if (override !== undefined) return override;
  try {
    return storage?.getItem(STORAGE_KEY) !== OFF;
  } catch {
    return true;
  }
}

/**
 * Remembers `enabled` for this page at once, then best-effort in storage. Storage may throw (private
 * mode or a read-only store): every island still sees the choice, and only persistence is lost.
 */
export function rememberShortcuts(storage: ShortcutStorage | undefined, enabled: boolean): void {
  override = enabled;
  try {
    storage?.setItem(STORAGE_KEY, enabled ? "on" : OFF);
  } catch {
    /* storage is unavailable: the in-memory choice still applies on this page */
  }
}

/** Drops the page's explicit choice, so the next read comes from storage: tests simulate a fresh page. */
export function resetShortcutsPreference(): void {
  override = undefined;
}
