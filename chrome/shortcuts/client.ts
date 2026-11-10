/*
 * Keyboard shortcuts dialog: `?` (Shift+/) opens it from anywhere on the page except a field the
 * reader is typing in, Escape closes it, and focus returns to whatever was focused before it opened.
 *
 * The module is pure: `activate` takes the dialog and a document-like environment, so tests need no
 * browser. The island wires it to the page's `[data-shortcuts]` dialog.
 *
 * The keydown listener runs in the capture phase, so `?` is handled before the search shortcut's
 * bubble-phase listener on the same document. The search predicate only accepts `/`, `⌘K`, and
 * `Ctrl+K`, so `?` cannot reach search even when no capture listener runs.
 */

/** The focused element the dialog returns focus to when it closes. */
export interface ShortcutsFocus {
  focus(): void;
}

/** A keyboard event as the dialog reads it. */
export interface ShortcutsEvent {
  readonly key?: string | undefined;
  readonly metaKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly target?: unknown;
  preventDefault(): void;
  stopPropagation?(): void;
}

/** The document as the island touches it: the focused element and a capture-phase key listener. */
export interface ShortcutsDocument {
  readonly activeElement: ShortcutsFocus | null;
  addEventListener(
    type: "keydown",
    listener: (event: ShortcutsEvent) => void,
    options?: { readonly capture?: boolean },
  ): void;
}

/** The dialog's close button, which the script wires when the layout renders one. */
export interface ShortcutsClose {
  addEventListener(type: "click", listener: () => void): void;
}

/** The `<dialog>` element as the script touches it. */
export interface ShortcutsDialog {
  readonly open: boolean;
  hidden: boolean;
  showModal(): void;
  close(): void;
  addEventListener(type: "keydown" | "close", listener: (event: ShortcutsEvent) => void): void;
}

/** The elements the island wires. */
export interface ShortcutsParts {
  readonly dialog: ShortcutsDialog;
  readonly close?: ShortcutsClose;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface ShortcutsEnv {
  readonly document: ShortcutsDocument;
}

/** Elements that take typed text, where `?` must stay an ordinary character. */
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether the key event happens in a field the reader is typing in. A shortcut never takes a key
 * from a field, so every input, textarea, select, and contenteditable element counts.
 */
export function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return TYPING_TAGS.has(tag) || element.isContentEditable === true;
}

/**
 * Whether `event` is the shortcuts shortcut: `?` with no command or alt modifier. The browser reports
 * Shift+/ as `?` on most layouts, so the key character is enough; Shift itself is not required.
 */
export function isShortcutsShortcut(event: ShortcutsEvent): boolean {
  return event.key === "?" && event.metaKey !== true && event.ctrlKey !== true && event.altKey !== true;
}

/**
 * Wires the dialog: `?` opens it and remembers the focused element, the close button and Escape close
 * it, and the `close` event puts focus back where it was. The dialog starts `hidden` in the page and
 * is revealed only here, so a visitor without JavaScript never sees it.
 */
export function activate(parts: ShortcutsParts, env: ShortcutsEnv): void {
  const { dialog, close } = parts;
  let opener: ShortcutsFocus | null = null;

  dialog.hidden = false;
  close?.addEventListener("click", () => dialog.close());

  env.document.addEventListener(
    "keydown",
    (event) => {
      if (!isShortcutsShortcut(event)) return;
      if (isTypingTarget(event.target)) return;
      if (dialog.open) return;
      event.preventDefault();
      event.stopPropagation?.();
      opener = env.document.activeElement;
      dialog.showModal();
    },
    { capture: true },
  );

  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation?.();
    dialog.close();
  });

  // Closing by any route (Escape or the close button) returns focus to the element that opened the
  // dialog. The browser would focus the dialog's first control otherwise.
  dialog.addEventListener("close", () => {
    const target = opener;
    opener = null;
    target?.focus();
  });
}

// The island runs in a browser; the theme's tsconfig has no DOM lib, so these are the globals it needs.
declare const document: ShortcutsDocument & { querySelector(selector: string): unknown };

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const dialog = document.querySelector("[data-shortcuts]");
  const close = document.querySelector("[data-shortcuts] [data-shortcuts-close]");
  if (dialog) {
    activate(
      {
        dialog: dialog as ShortcutsDialog,
        ...(close ? { close: close as ShortcutsClose } : {}),
      },
      { document },
    );
  }
}
