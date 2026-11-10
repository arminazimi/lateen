/*
 * Page agent menu copy button: fetches the page's Markdown twin and writes it to the clipboard. The
 * button stays hidden unless the browser has both a clipboard and `fetch`, so a visitor without
 * JavaScript (or without the APIs) never sees a control that would do nothing. Nothing is requested
 * until the reader presses the button.
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

/** Fetches `url` and writes its text to the clipboard, announcing the outcome on the status region. */
export function copy(button: CopyButton, env: CopyEnv): Promise<void> {
  const clipboard = env.clipboard;
  const fetchText = env.fetchText;
  const url = button.dataset.markdown;
  if (clipboard === undefined || fetchText === undefined || url === undefined || url === "") return Promise.resolve();
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

/** Reveals the button and wires its click, unless the browser lacks the clipboard or `fetch`. */
export function activate(button: CopyButton, env: CopyEnv): void {
  if (env.clipboard === undefined || env.fetchText === undefined) return;
  if (button.dataset.markdown === undefined || button.dataset.markdown === "") return;
  button.hidden = false;
  button.addEventListener("click", () => {
    void copy(button, env);
  });
}

/** The browser environment: the page's clipboard, `fetch`, and the menu's status region. */
const globals = globalThis as unknown as {
  document?: { querySelector(selector: string): unknown };
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
  const button = globals.document.querySelector("[data-page-agent-copy]");
  const status = globals.document.querySelector("[data-page-agent-status]");
  if (button !== null && status !== null) {
    activate(button as CopyButton, {
      clipboard: globals.navigator?.clipboard,
      fetchText: browserFetch,
      status: status as CopyStatus,
    });
  }
}
