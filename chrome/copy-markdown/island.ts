/*
 * The page copy island, shared by `chrome/copy-markdown` and `chrome/page-agent-menu`: fetch the
 * page's Markdown twin, write it to the clipboard, and announce loading, success, and failure on the
 * control's status region. Both page actions run this one implementation, so the same denial or
 * failed request gives the same visible, announced answer wherever the reader asked.
 *
 * The module is pure; each unit's `client.ts` passes the browser's button, status region, clipboard,
 * `fetch`, and key listener.
 */

import { shortcutsEnabled, type ShortcutStorage } from "../shortcuts/preference.ts";

/** The parts of the copy button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  dataset: { markdown?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
  /** The button's own click path, so the shortcut takes exactly the pointer's route. */
  click(): void;
}

/** The status region the island announces the result on. */
export interface CopyStatus {
  textContent: string | null;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
}

/** The part of `navigator.clipboard` the island uses. */
export interface Clipboard {
  writeText(text: string): Promise<void>;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface CopyEnv {
  clipboard?: Clipboard | undefined;
  fetchText?: ((url: string) => Promise<string>) | undefined;
  status: CopyStatus;
}

/** A keyboard event as the shortcut reads it. */
export interface ShortcutEvent {
  readonly key?: string | undefined;
  readonly metaKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly repeat?: boolean | undefined;
  readonly target?: unknown;
  preventDefault(): void;
}

/** Where the `m` shortcut listens; the browser passes `document`, tests a fake. */
export interface ShortcutHost {
  addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
}

/** The environment `activate` needs: the copy APIs, the status region, and a key listener host. */
export interface ActivateEnv extends CopyEnv {
  keys?: ShortcutHost | undefined;
  /** The preference storage; absent reads the browser's own, and an unreadable one reads as on. */
  storage?: ShortcutStorage | undefined;
}

/** Elements that take typed text, where `m` must stay an ordinary letter. */
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether the key event happens in a field the reader is typing in. Kept here, like the search
 * shortcut's copy in `chrome/search/shortcut.ts`, so the island stays a single module.
 */
export function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return TYPING_TAGS.has(tag) || element.isContentEditable === true;
}

/**
 * Whether `event` is the copy shortcut: a plain `m`, alone. A command or alt modifier belongs to the
 * browser, and `/`, `?`, and Ctrl/Cmd+K belong to search; none of them reach the copy button.
 */
export function isCopyShortcut(event: ShortcutEvent): boolean {
  if (event.altKey === true || event.ctrlKey === true || event.metaKey === true) return false;
  if (event.repeat === true) return false;
  return event.key?.toLowerCase() === "m";
}

/** Buttons with a copy already in flight; a second press waits for the first answer. */
const busy = new WeakSet<CopyButton>();

/**
 * Fetches the button's Markdown twin and writes it to the clipboard. The status region is cleared
 * and marked `aria-busy` while the request runs, then carries the button's localized success or
 * failure text. A button with no address, or an environment without the clipboard or `fetch`, copies
 * nothing and announces nothing, so the plain Markdown link stays the fallback.
 */
export function copy(button: CopyButton, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  const fetchText = env.fetchText;
  const url = button.dataset.markdown;
  if (clipboard === undefined || fetchText === undefined || url === undefined || url === "") return Promise.resolve();
  if (busy.has(button)) return Promise.resolve();

  busy.add(button);
  env.status.textContent = "";
  env.status.setAttribute?.("aria-busy", "true");
  const finish = (message: string | undefined): void => {
    busy.delete(button);
    env.status.removeAttribute?.("aria-busy");
    env.status.textContent = message ?? "";
  };

  return fetchText(url).then(
    (markdown) => clipboard.writeText(markdown),
  ).then(
    () => finish(button.dataset.copied),
    () => finish(button.dataset.copyFailed),
  );
}

/**
 * Reveals the button and wires its click and the `m` shortcut, unless the browser lacks the
 * clipboard or `fetch`. The shortcut presses the button, so a key and a pointer run the same code,
 * and it stays out of every field the reader is typing in. A reader who turned unmodified character
 * shortcuts off keeps the button: only the key steps aside.
 */
export function activate(button: CopyButton, env: ActivateEnv): void {
  if (env.clipboard === undefined || env.fetchText === undefined) return;
  if (button.dataset.markdown === undefined || button.dataset.markdown === "") return;
  button.hidden = false;
  button.addEventListener("click", () => {
    void copy(button, env);
  });
  env.keys?.addEventListener("keydown", (event) => {
    if (!isCopyShortcut(event)) return;
    if (isTypingTarget(event.target)) return;
    if (!shortcutsEnabled(env.storage)) return;
    event.preventDefault();
    button.click();
  });
}

/** The browser environment: the page's clipboard, `fetch`, and an element query. */
export const globals = globalThis as unknown as {
  document?: {
    querySelector(selector: string): unknown;
    addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
  };
  navigator?: { clipboard?: Clipboard };
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
};

/** `fetch` as the island wants it: resolves to the body text, and rejects on an HTTP error. */
export function browserFetch(url: string): Promise<string> {
  const fetch = globals.fetch;
  if (fetch === undefined) return Promise.reject(new Error("fetch is unavailable"));
  return fetch(url).then((response) =>
    response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`)),
  );
}
