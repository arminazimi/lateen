import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import video, {
  BOX_CLASS,
  CAPTIONS_CLASS,
  DIAGNOSTIC_CLASS,
  FRAME_CLASS,
  IMAGE_CLASS,
  LINK_CLASS,
  PLAY_CLASS,
  POSTER_CLASS,
  TRANSCRIPT_BODY_CLASS,
  TRANSCRIPT_CLASS,
  directive,
  mediaHref,
  posterSrc,
  VIDEO_CLASS,
  type VideoProps,
} from "../components/video/index.ts";
import { httpsHref, providerOf } from "../components/embed/index.ts";
import {
  activate,
  activateAll,
  BOX_SELECTOR,
  PLAY_SELECTOR,
  POSTER_SELECTOR,
  VIDEO_SELECTOR,
  type VideoDocument,
  type VideoElement,
  type VideoEnv,
  type VideoFrame,
} from "../components/video/client.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/video/style.css");
const namesPath = join(root, "tokens/names.json");

const css = readFileSync(stylePath, "utf8");
const TITLE = "Big Buck Bunny";
const WATCH = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const EMBED = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";

function render(props: VideoProps, lang = "en", html = "", base = ""): string {
  const input = {
    props,
    html,
    page: { lang },
    site: base === "" ? {} : { config: { base } },
  } as unknown as ComponentProps<VideoProps>;
  return renderToString(video(input) as never);
}

/** A fake element that fits the island's narrow element interface. */
class FakeElement implements VideoElement {
  hidden: boolean;
  dataset: { embed?: string; title?: string; loaded?: string };
  readonly children: VideoFrame[] = [];
  readonly listeners: Array<() => void> = [];
  readonly found = new Map<string, FakeElement>();

  constructor(dataset: { embed?: string; title?: string; loaded?: string } = {}, hidden = false) {
    this.dataset = dataset;
    this.hidden = hidden;
  }

  querySelector(selector: string): VideoElement | null {
    return this.found.get(selector) ?? null;
  }

  appendChild(child: VideoFrame): void {
    this.children.push(child);
  }

  addEventListener(_type: "click", listener: () => void): void {
    this.listeners.push(listener);
  }

  set(selector: string, element: FakeElement): void {
    this.found.set(selector, element);
  }

  click(): void {
    for (const listener of this.listeners) listener();
  }
}

function fakeFrame(): VideoFrame {
  return {
    className: "",
    src: "",
    title: "",
    loading: "",
    referrerPolicy: "",
    allow: "",
    allowFullscreen: false,
    focus(): void {},
  };
}

function fakeEnv(created: VideoFrame[], onFocus?: () => void): VideoEnv {
  return {
    createFrame() {
      const frame = fakeFrame();
      if (onFocus !== undefined) frame.focus = onFocus;
      created.push(frame);
      return frame;
    },
  };
}

test("the directive is video and the default export is a component", () => {
  assert.equal(directive, "video");
  assert.equal(typeof video, "function");
});

test("a default YouTube video requests nothing remote: no thumbnail, image, track, or frame", () => {
  const html = render({ src: WATCH, title: TITLE });

  assert.match(html, new RegExp(`^<div class="${VIDEO_CLASS}"`));
  assert.match(html, new RegExp(`data-embed="${EMBED}"`));
  assert.match(html, /data-title="Big Buck Bunny"/);
  assert.match(html, new RegExp(`<div class="${BOX_CLASS}"`));
  assert.match(html, new RegExp(`<div class="${POSTER_CLASS}"`));
  assert.match(html, new RegExp(`<button type="button" class="${PLAY_CLASS}" hidden`));
  assert.match(html, /data-video-play="true"/);
  assert.match(html, /aria-label="Play video: Big Buck Bunny"/);
  assert.ok(
    html.includes(`<a class="${LINK_CLASS}" href="${WATCH}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>`),
    html,
  );

  // The embed address lives only in a data attribute; no element loads it before consent.
  assert.doesNotMatch(html, /i\.ytimg\.com|ytimg/);
  assert.doesNotMatch(html, /<(?:img|iframe|track|source|video|link|script)\b/);
  assert.doesNotMatch(html, /\ssrc=/);
});

test("the provider link sits under the box, so it stays when the player loads or fails", () => {
  const html = render({ src: WATCH, title: TITLE });
  // The box closes before the link opens, so the island hides only the poster, never the link.
  assert.match(html, new RegExp(`</div></div><a class="${LINK_CLASS}"`));
});

test("the text link is static markup, so it works when the island never runs", () => {
  const html = render({ src: WATCH, title: TITLE });
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />Watch on YouTube</);
  assert.doesNotMatch(html, /<iframe/);
});

