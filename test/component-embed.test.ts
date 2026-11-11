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
  STATUS_CLASS,
  TITLE_CLASS,
  type EmbedProps,
  youtubeId,
} from "../components/embed/index.ts";
import {
  activate,
  activateAll,
  BOX_SELECTOR,
  EMBED_SELECTOR,
  FAILED_MESSAGE,
  FRAME_CLASS,
  LOAD_SELECTOR,
  LOADING_MESSAGE,
  load,
  PLACEHOLDER_SELECTOR,
  RETRY_LABEL,
  STATUS_SELECTOR,
  TIMEOUT_MS,
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
  textContent: string | null = null;
  dataset: { embed?: string; title?: string; loaded?: string; state?: string };
  readonly children: EmbedFrame[] = [];
  readonly listeners: Array<() => void> = [];
  readonly attributes = new Map<string, string>();
  readonly found = new Map<string, FakeElement>();

  constructor(dataset: { embed?: string; title?: string; loaded?: string; state?: string } = {}, hidden = false) {
    this.dataset = dataset;
    this.hidden = hidden;
  }

  querySelector(selector: string): EmbedElement | null {
    return this.found.get(selector) ?? null;
  }

  appendChild(child: EmbedFrame): void {
    this.children.push(child);
  }

  removeChild(child: EmbedFrame): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
  }

  addEventListener(_type: "click", listener: () => void): void {
    this.listeners.push(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  set(selector: string, element: FakeElement): void {
    this.found.set(selector, element);
  }

  click(): void {
    for (const listener of this.listeners) listener();
  }
}

/** A fake iframe that records its listeners so a test can fire load and error events. */
class FakeFrame implements EmbedFrame {
  className = "";
  src = "";
  title = "";
  loading = "";
  referrerPolicy = "";
  allow = "";
  allowFullscreen = false;
  readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: "load" | "error", listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: "load" | "error"): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  focus(): void {}
}

/** The island's timers under the test's control: no waiting, and a pending count to check cleanup. */
class FakeClock {
  private readonly tasks = new Map<number, () => void>();
  private next = 1;
  readonly delays: number[] = [];

  schedule(callback: () => void, ms: number): number {
    const handle = this.next++;
    this.tasks.set(handle, callback);
    this.delays.push(ms);
    return handle;
  }

