/* Embed: reveals the load button and inserts the iframe only when the reader clicks it. Until then the page makes no request to the provider, so an embed cannot block the content or imply consent. The placeholder stays over the frame while it loads; a failed or timed-out frame shows the provider link and a retry button instead of an empty box. The link under the frame works without JavaScript and remains after the frame loads. */

/** Selector for an embed (`data-embed` in `index.ts`). */
export const EMBED_SELECTOR = "[data-embed]";

/** Selector for the 16:9 box the iframe fills (`data-embed-box` in `index.ts`). */
export const BOX_SELECTOR = "[data-embed-box]";

/** Selector for the load button the box renders (`data-embed-load` in `index.ts`). */
export const LOAD_SELECTOR = "[data-embed-load]";

/** Selector for the placeholder the island hides once the frame loads (`data-embed-placeholder` in `index.ts`). */
export const PLACEHOLDER_SELECTOR = "[data-embed-placeholder]";

/** Selector for the status line the island updates (`data-embed-status` in `index.ts`). */
export const STATUS_SELECTOR = "[data-embed-status]";

/** Class on the iframe the island inserts; `style.css` fills the box with it. */
export const FRAME_CLASS = "embed-iframe";

/** How long a frame may take to load before the island offers a retry. */
export const TIMEOUT_MS = 15000;

/** What the status line says while the frame loads. */
export const LOADING_MESSAGE = "Loading embed…";

/** What the status line says when the frame fails or times out. */
export const FAILED_MESSAGE = "The embed did not load. Try again, or open it on the provider.";

/** The button's label after a failure; the same button retries. */
export const RETRY_LABEL = "Retry embed";

/** The lifecycle of one embed: nothing requested yet, waiting, loaded, or given up. */
export type EmbedState = "idle" | "loading" | "ready" | "failed";

/** The parts of an element the island reads and writes. Root, box, button, and status all fit. */
export interface EmbedElement {
  hidden: boolean;
  textContent: string | null;
  dataset: { embed?: string; title?: string; loaded?: string; state?: string };
  querySelector(selector: string): EmbedElement | null;
  appendChild(child: EmbedFrame): void;
  removeChild(child: EmbedFrame): void;
  addEventListener(type: "click", listener: () => void): void;
  setAttribute(name: string, value: string): void;
}