test("only https sources render; anything else renders nothing", () => {
  assert.equal(render({ src: "http://example.com/video", title: TITLE }), "");
  assert.equal(render({ src: "javascript:alert(1)", title: TITLE }), "");
  assert.equal(render({ src: "data:text/html,hi", title: TITLE }), "");
  assert.equal(render({ title: TITLE }), "");
  assert.equal(render({ src: "   ", title: TITLE }), "");
});

test("a missing or blank title renders a diagnostic and no controls", () => {
  for (const title of [undefined, "", "   "]) {
    const props: VideoProps = title === undefined ? { src: WATCH } : { src: WATCH, title };
    const html = render(props);
    assert.match(html, new RegExp(`^<p class="${DIAGNOSTIC_CLASS}"`));
    assert.match(html, /missing a title/);
    assert.doesNotMatch(html, /data-video/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /<a /);
  }
});

test("the title is trimmed before it names the player and the button", () => {
  const html = render({ src: WATCH, title: "  Demo  " });
  assert.match(html, /data-title="Demo"/);
  assert.match(html, /aria-label="Play video: Demo"/);
});

test("a poster must be a local root-relative path; an explicit local poster renders", () => {
  assert.equal(posterSrc("/images/poster.jpg"), "/images/poster.jpg");
  assert.equal(posterSrc("  /images/poster.jpg  "), "/images/poster.jpg");
  assert.equal(posterSrc("https://cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("http://cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("javascript:alert(1)"), undefined);
  assert.equal(posterSrc("//cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("/\\cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("\\\\cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("/a\\b.jpg"), undefined);
  assert.equal(posterSrc("/a b.jpg"), undefined);
  assert.equal(posterSrc(""), undefined);
  assert.equal(posterSrc(undefined), undefined);

  const html = render({ src: WATCH, title: TITLE, poster: "/images/poster.jpg" });
  assert.match(html, new RegExp(`<img class="${IMAGE_CLASS}" src="/images/poster.jpg" alt[ >]`));
  assert.doesNotMatch(html, /i.ytimg.com/);
});

test("a remote poster is rejected, so no third party is asked before consent", () => {
  for (const poster of ["https://cdn.example/poster.jpg", "http://cdn.example/poster.jpg", "//cdn.example/p.jpg"]) {
    const html = render({ src: WATCH, title: TITLE, poster });
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /cdn\.example/);
  }
});

test("a non-youtube source without a poster has no image, only the surface", () => {
  const html = render({ src: "https://vimeo.com/76979871", title: TITLE });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Watch on Vimeo/);
});

test("youtube links normalise to the privacy host and keep the watch address for the link", () => {
  for (const src of [WATCH, "https://youtu.be/aqz-KE-bpKQ", "https://www.youtube.com/shorts/aqz-KE-bpKQ"]) {
    const html = render({ src, title: TITLE });
    assert.match(html, new RegExp(`data-embed="${EMBED}"`));
    assert.ok(httpsHref(src) === src, src);
    assert.doesNotMatch(html, /<img/);
  }
  assert.equal(render({ src: "https://www.youtube.com/@channel", title: TITLE }), "");
});

test("providerOf names the known providers and falls back to the hostname", () => {
  assert.equal(providerOf(WATCH), "YouTube");
  assert.equal(providerOf("https://vimeo.com/76979871"), "Vimeo");
  assert.equal(providerOf("https://media.example.com/v/1"), "media.example.com");
  assert.equal(providerOf("https://www.example.com/v/1"), "example.com");
});

test("captions are a static labelled link to a safe https or local file", () => {
  assert.equal(mediaHref("/media/captions.vtt"), "/media/captions.vtt");
  assert.equal(mediaHref("https://cdn.example/captions.vtt"), "https://cdn.example/captions.vtt");

  const local = render({
    src: WATCH,
    title: TITLE,
    captions: "/media/captions.vtt",
    captions_label: "English captions",
  });
  assert.match(
    local,
    new RegExp(
      `<p class="${CAPTIONS_CLASS}" data-video-captions="true"><a href="/media/captions.vtt" rel="noopener">English captions</a></p>`,
    ),
  );
  assert.doesNotMatch(local, /<iframe/);

  const remote = render({
    src: WATCH,
    title: TITLE,
    captions: "https://cdn.example/captions.vtt",
    captions_label: "English captions",
  });
  assert.match(remote, /href="https:\/\/cdn\.example\/captions\.vtt"/);
});

test("unsafe captions URLs and a caption without an authored label are rejected", () => {
  for (const captions of [
    "http://cdn.example/captions.vtt",
    "javascript:alert(1)",
    "data:text/vtt,WEBVTT",
    "//cdn.example/captions.vtt",
    "/\\cdn.example/captions.vtt",
  ]) {
    const html = render({ src: WATCH, title: TITLE, captions, captions_label: "Captions" });
    assert.doesNotMatch(html, /data-video-captions/);
    assert.doesNotMatch(html, /href="(?:javascript|data|http:)/);
  }
  assert.doesNotMatch(render({ src: WATCH, title: TITLE, captions: "/c.vtt" }), /data-video-captions/);
  assert.doesNotMatch(render({ src: WATCH, title: TITLE, captions: "/c.vtt", captions_label: "  " }), /data-video-captions/);
});

test("the directive body is a static transcript disclosure labelled by the author", () => {
  const html = render(
    { src: WATCH, title: TITLE, transcript_label: "Transcript" },
    "en",
    "<p>The bunny wakes up.</p><p>Then he leaves.</p>",
  );

  assert.match(
    html,
    new RegExp(
      `<details class="${TRANSCRIPT_CLASS}" data-video-transcript="true"><summary>Transcript</summary><div class="${TRANSCRIPT_BODY_CLASS}"><p>The bunny wakes up.</p><p>Then he leaves.</p></div></details>`,
    ),
  );
  assert.match(html, /Watch on YouTube/);
  assert.doesNotMatch(html, /<iframe|<script/);
});

test("a transcript without an authored label is shown plainly, with no invented text", () => {
  const html = render({ src: WATCH, title: TITLE }, "en", "<p>Inline transcript.</p>");
  assert.match(
    html,
    new RegExp(`<div class="${TRANSCRIPT_CLASS}" data-video-transcript="true"><div class="${TRANSCRIPT_BODY_CLASS}"><p>Inline transcript.</p></div></div>`),
  );
  assert.doesNotMatch(html, /<details|<summary/);
});

test("an external transcript is a static labelled link; the inline body wins when both exist", () => {
  const linked = render({
    src: WATCH,
    title: TITLE,
    transcript: "https://example.com/transcript.html",
    transcript_label: "Read the transcript",
  });
  assert.match(
    linked,
    new RegExp(
      `<p class="${TRANSCRIPT_CLASS}" data-video-transcript="true"><a href="https://example.com/transcript.html" rel="noopener">Read the transcript</a></p>`,
    ),
  );

  const inline = render(
    { src: WATCH, title: TITLE, transcript: "https://example.com/transcript.html", transcript_label: "Transcript" },
    "en",
    "<p>Inline wins.</p>",
  );
  assert.match(inline, /<summary>Transcript<\/summary>/);
  assert.match(inline, /Inline wins/);
  assert.doesNotMatch(inline, /example\.com\/transcript/);
});

test("unsafe transcript URLs are rejected", () => {
  for (const transcript of [
    "http://example.com/t.html",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//example.com/t.html",
    "/\\example.com/t.html",
  ]) {
    const html = render({ src: WATCH, title: TITLE, transcript, transcript_label: "Transcript" });
    assert.doesNotMatch(html, /data-video-transcript/);
    assert.doesNotMatch(html, /href="(?:javascript|data|http:)/);
  }
  assert.doesNotMatch(
    render({ src: WATCH, title: TITLE, transcript: "https://example.com/t.html" }),
    /data-video-transcript/,
  );
});

test("the play button is revealed when the island runs, without a request", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  activate(videoRoot, button, fakeEnv(created));
  assert.equal(button.hidden, false);
  assert.deepEqual(created, []);
});

test("a click inserts the privacy iframe into the box, fills it, focuses it, and hides the poster", () => {
  const created: VideoFrame[] = [];
  let focused = 0;
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const box = new FakeElement();
  const button = new FakeElement({}, true);
  const poster = new FakeElement({}, false);
  videoRoot.set(BOX_SELECTOR, box);
  box.set(PLAY_SELECTOR, button);
  box.set(POSTER_SELECTOR, poster);

  activate(videoRoot, button, fakeEnv(created, () => focused++));
  button.click();

  assert.equal(created.length, 1);
  const frame = created[0]!;
  assert.equal(frame.className, FRAME_CLASS);
  assert.equal(frame.src, EMBED);
  assert.equal(frame.title, TITLE);
  assert.equal(frame.loading, "lazy");
  assert.equal(frame.referrerPolicy, "strict-origin-when-cross-origin");
  assert.equal(frame.allow, "encrypted-media; picture-in-picture; fullscreen");
  assert.equal(frame.allowFullscreen, true);
  assert.deepEqual(box.children, [frame]);
  assert.deepEqual(videoRoot.children, []);
  assert.equal(poster.hidden, true);
  assert.equal(videoRoot.dataset.loaded, "true");
  assert.equal(focused, 1);
});

test("keyboard activation is the button's click, so it loads once and moves focus to the player", () => {
  const created: VideoFrame[] = [];
  let focused = 0;
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  videoRoot.set(PLAY_SELECTOR, button);

  activate(videoRoot, button, fakeEnv(created, () => focused++));
  // A native button turns Enter and Space into a click; the island adds no key handler of its own.
  button.click();

  assert.equal(created.length, 1);
  assert.equal(focused, 1);
});

test("a second click, or a second activation, does not load the player twice", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  videoRoot.set(PLAY_SELECTOR, button);

  activate(videoRoot, button, fakeEnv(created));
  activate(videoRoot, button, fakeEnv(created));
  button.click();
  button.click();

  assert.equal(created.length, 1);
  assert.equal(videoRoot.children.length, 1);
});

test("a failed or blocked player leaves the static provider link untouched", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const box = new FakeElement();
  const button = new FakeElement({}, true);
  videoRoot.set(BOX_SELECTOR, box);
  box.set(PLAY_SELECTOR, button);

  activate(videoRoot, button, fakeEnv(created));
  button.click();

  // The island writes only inside the box and the poster; the link is a sibling in static markup.
  assert.deepEqual(videoRoot.children, []);
  assert.deepEqual(box.children.length, 1);
  const html = render({ src: WATCH, title: TITLE });
  assert.ok(html.includes(`class="${LINK_CLASS}"`));
});

test("the island refuses a non-https address, so a bad attribute loads nothing", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: "http://example.com/video", title: TITLE });
  const button = new FakeElement({}, true);
  activate(videoRoot, button, fakeEnv(created));
  button.click();
  assert.deepEqual(created, []);
});

