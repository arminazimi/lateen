/* Terminal copy button: copies the commands of a terminal block, never its output. The button stays hidden unless the browser has a clipboard to write to. */

/** The parts of the button the island reads and writes. */
export interface CopyButton {
  hidden: boolean;
  textContent: string | null;
  dataset: { commands?: string; copied?: string; copyFailed?: string };
  addEventListener(type: "click", listener: () => void): void;
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

/** Writes the button's commands to the clipboard and reports the result on the button. */
export function copy(button: CopyButton, label: string, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  return clipboard.writeText(button.dataset.commands ?? "").then(
    () => say(button, button.dataset.copied ?? label, label, env),
    () => say(button, button.dataset.copyFailed ?? label, label, env),
  );
}

/** Reveals the button and wires its click, unless there is no clipboard for it to use. */
export function activate(button: CopyButton, env: CopyEnv): void {
  if (env.clipboard === undefined) return;
  const label = button.textContent ?? "";
  button.hidden = false;
  button.addEventListener("click", () => {
    void copy(button, label, env);
  });
}

/** The browser environment: the page's clipboard and its timer. */
const globals = globalThis as unknown as {
  document?: { querySelectorAll(selector: string): Iterable<unknown> };
  navigator?: { clipboard?: Clipboard };
  setTimeout(callback: () => void, ms: number): unknown;
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document) {
  const env: CopyEnv = {
    clipboard: globals.navigator?.clipboard,
    schedule: (callback, ms) => globals.setTimeout(callback, ms),
  };
  for (const button of globals.document.querySelectorAll("[data-terminal-copy]")) {
    activate(button as CopyButton, env);
  }
}
