import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Class on the embed: the 16:9 box plus the fallback link under it. */
export const EMBED_CLASS = "embed";

/** Class on the 16:9 box that reserves the space and holds the placeholder and, after a click, the iframe. */
export const BOX_CLASS = "embed-box";

/** Class on the iframe. */
export const IFRAME_CLASS = "embed-iframe";

/** Class on the placeholder that names the embed before it loads; the island hides it. */
export const PLACEHOLDER_CLASS = "embed-placeholder";

/** Class on the title shown in the placeholder. */
export const TITLE_CLASS = "embed-title";

/** Class on the load button. It starts `hidden`; the island reveals it, then turns it into a retry. */
export const LOAD_CLASS = "embed-load";

/** Class on the live status line: "Loading embed…" then the failure and retry message. */
export const STATUS_CLASS = "embed-status";

/** Class on the link that opens the page without JavaScript and stays after the frame loads. */
export const LINK_CLASS = "embed-link";

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

/** The address a text link opens: an `https` URL, or `undefined` when the value is anything else. */
export function httpsHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
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

/** Providers whose name is worth spelling out; any other host shows as its hostname. */
const PROVIDERS: Readonly<Record<string, string>> = {
  "m.youtube.com": "YouTube",
  "player.vimeo.com": "Vimeo",
  "vimeo.com": "Vimeo",
  "www.vimeo.com": "Vimeo",
  "www.youtube-nocookie.com": "YouTube",
  "www.youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "youtube-nocookie.com": "YouTube",
  "youtube.com": "YouTube",
};

/** The provider's name for the fallback link: "YouTube", "Vimeo", or the hostname. */
export function providerOf(value: string): string {
  try {
    const host = new URL(value).hostname;
    return PROVIDERS[host] ?? host.replace(/^www\./, "");
  } catch {
    return "the provider";
  }
}

/**
 * `::embed{src=… title=…}` reserves a 16:9 box and renders a load button and a link to the page. The
 * island (`client.ts`) inserts the iframe only when the reader clicks the button, so the page requests
 * nothing from the provider before then and no consent is implied. The placeholder and a live status
 * line stay over the frame while it loads; an error or timeout brings them back with a retry button.
 * The link stays under the box after the frame loads, so a failed or blocked embed keeps a way through;
 * without JavaScript the link still opens the page in a new tab. Without a title the component renders
 * a message instead, because the frame would have no accessible name. An empty or unsafe `src` renders
 * nothing.
 */
export default function embed({ props }: ComponentProps<EmbedProps>) {
  const src = embedSrc(props.src);
  const href = httpsHref(props.src);
  if (src === undefined || href === undefined) return null;

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
    { class: EMBED_CLASS, "data-embed": src, "data-title": title, "data-embed-state": "idle" },
    h(
      "div",
      { class: BOX_CLASS, "data-embed-box": true },
      h(
        "div",
        { class: PLACEHOLDER_CLASS, "data-embed-placeholder": true },
        h("span", { class: TITLE_CLASS }, title),
        h("p", { class: STATUS_CLASS, "data-embed-status": true, role: "status" }),
        h(
          "button",
          {
            type: "button",
            class: LOAD_CLASS,
            hidden: true,
            "data-embed-load": true,
            "aria-label": `Load embed: ${title}`,
          },
          "Load embed",
        ),
      ),
    ),
    h(
      "a",
      { class: LINK_CLASS, href, target: "_blank", rel: "noopener noreferrer" },
      `Open on ${providerOf(href)}`,
    ),
  );
}
