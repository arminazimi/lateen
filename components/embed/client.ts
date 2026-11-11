/* Embed: reveals the load button and inserts the iframe only when the reader clicks it. Until then the page makes no request to the provider, so an embed cannot block the content or imply consent. The link under the frame works without JavaScript and remains after the frame loads, so a failed or blocked embed still has a way through. */

/** Selector for an embed (`data-embed` in `index.ts`). */
export const EMBED_SELECTOR = "[data-embed]";

/** Selector for the 16:9 box the iframe fills (`data-embed-box` in `index.ts`). */
export const BOX_SELECTOR = "[data-embed-box]";

/** Selector for the load button the box renders (`data-embed-load` in `index.ts`). */
export const LOAD_SELECTOR = "[data-embed-load]";

/** Selector for the placeholder the island hides once the frame loads (`data-embed-placeholder` in `index.ts`). */
export const PLACEHOLDER_SELECTOR = "[data-embed-placeholder]";

/** Class on the iframe the island inserts; `style.css` fills the box with it. */
export const FRAME_CLASS = "embed-iframe";

/** The parts of an element the island reads and writes. Root, box, and button all fit. */
export interface EmbedElement {
  hidden: boolean;
  dataset: { embed?: string; title?: string; loaded?: string };
  querySelector(selector: string): EmbedElement | null;
  appendChild(child: EmbedFrame): void;
  addEventListener(type: "click", listener: () => void): void;
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
  focus?(): void;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface EmbedEnv {
  createFrame(): EmbedFrame;
}

/** The part of the document the island uses. */
export interface EmbedDocument {
  querySelectorAll(selector: string): Iterable<EmbedElement>;
  createElement(tag: string): EmbedFrame;
}

/**
 * Inserts the provider's iframe into the box: only `https` addresses are loaded, and a second call does
 * nothing, so a double click cannot load the embed twice. The placeholder (title and load button) is
 * hidden; the fallback link under the box stays visible.
 */
export function load(root: EmbedElement, env: EmbedEnv): void {
  if (root.dataset.loaded === "true") return;
  const embed = root.dataset.embed?.trim() ?? "";
  if (!embed.startsWith("https://")) return;

  const box = root.querySelector(BOX_SELECTOR) ?? root;
  const frame = env.createFrame();
  frame.className = FRAME_CLASS;
  frame.src = embed;
  frame.title = root.dataset.title?.trim() ?? "";
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  box.appendChild(frame);
  frame.focus?.();
  root.dataset.loaded = "true";

  const placeholder = box.querySelector(PLACEHOLDER_SELECTOR) ?? root.querySelector(PLACEHOLDER_SELECTOR);
  if (placeholder !== null) placeholder.hidden = true;
}

/** Reveals the load button and wires its click to {@link load}. */
export function activate(root: EmbedElement, button: EmbedElement, env: EmbedEnv): void {
  button.hidden = false;
  button.addEventListener("click", () => {
    load(root, env);
  });
}

/** Reveals every embed's load button on the page. */
export function activateAll(doc: EmbedDocument, env: EmbedEnv): void {
  for (const root of doc.querySelectorAll(EMBED_SELECTOR)) {
    const button = root.querySelector(LOAD_SELECTOR);
    if (button !== null) activate(root, button, env);
  }
}

/** The browser environment: the page's document, which makes the iframe. */
const globals = globalThis as unknown as { document?: EmbedDocument };
const doc = globals.document;

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (doc !== undefined) {
  activateAll(doc, { createFrame: () => doc.createElement("iframe") });
}
