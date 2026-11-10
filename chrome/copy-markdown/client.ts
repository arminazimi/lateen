/*
 * Copy Markdown island: fetches the page's Markdown twin and writes it to the clipboard, from the
 * button or the `m` key. The button stays hidden unless the browser has both a clipboard and
 * `fetch`, so a visitor without JavaScript (or without the APIs) never sees a control that would do
 * nothing. Nothing is requested until the reader asks for a copy.
 */

/** The parts of the copy button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  dataset: { markdown?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
}

/** The status region the island announces the result on. */
export interface CopyStatus {
  textContent: string | null;
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

/** Fetches `url` and writes its text to the clipboard, announcing the outcome on the status region. */
export function copy(button: CopyButton, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  const fetchText = env.fetchText;
  const url = button.dataset.markdown;
  if (clipboard === undefined || fetchText === undefined || url === undefined || url === "") return Promise.resolve();
  env.status.textContent = "";
  return fetchText(url).then(
    (markdown) => clipboard.writeText(markdown),
  ).then(
    () => {
      env.status.textContent = button.dataset.copied ?? "";
    },
    () => {
      env.status.textContent = button.dataset.copyFailed ?? "";
    },
  );
}

/**
 * Reveals the button and wires its click and the `m` shortcut, unless the browser lacks the
 * clipboard or `fetch`. The shortcut stays out of every field the reader is typing in.
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
    event.preventDefault();
    void copy(button, env);
  });
}

/** The browser environment: the page's clipboard, `fetch`, and the unit's status region. */
const globals = globalThis as unknown as {
  document?: {
    querySelector(selector: string): unknown;
    addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
  };
  navigator?: { clipboard?: Clipboard };
  fetch?: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
};

/** `fetch` as the island wants it: resolves to the body text, and rejects on an HTTP error. */
function browserFetch(url: string): Promise<string> {
  const fetch = globals.fetch;
  if (fetch === undefined) return Promise.reject(new Error("fetch is unavailable"));
  return fetch(url).then((response) =>
    response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`)),
  );
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const document = globals.document;
  const button = document.querySelector("[data-copy-markdown-button]");
  const status = document.querySelector("[data-copy-markdown-status]");
  if (button !== null && status !== null) {
    activate(button as CopyButton, {
      clipboard: globals.navigator?.clipboard,
      fetchText: browserFetch,
      status: status as CopyStatus,
      keys: document,
    });
  }
}
