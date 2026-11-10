import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Class on the frame that holds the iframe. It keeps the fixed 16:9 aspect ratio (`style.css`). */
export const EMBED_CLASS = "embed";

/** Class on the iframe. */
export const IFRAME_CLASS = "embed-iframe";

/** Class on the message shown in place of an embed that has no title. */
export const DIAGNOSTIC_CLASS = "embed-diagnostic";

/** The privacy-friendly YouTube host: no cookies are set until the video plays. */
export const YOUTUBE_HOST = "www.youtube-nocookie.com";

/** Props from the directive: `::embed{src=… title=…}`. Every value is a string. */
export type EmbedProps = {
  /** The page to embed: an `https` address. YouTube watch, short, and share links become the privacy host. */
  src?: string;
  /** Accessible name of the embedded frame. Required: without it the embed renders a diagnostic instead. */
  title?: string;
};

/** Hosts that serve YouTube videos. */
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"]);

/** Path prefixes that put a video ID right after them, as in `/embed/ID` or `/shorts/ID`. */
const YOUTUBE_PATHS = new Set(["embed", "shorts", "live", "v"]);

/** A YouTube video ID: eleven letters, digits, `-` or `_`. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video ID of a YouTube address, or `undefined` when the address names no video. */
export function youtubeId(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter((part) => part !== "");
  let id: string | undefined;
  if (url.hostname === "youtu.be") id = parts[0];
  else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
  else if (parts[0] !== undefined && YOUTUBE_PATHS.has(parts[0])) id = parts[1];
  return id !== undefined && YOUTUBE_ID.test(id) ? id : undefined;
}

/**
 * The address the iframe loads, or `undefined` when `src` is not an `https` address of a page that can
 * be embedded. A YouTube address must name a video; any other `https` address is used as written.
 */
export function embedSrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return url.href;
  const id = youtubeId(url);
  return id === undefined ? undefined : `https://${YOUTUBE_HOST}/embed/${id}`;
}

/**
 * `::embed{src=… title=…}` renders a 16:9 frame with the page in it. The iframe loads lazily and sends no
 * referrer beyond the origin. Without a title it renders a message instead, because the frame would have
 * no accessible name. An empty or unsafe `src` renders nothing.
 */
export default function embed({ props }: ComponentProps<EmbedProps>) {
  const src = embedSrc(props.src);
  if (src === undefined) return null;

  const title = typeof props.title === "string" ? props.title.trim() : "";
  if (title === "") {
    return h(
      "p",
      { class: DIAGNOSTIC_CLASS },
      'Embed is missing a title. Add title="…" to the ::embed directive so screen readers can name the frame.',
    );
  }

  return h(
    "div",
    { class: EMBED_CLASS },
    h("iframe", {
      class: IFRAME_CLASS,
      src,
      title,
      loading: "lazy",
      referrerpolicy: "strict-origin-when-cross-origin",
      allow: "encrypted-media; picture-in-picture; fullscreen",
      allowfullscreen: true,
    }),
  );
}