/** The iframe the island inserts. The browser supplies a real one; tests pass a fake. */
export interface EmbedFrame {
  className: string;
  src: string;
  title: string;
  loading: string;
  referrerPolicy: string;
  allow: string;
  allowFullscreen: boolean;
  addEventListener(type: "load" | "error", listener: () => void): void;
  focus?(): void;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface EmbedEnv {
  createFrame(): EmbedFrame;
  schedule(callback: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
}

/** The part of the document the island uses. */
export interface EmbedDocument {
  querySelectorAll(selector: string): Iterable<EmbedElement>;
  createElement(tag: string): EmbedFrame;
}

/** One activation attempt. A new attempt gets a new token, so its events cannot finish an older one. */
type Attempt = {
  token: number;
  state: EmbedState;
  frame: EmbedFrame | undefined;
  timer: unknown;
  env: EmbedEnv | undefined;
};

const attempts = new WeakMap<EmbedElement, Attempt>();

/** The current attempt for a root, or a fresh idle one. */
function attemptOf(root: EmbedElement): Attempt {
  let attempt = attempts.get(root);
  if (attempt === undefined) {
    attempt = { token: 0, state: "idle", frame: undefined, timer: undefined, env: undefined };
    attempts.set(root, attempt);
  }
  return attempt;
}

function setState(root: EmbedElement, attempt: Attempt, state: EmbedState): void {
  attempt.state = state;
  root.dataset.state = state;
}

/** The status line inside the box, if the component rendered one. */
function statusOf(box: EmbedElement, root: EmbedElement): EmbedElement | null {
  return box.querySelector(STATUS_SELECTOR) ?? root.querySelector(STATUS_SELECTOR);
}

/** Shows the placeholder again with a retry control after a frame fails or times out. */
function fail(root: EmbedElement, attempt: Attempt): void {
  if (attempt.timer !== undefined) cancelTimer(attempt);
  const box = root.querySelector(BOX_SELECTOR) ?? root;
  const frame = attempt.frame;
  attempt.frame = undefined;
  if (frame !== undefined) box.removeChild(frame);

  setState(root, attempt, "failed");
  delete root.dataset.loaded;

  const placeholder = box.querySelector(PLACEHOLDER_SELECTOR) ?? root.querySelector(PLACEHOLDER_SELECTOR);
  if (placeholder !== null) placeholder.hidden = false;

  const status = statusOf(box, root);
  if (status !== null) status.textContent = FAILED_MESSAGE;

  const button = root.querySelector(LOAD_SELECTOR) ?? box.querySelector(LOAD_SELECTOR);
  if (button !== null) {
    button.textContent = RETRY_LABEL;
    button.setAttribute("aria-label", `${RETRY_LABEL}: ${root.dataset.title?.trim() ?? ""}`);
    button.hidden = false;
  }
}

/** The frame finished loading in this attempt: hide the placeholder and the status line. */
function ready(root: EmbedElement, attempt: Attempt): void {
  if (attempt.timer !== undefined) {
    cancelTimer(attempt);
  }
  setState(root, attempt, "ready");
  root.dataset.loaded = "true";

  const box = root.querySelector(BOX_SELECTOR) ?? root;
  const placeholder = box.querySelector(PLACEHOLDER_SELECTOR) ?? root.querySelector(PLACEHOLDER_SELECTOR);
  if (placeholder !== null) placeholder.hidden = true;

  const status = statusOf(box, root);
  if (status !== null) status.textContent = "";
}

/** Cancels the attempt's pending timeout, if it still has one. */
function cancelTimer(attempt: Attempt): void {
  if (attempt.timer === undefined) return;
  attempt.env?.cancel(attempt.timer);
  attempt.timer = undefined;
}

/**
 * Starts one attempt: only `https` addresses are loaded, and an attempt already loading or loaded does
 * nothing, so a double click or a repeated retry cannot create a second frame. The placeholder and its
 * "loading" status stay over the frame until it loads; an error or {@link TIMEOUT_MS} offers a retry.
 */
function start(root: EmbedElement, button: EmbedElement | null, env: EmbedEnv): void {
  const attempt = attemptOf(root);
  if (attempt.state === "loading" || attempt.state === "ready") return;

  const embed = root.dataset.embed?.trim() ?? "";
  if (!embed.startsWith("https://")) return;

  if (attempt.timer !== undefined) cancelTimer(attempt);
  attempt.env = env;

  const box = root.querySelector(BOX_SELECTOR) ?? root;
  const token = attempt.token + 1;
  attempt.token = token;
  setState(root, attempt, "loading");
  delete root.dataset.loaded;

  const placeholder = box.querySelector(PLACEHOLDER_SELECTOR) ?? root.querySelector(PLACEHOLDER_SELECTOR);
  if (placeholder !== null) placeholder.hidden = false;

  const status = statusOf(box, root);
  if (status !== null) status.textContent = LOADING_MESSAGE;

  if (button !== null) {
    button.textContent = "Load embed";
    button.setAttribute("aria-label", `Load embed: ${root.dataset.title?.trim() ?? ""}`);
    button.hidden = true;
  }

  const frame = env.createFrame();
  attempt.frame = frame;
  frame.className = FRAME_CLASS;
  frame.src = embed;
  frame.title = root.dataset.title?.trim() ?? "";
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;

  frame.addEventListener("load", () => {
    if (attempt.token !== token || attempt.state !== "loading") return;
    ready(root, attempt);
  });
  frame.addEventListener("error", () => {
    if (attempt.token !== token || attempt.state !== "loading") return;
    fail(root, attempt);
  });

  // Scheduled before the frame is inserted so a frame that loads synchronously still clears its timer.
  attempt.timer = env.schedule(() => {
    if (attempt.token !== token || attempt.state !== "loading") return;
    fail(root, attempt);
  }, TIMEOUT_MS);

  box.appendChild(frame);
  frame.focus?.();
}

/** Loads the embed's frame: the exported entry tests and other islands use. */
export function load(root: EmbedElement, env: EmbedEnv): void {
  const box = root.querySelector(BOX_SELECTOR) ?? root;
  start(root, root.querySelector(LOAD_SELECTOR) ?? box.querySelector(LOAD_SELECTOR), env);
}

/** Reveals the load button and wires its click to {@link load}. */
export function activate(root: EmbedElement, button: EmbedElement, env: EmbedEnv): void {
  button.hidden = false;
  button.addEventListener("click", () => {
    start(root, button, env);
  });
}

/** Reveals every embed's load button on the page. */
export function activateAll(doc: EmbedDocument, env: EmbedEnv): void {
  for (const root of doc.querySelectorAll(EMBED_SELECTOR)) {
    const button = root.querySelector(LOAD_SELECTOR);
    if (button !== null) activate(root, button, env);
  }
}

/** The browser environment: the page's document, which makes the iframe, and its timers. */
const globals = globalThis as unknown as {
  document?: EmbedDocument;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};
const doc = globals.document;

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (doc !== undefined) {
  activateAll(doc, {
    createFrame: () => doc.createElement("iframe"),
    schedule: (callback, ms) => globals.setTimeout(callback, ms),
    cancel: (handle) => globals.clearTimeout(handle),
  });
}
