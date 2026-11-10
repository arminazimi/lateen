/* Code block copy button: copies a block's code without diff markers or shell prompts, and confirms with a check icon and a live message. The button is made here, so a visitor without JavaScript gets no control that would do nothing. */

/** Class on the copy button. */
export const BUTTON_CLASS = "code-copy";

/** Class on the wrapper that holds the button and the live message, placed above the block. */
export const BAR_CLASS = "code-copy-bar";

/** Class on the live region that announces the result. */
export const STATUS_CLASS = "code-copy-status";

/** Class on the code block the island works on (`CODE_CLASS` in `index.ts`). */
export const BLOCK_SELECTOR = "pre.code";

/** How long the result stays on the button before it goes back to the copy icon. */
export const RESET_MS = 2000;

const LABEL = "Copy code";
const COPIED = "Copied.";
const FAILED = "Copy failed. Select the code and copy it by hand.";

const SVG_NS = "http://www.w3.org/2000/svg";
const COPY_PATH =
  "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Zm5-5C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z";
const CHECK_PATH =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

/** Languages whose lines may start with a shell prompt (`$ ` or `% `). */
const SHELL = new Set(["bash", "console", "shell", "shellsession", "sh", "terminal", "zsh"]);

/** Languages whose lines may start with a Python prompt (`>>> ` or `... `). */
const PYTHON = new Set(["py", "pycon", "python", "python3"]);

/** A node the island builds or writes to. */
export interface CopyNode {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  append(...children: Array<CopyNode | string>): void;
  addEventListener(type: "click", listener: () => void): void;
  textContent: string | null;
}

/** A code block as the island reads it. */
export interface CopyBlock {
  getAttribute(name: string): string | null;
  querySelector(selector: string): { textContent: string | null } | null;
  before(node: CopyNode): void;
}

/** The part of the document the island uses. */
export interface CopyDocument {
  createElement(tag: string): CopyNode;
  createElementNS(namespace: string, tag: string): CopyNode;
  querySelectorAll(selector: string): Iterable<CopyBlock>;
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

/** The elements of one block's copy control. */
export interface CopyUi {
  button: CopyNode;
  copyIcon: CopyNode;
  checkIcon: CopyNode;
  status: CopyNode;
}

/**
 * The text a copy takes from a block: its code with the markers and prompts of its language removed.
 * In a `diff` block, removed lines (`-`) and file and hunk headers are dropped, and the `+` or space marker
 * is taken off the rest. In a shell block the `$ ` and `% ` prompts are taken off; in a Python block the
 * `>>> ` and `... ` prompts. Every other language is copied as written.
 */
export function copyText(text: string, lang: string | undefined): string {
  const kind = (lang ?? "").trim().toLowerCase();
  const lines = text.split("\n");
  if (kind === "diff" || kind === "patch") return fromDiff(lines).join("\n");
  if (SHELL.has(kind)) return lines.map((line) => line.replace(/^(\s*)[$%] /, "$1")).join("\n");
  if (PYTHON.has(kind)) return lines.map((line) => line.replace(/^(\s*)(>>>|\.\.\.) /, "$1")).join("\n");
  return text;
}

/** The lines of a diff that are still code: no headers, no removed lines, no `+` or space markers. */
function fromDiff(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (/^(diff |index |--- |\+\+\+ |@@ )/.test(line)) continue;
    if (line.startsWith("-")) continue;
    out.push(/^[+ ]/.test(line) ? line.slice(1) : line);
  }
  return out;
}

/** An SVG icon: one path in `currentColor`, hidden from assistive tech. */
function icon(env: CopyDocument, d: string): CopyNode {
  const svg = env.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = env.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/**
 * Shows the result on the control, then after `RESET_MS` puts the copy icon back and clears the message.
 * The reset is skipped when a later click has started since, so the newest result stays on screen.
 */
function report(ui: CopyUi, ok: boolean, env: CopyEnv, isLatest: () => boolean): void {
  ui.status.textContent = ok ? COPIED : FAILED;
  if (ok) {
    ui.copyIcon.setAttribute("hidden", "");
    ui.checkIcon.removeAttribute("hidden");
  }
  env.schedule(() => {
    if (!isLatest()) return;
    ui.status.textContent = "";
    ui.checkIcon.setAttribute("hidden", "");
    ui.copyIcon.removeAttribute("hidden");
  }, RESET_MS);
}

/** Writes `text` to the clipboard and reports the result on the control. Without a clipboard, that is a failure. */
export function copy(text: string, ui: CopyUi, env: CopyEnv, isLatest: () => boolean): Promise<void> {
  const clipboard = env.clipboard;
  const write =
    clipboard === undefined
      ? Promise.reject(new Error("no clipboard"))
      : Promise.resolve().then(() => clipboard.writeText(text));
  return write.then(
    () => report(ui, true, env, isLatest),
    () => report(ui, false, env, isLatest),
  );
}

/** Adds a copy button above each code block and wires it. Nothing is added to a page the island does not run on. */
export function activate(doc: CopyDocument, env: CopyEnv): void {
  for (const block of doc.querySelectorAll(BLOCK_SELECTOR)) {
    attach(doc, block, env);
  }
}

/** One block's control: a bar above the block with the button and the live message. */
function attach(doc: CopyDocument, block: CopyBlock, env: CopyEnv): void {
  const code = block.querySelector("code");
  if (code === null) return;

  const bar = doc.createElement("div");
  bar.setAttribute("class", BAR_CLASS);

  const status = doc.createElement("span");
  status.setAttribute("class", STATUS_CLASS);
  status.setAttribute("role", "status");
  status.textContent = "";

  const button = doc.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("class", BUTTON_CLASS);
  button.setAttribute("aria-label", LABEL);

  const copyIcon = icon(doc, COPY_PATH);
  const checkIcon = icon(doc, CHECK_PATH);
  checkIcon.setAttribute("hidden", "");
  button.append(copyIcon, checkIcon);

  bar.append(button, status);
  block.before(bar);

  const ui: CopyUi = { button, copyIcon, checkIcon, status };
  let clicks = 0;
  button.addEventListener("click", () => {
    const click = ++clicks;
    const text = copyText(code.textContent ?? "", block.getAttribute("data-lang") ?? undefined);
    void copy(text, ui, env, () => click === clicks);
  });
}

/** The browser environment: the page's document, clipboard, and timer. */
const globals = globalThis as unknown as {
  document?: CopyDocument;
  navigator?: { clipboard?: Clipboard };
  setTimeout(callback: () => void, ms: number): unknown;
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document) {
  activate(globals.document, {
    clipboard: globals.navigator?.clipboard,
    schedule: (callback, ms) => globals.setTimeout(callback, ms),
  });
}
