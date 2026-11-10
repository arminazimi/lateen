import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import video, {
  DIAGNOSTIC_CLASS,
  FRAME_CLASS,
  IMAGE_CLASS,
  LINK_CLASS,
  PLAY_CLASS,
  POSTER_CLASS,
  directive,
  httpsHref,
  posterSrc,
  providerOf,
  VIDEO_CLASS,
  type VideoProps,
  youtubePoster,
} from "../components/video/index.ts";
import {
  activate,
  activateAll,
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

function render(props: VideoProps, lang = "en"): string {
  const input = {
    props,
    html: "",
    page: { lang },
    site: {},
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

function fakeEnv(created: VideoFrame[]): VideoEnv {
  return {
    createFrame() {
      const frame = fakeFrame();
      created.push(frame);
      return frame;
    },
  };
}

test("the directive is video and the default export is a component", () => {
  assert.equal(directive, "video");
  assert.equal(typeof video, "function");
});

test("renders a poster, a hidden play button, and a text link to the provider", () => {
  const html = render({ src: WATCH, title: TITLE });

  assert.match(html, new RegExp(`^<div class="${VIDEO_CLASS}"`));
  assert.match(html, new RegExp(`data-embed="${EMBED}"`));
  assert.match(html, /data-title="Big Buck Bunny"/);
  assert.match(html, new RegExp(`<div class="${POSTER_CLASS}"`));
  assert.match(html, new RegExp(`<img class="${IMAGE_CLASS}" src="https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg" alt[ >]`));
  assert.match(html, new RegExp(`<button type="button" class="${PLAY_CLASS}" hidden`));
  assert.match(html, /data-video-play="true"/);
  assert.match(html, /aria-label="Play video: Big Buck Bunny"/);
  assert.ok(
    html.includes(`<a class="${LINK_CLASS}" href="${WATCH}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>`),
    html,
  );
  assert.doesNotMatch(html, /<iframe/);
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

test("a poster is an https address or a root-relative path; an explicit poster wins", () => {
  assert.equal(posterSrc("https://cdn.example/poster.jpg"), "https://cdn.example/poster.jpg");
  assert.equal(posterSrc("/images/poster.jpg"), "/images/poster.jpg");
  assert.equal(posterSrc("http://cdn.example/poster.jpg"), undefined);
  assert.equal(posterSrc("javascript:alert(1)"), undefined);
  assert.equal(posterSrc("//cdn.example/poster.jpg"), undefined);

  const html = render({ src: WATCH, title: TITLE, poster: "https://cdn.example/poster.jpg" });
  assert.match(html, /src="https:\/\/cdn.example\/poster.jpg"/);
  assert.doesNotMatch(html, /i.ytimg.com/);
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
    assert.equal(youtubePoster(EMBED), "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg");
  }
  assert.equal(render({ src: "https://www.youtube.com/@channel", title: TITLE }), "");
});

test("providerOf names the known providers and falls back to the hostname", () => {
  assert.equal(providerOf(WATCH), "YouTube");
  assert.equal(providerOf("https://vimeo.com/76979871"), "Vimeo");
  assert.equal(providerOf("https://media.example.com/v/1"), "media.example.com");
  assert.equal(providerOf("https://www.example.com/v/1"), "example.com");
});

test("the play button is revealed when the island runs", () => {
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  activate(videoRoot, button, fakeEnv([]));
  assert.equal(button.hidden, false);
});

test("a click inserts the privacy iframe, fills it, and hides the poster", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  const poster = new FakeElement({}, false);
  videoRoot.set(PLAY_SELECTOR, button);
  videoRoot.set(POSTER_SELECTOR, poster);

  activate(videoRoot, button, fakeEnv(created));
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
  assert.deepEqual(videoRoot.children, [frame]);
  assert.equal(poster.hidden, true);
  assert.equal(videoRoot.dataset.loaded, "true");
});

test("a second click does not load the player twice", () => {
  const created: VideoFrame[] = [];
  const videoRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  videoRoot.set(PLAY_SELECTOR, button);
  activate(videoRoot, button, fakeEnv(created));

  button.click();
  button.click();

  assert.equal(created.length, 1);
  assert.equal(videoRoot.children.length, 1);
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

test("the title and the link text are escaped", () => {
  const html = render({ src: WATCH, title: '"><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script>alert\(1\)&lt;\/script>/);
  assert.match(html, /data-title="&quot;>&lt;script>alert\(1\)&lt;\/script>"/);
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

test("style.css keeps the frame at 16:9 and fills the same box with the player", () => {
  assert.match(css, /\.video\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.video-frame\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.video-play\[hidden\][^{]*\{[^}]*display:\s*none/);
});
