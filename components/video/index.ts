import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { embedSrc, httpsHref, providerOf } from "../embed/index.ts";

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

/** Class on the captions link and on the transcript alternative. */
export const CAPTIONS_CLASS = "video-captions";
export const TRANSCRIPT_CLASS = "video-transcript";

/** Class on the transcript body inside the disclosure. */
export const TRANSCRIPT_BODY_CLASS = "video-transcript-body";

/** The privacy-friendly YouTube host: no cookies are set until the video plays. */
export const YOUTUBE_HOST = "www.youtube-nocookie.com";

/** Props from the directive: `::video{src=… title=… poster=…}`. Every value is a string. */
export type VideoProps = {
  /** The video page: an `https` address. YouTube watch, short, and share links become the privacy host. */
  src?: string;
  /** Accessible name of the video. Required: without it the component renders a diagnostic instead. */
  title?: string;
  /** The image shown before the reader plays the video: a root-relative path, so no third party is asked. */
  poster?: string;
  /** A WebVTT captions file: an `https` address or a root-relative path. Rendered as a link, not a request. */
  captions?: string;
  /** The visible, accessible label of the captions link. Without it the link is not rendered. */
  captions_label?: string;
  /** An external transcript: an `https` address or a root-relative path. The inline body wins when both exist. */
  transcript?: string;
  /** The label of the transcript disclosure or link. Without it the body is shown plainly and a URL is ignored. */
  transcript_label?: string;
};

/** A root-relative path: one slash, no backslash or whitespace, so browsers cannot read it as another host. */
const LOCAL_PATH = /^\/(?![/\\])[^\s\\]*$/;

/** A root-relative path, or `undefined` for anything else. Protocol-relative addresses are remote. */
function localPath(value: string): string | undefined {
  return LOCAL_PATH.test(value) ? value : undefined;
}

/** The poster image: a local root-relative path, or `undefined` for any remote address. */
export function posterSrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return localPath(value.trim());
}

/** A linked file: an `https` address or a root-relative path, or `undefined` for anything else. */
export function mediaHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  return localPath(raw) ?? httpsHref(raw);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `::video{src=… title=… poster=… captions=…}` shows a 16:9 poster, a play button, and a link to the
 * provider. Nothing remote is requested before the reader consents: an automatic provider thumbnail is
 * never loaded, `poster` must be local, and the player is inserted only on click (`client.ts`). Without
 * JavaScript the link still opens the video in a new tab. Authored captions and a transcript (the
 * directive body, or a linked file) are static markup, so they survive a blocked player. Without a title
 * the component renders a message instead, because the player would have no accessible name. An empty or
 * unsafe `src` renders nothing.
 */
export default function video({ props, html, page }: ComponentProps<VideoProps>) {
  const lang = page.lang;
  const src = embedSrc(props.src);
  const href = httpsHref(props.src);
  if (src === undefined || href === undefined) return null;

  const title = text(props.title);
  if (title === "") {
    return h("p", { class: DIAGNOSTIC_CLASS }, t(lang, "video_missing_title"));
  }

  const poster = posterSrc(props.poster);
  const provider = providerOf(href);

  const captions = mediaHref(props.captions);
  const captionsLabel = text(props.captions_label);
  const captionsNode =
    captions === undefined || captionsLabel === ""
      ? null
      : h(
          "p",
          { class: CAPTIONS_CLASS, "data-video-captions": true },
          h("a", { href: captions, rel: "noopener" }, captionsLabel),
        );

  const body = typeof html === "string" ? html.trim() : "";
  const transcriptHref = mediaHref(props.transcript);
  const transcriptLabel = text(props.transcript_label);

  let transcriptNode = null;
  if (body !== "") {
    const content = h("div", {
      class: TRANSCRIPT_BODY_CLASS,
      dangerouslySetInnerHTML: { __html: html },
    });
    transcriptNode =
      transcriptLabel === ""
        ? h("div", { class: TRANSCRIPT_CLASS, "data-video-transcript": true }, content)
        : h(
            "details",
            { class: TRANSCRIPT_CLASS, "data-video-transcript": true },
            h("summary", {}, transcriptLabel),
            content,
          );
  } else if (transcriptHref !== undefined && transcriptLabel !== "") {
    transcriptNode = h(
      "p",
      { class: TRANSCRIPT_CLASS, "data-video-transcript": true },
      h("a", { href: transcriptHref, rel: "noopener" }, transcriptLabel),
    );
  }

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
    captionsNode,
    transcriptNode,
  );
}