  cancel(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  get pending(): number {
    return this.tasks.size;
  }

  /** Runs every pending timeout once, as a browser would after enough time passed. */
  tick(): void {
    const callbacks = [...this.tasks.values()];
    this.tasks.clear();
    for (const callback of callbacks) callback();
  }
}

function fakeEnv(created: EmbedFrame[], clock = new FakeClock()): EmbedEnv {
  return {
    createFrame() {
      const frame = new FakeFrame();
      created.push(frame);
      return frame;
    },
    schedule: (callback, ms) => clock.schedule(callback, ms),
    cancel: (handle) => clock.cancel(handle),
  };
}

/** An embed wired the way `activateAll` wires it, with every part the island queries. */
function harness() {
  const created: EmbedFrame[] = [];
  const clock = new FakeClock();
  const env = fakeEnv(created, clock);
  const root = new FakeElement({ embed: EMBED, title: TITLE });
  const box = new FakeElement();
  const button = new FakeElement({}, true);
  const placeholder = new FakeElement({}, false);
  const status = new FakeElement();
  root.set(BOX_SELECTOR, box);
  box.set(LOAD_SELECTOR, button);
  box.set(PLACEHOLDER_SELECTOR, placeholder);
  box.set(STATUS_SELECTOR, status);
  activate(root, button, env);
  return { box, button, clock, created, env, placeholder, root, status };
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
  assert.equal(tree.props["data-embed-state"], "idle");

  const box = elements(tree).find((element) => element.props.class === BOX_CLASS) as Tree;
  assert.equal(box.props["data-embed-box"], true);

  const placeholder = elements(tree).find((element) => element.props.class === PLACEHOLDER_CLASS) as Tree;
  assert.equal(placeholder.props["data-embed-placeholder"], true);
  const title = elements(tree).find((element) => element.props.class === TITLE_CLASS) as Tree;
  assert.equal(textOf(title), TITLE);

  const status = elements(tree).find((element) => element.props.class === STATUS_CLASS) as Tree;
  assert.equal(status.type, "p");
  assert.equal(status.props["data-embed-status"], true);
  assert.equal(status.props.role, "status");
  assert.equal(textOf(status), "");

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

test("the load button is revealed when the island runs, and nothing is requested yet", () => {
  const { button, created, root } = harness();
  assert.equal(button.hidden, false);
  assert.equal(created.length, 0);
  assert.equal(root.dataset.state, undefined);
  assert.equal(root.dataset.loaded, undefined);
});

test("a click inserts the iframe, keeps the placeholder over it, and shows the loading status", () => {
  const { box, button, clock, created, placeholder, root, status } = harness();

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
  assert.deepEqual(root.children, []);
  assert.equal(placeholder.hidden, false);
  assert.equal(status.textContent, LOADING_MESSAGE);
  assert.equal(button.hidden, true);
  assert.equal(root.dataset.state, "loading");
  assert.equal(root.dataset.loaded, undefined);
  assert.equal(clock.pending, 1);
  assert.deepEqual(clock.delays, [TIMEOUT_MS], "the loading attempt has a timeout");
});

test("a load event hides the placeholder, clears the status, and marks the embed ready", () => {
  const { button, clock, created, placeholder, root, status } = harness();
  button.click();

  (created[0] as FakeFrame).emit("load");

  assert.equal(placeholder.hidden, true);
  assert.equal(status.textContent, "");
  assert.equal(root.dataset.loaded, "true");
  assert.equal(root.dataset.state, "ready");
  assert.equal(clock.pending, 0, "the timeout is cancelled once the frame loads");
});

test("a load event from an older frame cannot mark a later attempt ready", () => {
  const { button, created, root, status } = harness();
  button.click();
  (created[0] as FakeFrame).emit("error");

  button.click();
  (created[0] as FakeFrame).emit("load");

  assert.equal(root.dataset.state, "loading");
  assert.equal(root.dataset.loaded, undefined);
  assert.equal(status.textContent, LOADING_MESSAGE);
});

test("an error removes the frame and leaves the placeholder, provider link, and retry button usable", () => {
  const { box, button, clock, created, placeholder, root, status } = harness();
  button.click();

  (created[0] as FakeFrame).emit("error");

  assert.deepEqual(box.children, [], "the failed frame is gone, not an empty box");
  assert.equal(placeholder.hidden, false);
  assert.equal(status.textContent, FAILED_MESSAGE);
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, RETRY_LABEL);
  assert.equal(button.attributes.get("aria-label"), `${RETRY_LABEL}: ${TITLE}`);
  assert.equal(root.dataset.state, "failed");
  assert.equal(root.dataset.loaded, undefined);
  assert.equal(clock.pending, 0, "the timeout is cancelled on failure");
});

test("a frame that does not load in time fails like an error", () => {
  const { button, clock, created, placeholder, root, status } = harness();
  button.click();

  clock.tick();

  assert.equal(clock.pending, 0);
  assert.equal(root.dataset.state, "failed");
  assert.equal(placeholder.hidden, false);
  assert.equal(status.textContent, FAILED_MESSAGE);
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, RETRY_LABEL);
  assert.equal(created.length, 1);
});

test("a late load after a timeout is ignored and leaves the retry control in place", () => {
  const { button, clock, created, placeholder, root, status } = harness();
  button.click();
  clock.tick();

  (created[0] as FakeFrame).emit("load");

  assert.equal(root.dataset.state, "failed");
  assert.equal(root.dataset.loaded, undefined);
  assert.equal(placeholder.hidden, false);
  assert.equal(status.textContent, FAILED_MESSAGE);
  assert.equal(button.textContent, RETRY_LABEL);
});

