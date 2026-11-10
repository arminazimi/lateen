/* Output block copy button: copies the output text, never the command above it, and reports the result in a live status region. The button stays hidden unless the browser has a clipboard to write to. */

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

/** The browser environment: the page's document, clipboard, and timer. */
const globals = globalThis as unknown as {
  document?: CopyDocument;
  navigator?: { clipboard?: Clipboard };
  setTimeout(callback: () => void, ms: number): unknown;
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document) {
  activateAll(globals.document, {
    clipboard: globals.navigator?.clipboard,
    schedule: (callback, ms) => globals.setTimeout(callback, ms),
  });
}
