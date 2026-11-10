/* Video: reveals the play button and swaps the poster for the provider's player on click. Until then the page makes no request to the provider. Without JavaScript the visible link still opens the video in a new tab. */

/** Selector for the frame that holds one video (`data-video` in `index.ts`). */
export const VIDEO_SELECTOR = "[data-video]";

/** Selector for the play button the poster renders (`data-video-play` in `index.ts`). */
export const PLAY_SELECTOR = "[data-video-play]";

/** Selector for the poster the island hides once the player loads (`data-video-poster` in `index.ts`). */
export const POSTER_SELECTOR = "[data-video-poster]";

/** Class on the iframe the island inserts; `style.css` fills the frame with it. */
export const FRAME_CLASS = "video-frame";

/** The parts of an element the island reads and writes. Root, button, and poster all fit. */
export interface VideoElement {
  hidden: boolean;
  dataset: { embed?: string; title?: string; loaded?: string };
  querySelector(selector: string): VideoElement | null;
  appendChild(child: VideoFrame): void;
  addEventListener(type: "click", listener: () => void): void;
}

/** The iframe the island inserts. The browser supplies a real one; tests pass a fake. */
export interface VideoFrame {
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
export interface VideoEnv {
  createFrame(): VideoFrame;
}

/** The part of the document the island uses. */
export interface VideoDocument {
  querySelectorAll(selector: string): Iterable<VideoElement>;
  createElement(tag: string): VideoFrame;
}

/**
 * Replaces the poster with the provider's player: inserts an iframe that fills the frame and hides the
 * poster. Only `https` addresses are loaded, and a second call does nothing, so a double click cannot load
 * the player twice.
 */
export function play(root: VideoElement, env: VideoEnv): void {
  if (root.dataset.loaded === "true") return;
  const embed = root.dataset.embed?.trim() ?? "";
  if (!embed.startsWith("https://")) return;

  const frame = env.createFrame();
  frame.className = FRAME_CLASS;
  frame.src = embed;
  frame.title = root.dataset.title?.trim() ?? "";
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  root.appendChild(frame);
  frame.focus?.();
  root.dataset.loaded = "true";

  const poster = root.querySelector(POSTER_SELECTOR);
  if (poster !== null) poster.hidden = true;
}

/** Reveals the play button and wires its click to {@link play}. */
export function activate(root: VideoElement, button: VideoElement, env: VideoEnv): void {
  button.hidden = false;
  button.addEventListener("click", () => {
    play(root, env);
  });
}

/** Reveals every video's play button on the page. */
export function activateAll(doc: VideoDocument, env: VideoEnv): void {
  for (const root of doc.querySelectorAll(VIDEO_SELECTOR)) {
    const button = root.querySelector(PLAY_SELECTOR);
    if (button !== null) activate(root, button, env);
  }
}

/** The browser environment: the page's document, which makes the iframe. */
const globals = globalThis as unknown as { document?: VideoDocument };
const doc = globals.document;

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (doc !== undefined) {
  activateAll(doc, { createFrame: () => doc.createElement("iframe") });
}