test("activateAll reveals the button in every video on the page", () => {
  const first = new FakeElement({ embed: EMBED, title: TITLE });
  const firstButton = new FakeElement({}, true);
  const second = new FakeElement({ embed: EMBED, title: TITLE });
  const secondButton = new FakeElement({}, true);
  first.set(PLAY_SELECTOR, firstButton);
  second.set(PLAY_SELECTOR, secondButton);
  const doc: VideoDocument = {
    querySelectorAll(selector: string) {
      assert.equal(selector, VIDEO_SELECTOR);
      return [first, second];
    },
    createElement() {
      return fakeFrame();
    },
  };

  activateAll(doc, fakeEnv([]));

  assert.equal(firstButton.hidden, false);
  assert.equal(secondButton.hidden, false);
});

test("the title, the labels, and the link text are escaped", () => {
  const html = render(
    {
      src: WATCH,
      title: '"><script>alert(1)</script>',
      captions: "/c.vtt",
      captions_label: "<b>Captions</b>",
      transcript_label: "<i>Transcript</i>",
    },
    "en",
    "<p>Authored body</p>",
  );
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>|<i>/);
  assert.match(html, /&lt;script>alert\(1\)&lt;\/script>/);
  assert.match(html, /data-title="&quot;>&lt;script>alert\(1\)&lt;\/script>"/);
  assert.match(html, /&lt;b>Captions&lt;\/b>/);
  assert.match(html, /&lt;i>Transcript&lt;\/i>/);
});

