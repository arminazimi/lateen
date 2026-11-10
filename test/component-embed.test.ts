import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "@velella/mizzen/contracts";
import embed, { DIAGNOSTIC_CLASS, EMBED_CLASS, embedSrc, type EmbedProps, youtubeId } from "../components/embed/index.ts";

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

const css = readFileSync(stylePath, "utf8");
const TITLE = "Big Buck Bunny";

test("default export is the embed component", () => {
  assert.equal(typeof embed, "function");
});

test("renders an iframe in a frame, lazy and without a full referrer", () => {
  const tree = render({ src: "https://example.com/page", title: TITLE }) as Tree;
  assert.equal(tree.type, "div");
  assert.equal(tree.props.class, EMBED_CLASS);
  const frame = iframeOf(tree);
  assert.equal(frame?.props.src, "https://example.com/page");
  assert.equal(frame?.props.title, TITLE);
  assert.equal(frame?.props.loading, "lazy");
  assert.equal(frame?.props.referrerpolicy, "strict-origin-when-cross-origin");
  assert.equal(frame?.props.allowfullscreen, true);
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

test("a missing or blank title renders a diagnostic and no iframe", () => {
  for (const title of [undefined, "", "   "]) {
    const props: EmbedProps = title === undefined ? { src: "https://example.com/page" } : { src: "https://example.com/page", title };
    const tree = render(props) as Tree;
    assert.equal(tree.type, "p");
    assert.equal(tree.props.class, DIAGNOSTIC_CLASS);
    assert.equal(iframeOf(tree), undefined);
    assert.match(textOf(tree), /missing a title/);
  }
});

test("the title is trimmed before it names the frame", () => {
  const frame = iframeOf(render({ src: "https://example.com/page", title: "  Demo  " }));
  assert.equal(frame?.props.title, "Demo");
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
    assert.equal(embedSrc(src), "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", src);
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

test("style.css keeps the frame at a fixed 16:9 aspect ratio and fills it with the iframe", () => {
  assert.match(css, /\.embed\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.embed-iframe\s*\{[^}]*position:\s*absolute/);
});
