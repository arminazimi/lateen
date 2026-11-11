import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "@velella/mizzen/contracts";
import embed, {
  BOX_CLASS,
  DIAGNOSTIC_CLASS,
  EMBED_CLASS,
  embedSrc,
  httpsHref,
  LINK_CLASS,
  LOAD_CLASS,
  PLACEHOLDER_CLASS,
  providerOf,
  TITLE_CLASS,
  type EmbedProps,
  youtubeId,
} from "../components/embed/index.ts";
import {
  activate,
  activateAll,
  BOX_SELECTOR,
  EMBED_SELECTOR,
  FRAME_CLASS,
  LOAD_SELECTOR,
  load,
  PLACEHOLDER_SELECTOR,
  type EmbedDocument,
  type EmbedElement,
  type EmbedEnv,
  type EmbedFrame,
} from "../components/embed/client.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/embed/style.css");
const namesPath = join(root, "tokens/names.json");

/** The parts of a preact VNode the assertions read. */
type Tree = { type: string; props: { children?: unknown; [key: string]: unknown } };
type Node = Tree | string | number | null | undefined | boolean;

function render(props: EmbedProps) {
  const input = {
    props,
    html: "",
    page: {} as ComponentProps["page"],
    site: {} as ComponentProps["site"],
  } as ComponentProps<EmbedProps>;
  return embed(input) as unknown as Node;
}

/** Every element in the tree, depth first. */
function elements(node: Node): Tree[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  const out: Tree[] = [node as Tree];
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list as Node[]) out.push(...elements(child));
  return out;
}

function iframeOf(node: Node): Tree | undefined {
  return elements(node).find((element) => element.type === "iframe");
}

function textOf(node: Node): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node !== "object") return "";
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  return (list as Node[]).map(textOf).join("");
}

/** A fake element that fits the island's narrow element interface. */
class FakeElement implements EmbedElement {
  hidden: boolean;
  dataset: { embed?: string; title?: string; loaded?: string };
  readonly children: EmbedFrame[] = [];
  readonly listeners: Array<() => void> = [];
  readonly found = new Map<string, FakeElement>();

  constructor(dataset: { embed?: string; title?: string; loaded?: string } = {}, hidden = false) {
    this.dataset = dataset;
    this.hidden = hidden;
  }

  querySelector(selector: string): EmbedElement | null {
    return this.found.get(selector) ?? null;
  }

