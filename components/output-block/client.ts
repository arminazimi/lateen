/* Output block island: the copy button copies the output text, never the command above it, and reports
 * the result in a live status region; the button stays hidden unless the browser has a clipboard. The
 * scroll region keeps a wide result keyboard-scrollable and takes its extra tab stop out when the
 * output fits, refreshing on container and content resize. The server markup is always focusable, so
 * the page still works without this script. */

/** Selector for the copy button the frame renders (`data-output-copy` in `index.ts`). */
export const BUTTON_SELECTOR = "[data-output-copy]";

/** Selector for the live status region the frame renders (`data-output-status` in `index.ts`). */
export const STATUS_SELECTOR = "[data-output-status]";

/** How long the status keeps the result before it is cleared. */
export const RESET_MS = 2000;

/** The parts of the button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  dataset: { output?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
}

/** The part of the parent the island reads to find the status region. */
export interface CopyParent {
  querySelector(selector: string): CopyStatus | null;
}

/** The live region the island writes the result to. */
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
  schedule(callback: () => void, ms: number): unknown;
}

/** Shows `message` in the status for `RESET_MS`, then clears it. */
function say(status: CopyStatus, message: string, env: CopyEnv): void {
  status.textContent = message;
  env.schedule(() => {
    status.textContent = "";
  }, RESET_MS);
}

/** Writes the block's output to the clipboard and reports the result in the status region. */
export function copy(button: CopyButton, status: CopyStatus, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  return clipboard.writeText(button.dataset.output ?? "").then(
    () => say(status, button.dataset.copied ?? "", env),
    () => say(status, button.dataset.copyFailed ?? "", env),
  );
}

/** Reveals the button and wires its click, unless there is no clipboard for it to use. */
export function activate(button: CopyButton, status: CopyStatus, env: CopyEnv): void {
  if (env.clipboard === undefined) return;
  button.hidden = false;
  button.addEventListener("click", () => {
    void copy(button, status, env);
  });
}

/** The part of the document the island uses. */
export interface CopyDocument {
  querySelectorAll(selector: string): Iterable<CopyButton & { readonly parentElement: CopyParent | null }>;
}

/** Wires every output block on the page to the status region beside its button. */
export function activateAll(doc: CopyDocument, env: CopyEnv): void {
  for (const button of doc.querySelectorAll(BUTTON_SELECTOR)) {
    const status = button.parentElement?.querySelector(STATUS_SELECTOR) ?? null;
    if (status !== null) activate(button, status, env);
  }
}

/** Selector for the output body whose overflow is measured. It matches `SCROLL_ATTRIBUTE` in
 * `index.ts`; this module does not import that file because the island build cannot resolve its
 * `preact` import. */
export const SCROLL_SELECTOR = "[data-output-scroll]";

/** A difference of at most this many CSS pixels is rounding, not overflow. */
export const OVERFLOW_TOLERANCE = 1;

/** The parts of the output body the scroll island reads and writes. */
export interface ScrollBody {
  scrollWidth: number;
  clientWidth: number;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): ScrollBody | null;
}

/** Everything the scroll island reads from the page, so tests can pass fakes instead of the browser. */
export interface ScrollEnv {
  /** All output bodies on the page. */
  bodies(): Iterable<ScrollBody>;
  /** Calls `update` when `target` or its contents change size. */
  watch(target: ScrollBody, update: () => void): void;
}

/** True when the output is wider than the body, ignoring a subpixel rounding difference. */
export function isOverflowing(body: ScrollBody): boolean {
  return body.scrollWidth - body.clientWidth > OVERFLOW_TOLERANCE;
}

/**
 * Applies the body's current overflow state: a body that fits loses its extra tab stop, and an
 * overflowing one gets it back so it scrolls from the keyboard. The named group around the body is
 * left alone, so the output keeps its accessible group name either way. Returns whether it overflows.
 */
export function sync(body: ScrollBody): boolean {
  if (!isOverflowing(body)) {
    body.removeAttribute("tabindex");
    return false;
  }

  body.setAttribute("tabindex", "0");
  return true;
}

/**
 * Syncs every output body on the page and re-syncs it on resize. The body and the `code` inside it are
 * both watched: the first changes with its container, the second with zoom, a font, or new content
 * that reflows the text.
 */
export function enhance(env: ScrollEnv): void {
  for (const body of env.bodies()) {
    sync(body);
    env.watch(body, () => {
      sync(body);
    });
    const code = body.querySelector("code");
    if (code !== null) {
      env.watch(code, () => {
        sync(body);
      });
    }
  }
}

/** A `ResizeObserver` constructor, as the browser supplies one. */
type ResizeObserverConstructor = new (callback: () => void) => { observe(target: ScrollBody): void };

/** The browser's window, only for the `resize` fallback when `ResizeObserver` is missing. */
const win = globalThis as unknown as { addEventListener?(type: "resize", listener: () => void): void };

/** The window resize event still catches a viewport change in browsers without `ResizeObserver`. */
function watcher(Observer: ResizeObserverConstructor | undefined): ScrollEnv["watch"] {
  return (target, update) => {
    if (Observer === undefined) {
      win.addEventListener?.("resize", update);
      return;
    }
    new Observer(update).observe(target);
  };
}

/** The browser environment: the page's document, clipboard, resize observer, and timer. */
const globals = globalThis as unknown as {
  document?: CopyDocument;
  navigator?: { clipboard?: Clipboard };
  ResizeObserver?: ResizeObserverConstructor;
  setTimeout(callback: () => void, ms: number): unknown;
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
const doc = globals.document;
if (doc !== undefined) {
  activateAll(doc, {
    clipboard: globals.navigator?.clipboard,
    schedule: (callback, ms) => globals.setTimeout(callback, ms),
  });
  enhance({
    bodies: () => doc.querySelectorAll(SCROLL_SELECTOR) as Iterable<ScrollBody>,
    watch: watcher(globals.ResizeObserver),
  });
}
