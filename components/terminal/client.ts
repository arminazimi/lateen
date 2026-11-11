/* Terminal copy button: copies the commands of a terminal block, never its output. The button stays hidden unless the browser has a clipboard to write to, and the commands are read from the page when it is clicked, so a value the variables form changed is the one copied. */

/** Selector for the button the frame renders (`data-terminal-copy` in `index.ts`). */
export const BUTTON_SELECTOR = "[data-terminal-copy]";

/** Selector for the command text inside a session, one line each. */
export const COMMAND_SELECTOR = ".terminal-command .terminal-text";

/** The parts of the button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  textContent: string | null;
  dataset: { commands?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
}

/** The part of the frame the island reads at click time. */
export interface TerminalFrame {
  querySelectorAll(selector: string): Iterable<{ readonly textContent: string | null }>;
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

/** How long the button shows the result before it goes back to its label. */
export const RESET_MS = 2000;

/** Shows `text` on the button for `RESET_MS`, then restores `label`. */
function say(button: CopyButton, text: string, label: string, env: CopyEnv): void {
  button.textContent = text;
  env.schedule(() => {
    button.textContent = label;
  }, RESET_MS);
}

/** The commands the session currently shows, one per line: what the copy button takes. */
export function commandsOf(frame: TerminalFrame): string {
  return [...frame.querySelectorAll(COMMAND_SELECTOR)]
    .map((line) => line.textContent ?? "")
    .join("\n");
}

/** Writes the button's commands to the clipboard and reports the result on the button. */
export function copy(button: CopyButton, label: string, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  return clipboard.writeText(button.dataset.commands ?? "").then(
    () => say(button, button.dataset.copied ?? label, label, env),
    () => say(button, button.dataset.copyFailed ?? label, label, env),
  );
}

/**
 * Reveals the button and wires its click, unless there is no clipboard for it to use. With a frame, the
 * button takes the commands the page currently shows, so a changed value is copied as it is displayed.
 */
export function activate(button: CopyButton, env: CopyEnv, frame?: TerminalFrame): void {
  if (env.clipboard === undefined) return;
  const label = button.textContent ?? "";
  button.hidden = false;
  button.addEventListener("click", () => {
    if (frame !== undefined) button.dataset.commands = commandsOf(frame);
    void copy(button, label, env);
  });
}

/** The part of the document the island uses: each button inside its terminal frame. */
export interface CopyDocument {
  querySelectorAll(
    selector: string,
  ): Iterable<CopyButton & { readonly parentElement: { readonly parentElement: TerminalFrame | null } | null }>;
}

/** Wires every terminal copy button on the page to the session it belongs to. */
export function activateAll(doc: CopyDocument, env: CopyEnv): void {
  for (const button of doc.querySelectorAll(BUTTON_SELECTOR)) {
    activate(button, env, button.parentElement?.parentElement ?? undefined);
  }
}

/** The browser environment: the page's clipboard and its timer. */
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
