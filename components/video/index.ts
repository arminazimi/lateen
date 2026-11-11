import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { embedSrc, httpsHref, providerOf, youtubeId } from "../embed/index.ts";

/** The Markdown directive this component handles: `::video`. */
export const directive = "video";

/** Class on the component: the 16:9 box plus the provider link under it. */
export const VIDEO_CLASS = "video";

/** Class on the 16:9 box that holds the poster and, after a click, the player. */
export const BOX_CLASS = "video-box";

/** Class on the poster and its controls. `client.ts` hides it once the player loads. */
export const POSTER_CLASS = "video-poster";

/** Class on the poster image. */
export const IMAGE_CLASS = "video-poster-image";

/** Class on the play button. It starts `hidden`; `client.ts` reveals it. */
export const PLAY_CLASS = "video-play";

/** Class on the link that opens the video without JavaScript and stays after the player loads. */
export const LINK_CLASS = "video-link";

/** Class on the message shown in place of a video that has no title. */
export const DIAGNOSTIC_CLASS = "video-diagnostic";

/** Class on the iframe that `client.ts` inserts. */
export const FRAME_CLASS = "video-frame";

/** The privacy-friendly YouTube host: no cookies are set until the video plays. */
export const YOUTUBE_HOST = "www.youtube-nocookie.com";

/** Props from the directive: `::video{src=… title=… poster=…}`. Every value is a string. */
export type VideoProps = {
  /** The video page: an `https` address. YouTube watch, short, and share links become the privacy host. */
  src?: string;
  /** Accessible name of the video. Required: without it the component renders a diagnostic instead. */
  title?: string;
  /** The image shown before the reader plays the video: an `https` address or a root-relative path. */
  poster?: string;
};

/** The poster image: an `https` address or a root-relative path, or `undefined` for anything else. */
export function posterSrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return httpsHref(raw);
}

/** YouTube's thumbnail for a video, or `undefined` when the address names no YouTube video. */
export function youtubePoster(src: string | undefined): string | undefined {
  if (src === undefined) return undefined;
  try {
    const id = youtubeId(new URL(src));
    return id === undefined ? undefined : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } catch {
    return undefined;
  }
}

/**
 * `::video{src=… title=… poster=…}` shows a 16:9 poster, a play button, and a link to the provider.
 * The player loads only when the reader clicks the button (`client.ts`), so nothing is requested from the
 * provider before then; without JavaScript the link still opens the video in a new tab. The link sits
 * under the box, so it stays after the player loads and when a player is blocked. Without a title the
 * component renders a message instead, because the player would have no accessible name. An empty or
 * unsafe `src` renders nothing.
 */
export default function video({ props, page }: ComponentProps<VideoProps>) {
  const lang = page.lang;
  const src = embedSrc(props.src);
  const href = httpsHref(props.src);
  if (src === undefined || href === undefined) return null;

  const title = typeof props.title === "string" ? props.title.trim() : "";
  if (title === "") {
    return h("p", { class: DIAGNOSTIC_CLASS }, t(lang, "video_missing_title"));
  }

  const poster = posterSrc(props.poster) ?? youtubePoster(src);
  const provider = providerOf(href);

  return h(
    "div",
    {
      class: VIDEO_CLASS,
      "data-video": true,
      "data-embed": src,
      "data-title": title,
    },
    h(
      "div",
      { class: BOX_CLASS, "data-video-box": true },
      h(
        "div",
        { class: POSTER_CLASS, "data-video-poster": true },
        poster === undefined
          ? null
          : h("img", {
              class: IMAGE_CLASS,
              src: poster,
              alt: "",
              loading: "lazy",
              decoding: "async",
            }),
        h(
          "button",
          {
            type: "button",
            class: PLAY_CLASS,
            hidden: true,
            "data-video-play": true,
            "aria-label": `${t(lang, "video_play")}: ${title}`,
          },
          t(lang, "video_play"),
        ),
      ),
    ),
    h(
      "a",
      { class: LINK_CLASS, href, target: "_blank", rel: "noopener noreferrer" },
      t(lang, "video_watch", { provider }),
    ),
  );
}