  appendChild(child: EmbedFrame): void {
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

function fakeFrame(): EmbedFrame {
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

function fakeEnv(created: EmbedFrame[]): EmbedEnv {
  return {
    createFrame() {
      const frame = fakeFrame();
      created.push(frame);
      return frame;
    },
  };
}

const css = readFileSync(stylePath, "utf8");
const TITLE = "Big Buck Bunny";
const WATCH = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const EMBED = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";

test("default export is the embed component", () => {
  assert.equal(typeof embed, "function");
});

test("renders a 16:9 box that names the embed, a hidden load button, and a fallback link, but no iframe", () => {
  const tree = render({ src: "https://example.com/page", title: TITLE }) as Tree;
  assert.equal(tree.type, "div");
  assert.equal(tree.props.class, EMBED_CLASS);
  assert.equal(tree.props["data-embed"], "https://example.com/page");
  assert.equal(tree.props["data-title"], TITLE);

  const box = elements(tree).find((element) => element.props.class === BOX_CLASS) as Tree;
  assert.equal(box.props["data-embed-box"], true);

  const placeholder = elements(tree).find((element) => element.props.class === PLACEHOLDER_CLASS) as Tree;
  assert.equal(placeholder.props["data-embed-placeholder"], true);
  const title = elements(tree).find((element) => element.props.class === TITLE_CLASS) as Tree;
  assert.equal(textOf(title), TITLE);

  const button = elements(tree).find((element) => element.props.class === LOAD_CLASS) as Tree;
  assert.equal(button.type, "button");
  assert.equal(button.props.hidden, true);
  assert.equal(button.props["data-embed-load"], true);
  assert.equal(button.props["aria-label"], `Load embed: ${TITLE}`);

  const link = elements(tree).find((element) => element.props.class === LINK_CLASS) as Tree;
  assert.equal(link.type, "a");
  assert.equal(link.props.href, "https://example.com/page");
  assert.equal(link.props.target, "_blank");
  assert.equal(link.props.rel, "noopener noreferrer");
  assert.equal(textOf(link), "Open on example.com");

  assert.equal(iframeOf(tree), undefined);
});

test("the fallback link points at the original page, not the privacy embed address", () => {
  const tree = render({ src: WATCH, title: TITLE });
  const link = elements(tree).find((element) => element.props.class === LINK_CLASS) as Tree;
  assert.equal(link.props.href, WATCH);
  assert.equal(textOf(link), "Open on YouTube");
});

test("the fallback link is outside the box, so loading the frame never covers or hides it", () => {
  const tree = render({ src: WATCH, title: TITLE }) as Tree;
  const children = (Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children]) as Node[];
  assert.equal((children[0] as Tree).props.class, BOX_CLASS);
  assert.equal((children[1] as Tree).props.class, LINK_CLASS);
});

test("a missing, blank, or unparsable src renders nothing", () => {
  assert.equal(render({ title: TITLE }), null);
  assert.equal(render({ src: "   ", title: TITLE }), null);
  assert.equal(render({ src: "not a url", title: TITLE }), null);
});

test("only https addresses are embedded", () => {
  assert.equal(render({ src: "http://example.com/", title: TITLE }), null);
  assert.equal(render({ src: "javascript:alert(1)", title: TITLE }), null);
  assert.equal(render({ src: "data:text/html,hi", title: TITLE }), null);
});

test("a missing or blank title renders a diagnostic and no box", () => {
  for (const title of [undefined, "", "   "]) {
    const props: EmbedProps = title === undefined ? { src: "https://example.com/page" } : { src: "https://example.com/page", title };
    const tree = render(props) as Tree;
    assert.equal(tree.type, "p");
    assert.equal(tree.props.class, DIAGNOSTIC_CLASS);
    assert.equal(elements(tree).some((element) => "data-embed" in element.props), false);
    assert.match(textOf(tree), /missing a title/);
  }
});

test("the title is trimmed before it names the frame and the button", () => {
  const tree = render({ src: "https://example.com/page", title: "  Demo  " }) as Tree;
  assert.equal(tree.props["data-title"], "Demo");
  const button = elements(tree).find((element) => element.props.class === LOAD_CLASS) as Tree;
  assert.equal(button.props["aria-label"], "Load embed: Demo");
});

test("youtube watch, short, share, and embed addresses use the privacy host", () => {
  const addresses = [
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtube.com/watch?feature=share&v=aqz-KE-bpKQ",
    "https://m.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://youtu.be/aqz-KE-bpKQ",
    "https://www.youtube.com/embed/aqz-KE-bpKQ?start=10",
    "https://www.youtube.com/shorts/aqz-KE-bpKQ",
    "https://www.youtube.com/live/aqz-KE-bpKQ",
    "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
  ];
  for (const src of addresses) {
    assert.equal(embedSrc(src), EMBED, src);
  }
});

test("a youtube address without a video ID renders nothing", () => {
  assert.equal(render({ src: "https://www.youtube.com/@channel", title: TITLE }), null);
  assert.equal(render({ src: "https://www.youtube.com/watch?v=short", title: TITLE }), null);
  assert.equal(render({ src: "https://www.youtube.com/watch", title: TITLE }), null);
});

test("youtubeId reads the ID only from a well-formed eleven-character value", () => {
  assert.equal(youtubeId(new URL("https://youtu.be/aqz-KE-bpKQ")), "aqz-KE-bpKQ");
  assert.equal(youtubeId(new URL("https://youtu.be/abc")), undefined);
  assert.equal(youtubeId(new URL("https://www.youtube.com/watch?v=aqz-KE-bpKQ%20")), undefined);
});

test("other https addresses are used as written", () => {
  assert.equal(embedSrc("https://vimeo.com/76979871"), "https://vimeo.com/76979871");
  assert.equal(embedSrc("  https://example.com/a?b=c  "), "https://example.com/a?b=c");
});

test("httpsHref keeps only https addresses and providerOf names the known hosts", () => {
  assert.equal(httpsHref(WATCH), WATCH);
  assert.equal(httpsHref("http://example.com"), undefined);
  assert.equal(httpsHref("javascript:alert(1)"), undefined);
  assert.equal(providerOf(WATCH), "YouTube");
  assert.equal(providerOf("https://vimeo.com/76979871"), "Vimeo");
  assert.equal(providerOf("https://media.example.com/v/1"), "media.example.com");
  assert.equal(providerOf("https://www.example.com/v/1"), "example.com");
});

test("the load button is revealed when the island runs", () => {
  const embedRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  activate(embedRoot, button, fakeEnv([]));
  assert.equal(button.hidden, false);
});

test("a click inserts the iframe into the box, fills it, and hides the placeholder", () => {
  const created: EmbedFrame[] = [];
  const embedRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const box = new FakeElement();
  const button = new FakeElement({}, true);
  const placeholder = new FakeElement({}, false);
  embedRoot.set(BOX_SELECTOR, box);
  box.set(LOAD_SELECTOR, button);
  box.set(PLACEHOLDER_SELECTOR, placeholder);

  activate(embedRoot, button, fakeEnv(created));
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
  assert.deepEqual(embedRoot.children, []);
  assert.equal(placeholder.hidden, true);
  assert.equal(embedRoot.dataset.loaded, "true");
});

test("a second click does not load the embed twice", () => {
  const created: EmbedFrame[] = [];
  const embedRoot = new FakeElement({ embed: EMBED, title: TITLE });
  const button = new FakeElement({}, true);
  embedRoot.set(LOAD_SELECTOR, button);
  activate(embedRoot, button, fakeEnv(created));

  button.click();
  button.click();

  assert.equal(created.length, 1);
  assert.equal(embedRoot.children.length, 1);
});

test("the island refuses a non-https address, so a bad attribute loads nothing", () => {
  const created: EmbedFrame[] = [];
  const embedRoot = new FakeElement({ embed: "http://example.com/page", title: TITLE });
  load(embedRoot, fakeEnv(created));
  assert.deepEqual(created, []);
  assert.equal(embedRoot.dataset.loaded, undefined);
});

test("activateAll reveals the button in every embed on the page", () => {
  const first = new FakeElement({ embed: EMBED, title: TITLE });
  const firstButton = new FakeElement({}, true);
  const second = new FakeElement({ embed: EMBED, title: TITLE });
  const secondButton = new FakeElement({}, true);
  first.set(LOAD_SELECTOR, firstButton);
  second.set(LOAD_SELECTOR, secondButton);
  const doc: EmbedDocument = {
    querySelectorAll(selector: string) {
      assert.equal(selector, EMBED_SELECTOR);
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
});

test("style.css reserves a 16:9 box, fills it with the iframe, and keeps the link under it", () => {
  assert.match(css, /\.embed\s*\{[^}]*max-inline-size:\s*100%/);
  assert.match(css, /\.embed-box\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.embed-iframe\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.embed-load\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.match(css, /\.embed-placeholder\[hidden\][^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.embed-link\s*\{[^}]*position:\s*absolute/);
});