test("the Persian and Arabic diagnostic is translated", () => {
  assert.match(render({ src: WATCH }, "fa"), /عنوان ندارد/);
  assert.match(render({ src: WATCH }, "ar"), /بلا عنوان/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const names = JSON.parse(readFileSync(namesPath, "utf8")) as Record<string, Record<string, unknown>>;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):\s/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});

test("style.css keeps the box at 16:9, fills it with the player, and keeps the alternatives under it", () => {
  assert.match(css, /\.video\s*\{[^}]*max-inline-size:\s*100%/);
  assert.match(css, /\.video-box\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.video-frame\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.video-play\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.video-link\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(css, /\.video-(?:captions|transcript)\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.video-transcript > summary\s*\{[^}]*cursor:\s*pointer/);
});

test("root-relative poster, captions, and transcript take the site base", () => {
  const out = render(
    {
      src: WATCH,
      title: TITLE,
      poster: "/brand/poster.svg",
      captions: "/media/captions.vtt",
      captions_label: "Captions",
      transcript: "/media/transcript.txt",
      transcript_label: "Transcript",
    },
    "en",
    "",
    "/lateen",
  );
  assert.match(out, /src="\/lateen\/brand\/poster\.svg"/);
  assert.match(out, /href="\/lateen\/media\/captions\.vtt"/);
  assert.match(out, /href="\/lateen\/media\/transcript\.txt"/);
});
