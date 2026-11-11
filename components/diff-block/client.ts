/* Diff block copy buttons: one copies the authored patch, one the resulting source. Each action owns its label and its live status, and a result that arrives after a newer action on the same button is dropped, so an older clipboard write can never overwrite the newer status. The buttons stay hidden unless the browser has a clipboard to write to. */

/** Selector for either copy button the frame renders (`data-diff-copy` or `data-patch-copy` in `index.ts`). */
export const BUTTON_SELECTOR = "[data-diff-copy], [data-patch-copy]";

/** Selector for the live status region that belongs to one action. */
export const STATUS_SELECTOR = "[data-diff-status]";

/** The parts of the button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  textContent: string | null;
  dataset: { diff?: string; patch?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
}

/** The live region of one action. */
export interface CopyStatus {
  textContent: string | null;
}

/** The part of the action's wrapper the island reads to find its status. */
export interface CopyParent {
  querySelector(selector: string): CopyStatus | null;
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

/** How long an action shows its result before it goes back to its label. */
export const RESET_MS = 2000;

/** The newest operation on each button; a result that is not the newest leaves the status alone. */
const newest = new WeakMap<CopyButton, number>();

/** Shows `text` on the button and in its status for `RESET_MS`, if no newer copy has taken over. */
function say(
  button: CopyButton,
  status: CopyStatus | undefined,
  text: string,
  label: string,
  token: number,
  env: CopyEnv,
): void {
  if (newest.get(button) !== token) return;
  button.textContent = text;
  if (status !== undefined) status.textContent = text;
  env.schedule(() => {
    if (newest.get(button) !== token) return;
    button.textContent = label;
    if (status !== undefined) status.textContent = "";
  }, RESET_MS);
}

/** Writes this button's text to the clipboard and reports the result on its own status. */
export function copy(
  button: CopyButton,
  label: string,
  env: CopyEnv,
  status?: CopyStatus,
): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  const token = (newest.get(button) ?? 0) + 1;
  newest.set(button, token);
  return clipboard.writeText(button.dataset.diff ?? button.dataset.patch ?? "").then(
    () => say(button, status, button.dataset.copied ?? label, label, token, env),
    () => say(button, status, button.dataset.copyFailed ?? label, label, token, env),
  );
}

/** Reveals the button and wires its click, unless there is no clipboard for it to use. */
export function activate(button: CopyButton, env: CopyEnv, status?: CopyStatus): void {
  if (env.clipboard === undefined) return;
  const label = button.textContent ?? "";
  button.hidden = false;
  button.addEventListener("click", () => {
    void copy(button, label, env, status);
  });
}

/** The part of the document the island uses. */
export interface CopyDocument {
  querySelectorAll(selector: string): Iterable<CopyButton & { readonly parentElement: CopyParent | null }>;
}

/** Wires every copy action on the page to the status region inside its own wrapper. */
export function activateAll(doc: CopyDocument, env: CopyEnv): void {
  for (const button of doc.querySelectorAll(BUTTON_SELECTOR)) {
    activate(button, env, button.parentElement?.querySelector(STATUS_SELECTOR) ?? undefined);
  }
}

/** The browser environment: the page's document, its clipboard, and its timer. */
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