test("the retry button starts a fresh attempt and replaces the failed frame", () => {
  const { box, button, clock, created, placeholder, root, status } = harness();
  button.click();
  (created[0] as FakeFrame).emit("error");

  button.click();

  assert.equal(created.length, 2);
  assert.equal(box.children.length, 1, "only the current frame is in the box");
  assert.equal(box.children[0], created[1]);
  assert.equal(placeholder.hidden, false);
  assert.equal(status.textContent, LOADING_MESSAGE);
  assert.equal(button.hidden, true);
  assert.equal(root.dataset.state, "loading");
  assert.equal(clock.pending, 1);
});

test("a rapid double click starts only one frame", () => {
  const { box, button, clock, created } = harness();

  button.click();
  button.click();

  assert.equal(created.length, 1);
  assert.equal(box.children.length, 1);
  assert.equal(clock.pending, 1);
});

test("rapid retries start one frame and an old error cannot fail the new attempt", () => {
  const { box, button, clock, created, root } = harness();
  button.click();
  (created[0] as FakeFrame).emit("error");

  button.click();
  button.click();
  (created[0] as FakeFrame).emit("error");

  assert.equal(created.length, 2);
  assert.equal(box.children.length, 1);
  assert.equal(root.dataset.state, "loading");
  assert.equal(clock.pending, 1);
});

test("repeated failures keep exactly one retry control and no frame", () => {
  const { box, button, created, root } = harness();

  for (let attempt = 0; attempt < 3; attempt++) {
    button.click();
    (created[attempt] as FakeFrame).emit("error");
  }

  assert.equal(created.length, 3);
  assert.deepEqual(box.children, []);
  assert.equal(root.dataset.state, "failed");
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, RETRY_LABEL);
});

test("the retry control is a native button, so Enter and Space activate the same click path", () => {
  const tree = render({ src: WATCH, title: TITLE }) as Tree;
  const button = elements(tree).find((element) => element.props.class === LOAD_CLASS) as Tree;
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.notEqual(button.props.disabled, true);

  // A native button turns Enter and Space into this click; no key handler is needed.
  const wired = harness();
  wired.button.click();
  assert.equal(wired.created.length, 1);
});

test("without JavaScript the fallback link is the only way through", () => {
  const tree = render({ src: WATCH, title: TITLE }) as Tree;
  const button = elements(tree).find((element) => element.props.class === LOAD_CLASS) as Tree;
  const link = elements(tree).find((element) => element.props.class === LINK_CLASS) as Tree;

  assert.equal(button.props.hidden, true);
  assert.equal(iframeOf(tree), undefined);
  assert.equal(link.props.href, WATCH);
});

test("the island refuses a non-https address, so a bad attribute loads nothing", () => {
  const created = [] as EmbedFrame[];
  const embedRoot = new FakeElement({ embed: "http://example.com/page", title: TITLE });
  load(embedRoot, fakeEnv(created));
  assert.deepEqual(created, []);
  assert.equal(embedRoot.dataset.loaded, undefined);
  assert.equal(embedRoot.dataset.state, undefined);
});

test("activateAll reveals the button in every embed on the page without requesting anything", () => {
  const first = new FakeElement({ embed: EMBED, title: TITLE });
  const firstButton = new FakeElement({}, true);
  const second = new FakeElement({ embed: EMBED, title: TITLE });
  const secondButton = new FakeElement({}, true);
  first.set(LOAD_SELECTOR, firstButton);
  second.set(LOAD_SELECTOR, secondButton);
  const created: EmbedFrame[] = [];
  const doc: EmbedDocument = {
    querySelectorAll(selector: string) {
      assert.equal(selector, EMBED_SELECTOR);
      return [first, second];
    },
    createElement() {
      const frame = new FakeFrame();
      created.push(frame);
      return frame;
    },
  };

  activateAll(doc, fakeEnv(created));

  assert.equal(firstButton.hidden, false);
  assert.equal(secondButton.hidden, false);
  assert.equal(created.length, 0);
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
