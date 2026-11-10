import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "@velella/mizzen/contracts";
import figure, { creditHref, dimension, type FigureProps } from "../components/figure/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/figure/style.css");
const namesPath = join(root, "tokens/names.json");

/** The parts of a preact VNode the assertions read. */
type Tree = { type: string; props: { children?: unknown; [key: string]: unknown } };
type Node = Tree | string | number | null | undefined | boolean;

function render(props: FigureProps, html = "") {
  const input = {
    props,
    html,
    page: {} as ComponentProps["page"],
    site: {} as ComponentProps["site"],
  } as ComponentProps<FigureProps>;
  return figure(input) as unknown as Node;
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

function imagesOf(node: Node): Tree[] {
  return elements(node).filter((element) => element.type === "img");
}

function find(node: Node, className: string): Tree | undefined {
  return elements(node).find((element) => element.props.class === className);
}

function textOf(node: Node): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node !== "object") return "";
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  return (list as Node[]).map(textOf).join("");
}

const css = readFileSync(stylePath, "utf8");

test("default export is the figure component", () => {
  assert.equal(typeof figure, "function");
});

test("renders a figure with the image, lazy loading, and async decoding by default", () => {
  const tree = render({ src: "/a.png", alt: "A chart" }) as Tree;
  assert.equal(tree.type, "figure");
  assert.equal(tree.props.class, "figure");
  const [img] = imagesOf(tree);
  assert.equal(img?.props.src, "/a.png");
  assert.equal(img?.props.alt, "A chart");
  assert.equal(img?.props.loading, "lazy");
  assert.equal(img?.props.decoding, "async");
  assert.equal(img?.props.class, "figure-img");
});

test("a missing or blank src renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ src: "   " }), null);
});

test("a missing alt is empty, which marks the image as decorative", () => {
  const [img] = imagesOf(render({ src: "/a.png" }));
  assert.equal(img?.props.alt, "");
});

test("width and height are set on the image to reserve its space", () => {
  const [img] = imagesOf(render({ src: "/a.png", width: "640", height: "360" }));
  assert.equal(img?.props.width, 640);
  assert.equal(img?.props.height, 360);
});

test("a width or height that is not a whole number above zero is left off", () => {
  assert.equal(dimension("640"), 640);
  assert.equal(dimension(" 12 "), 12);
  assert.equal(dimension("0"), undefined);
  assert.equal(dimension("-3"), undefined);
  assert.equal(dimension("3.5"), undefined);
  assert.equal(dimension("auto"), undefined);
  assert.equal(dimension(undefined), undefined);
  const [img] = imagesOf(render({ src: "/a.png", width: "wide", height: "0" }));
  assert.equal(img?.props.width, undefined);
  assert.equal(img?.props.height, undefined);
});

test("loading and decoding accept their listed values and fall back otherwise", () => {
  const [eager] = imagesOf(render({ src: "/a.png", loading: "eager", decoding: "sync" }));
  assert.equal(eager?.props.loading, "eager");
  assert.equal(eager?.props.decoding, "sync");
  const [odd] = imagesOf(render({ src: "/a.png", loading: "soon", decoding: "later" }));
  assert.equal(odd?.props.loading, "lazy");
  assert.equal(odd?.props.decoding, "async");
});

test("srcset and sizes are passed to the image", () => {
  const [img] = imagesOf(render({ src: "/a.png", srcset: "/a-2x.png 2x", sizes: "50vw" }));
  assert.equal(img?.props.srcset, "/a-2x.png 2x");
  assert.equal(img?.props.sizes, "50vw");
});

test("with src_dark the figure carries both images, and the dark one is marked", () => {
  const tree = render({ src: "/light.png", src_dark: "/dark.png", alt: "Diagram" }) as Tree;
  assert.equal(tree.props.class, "figure figure-paired");
  const images = imagesOf(tree);
  assert.equal(images.length, 2);
  assert.equal(images[0]?.props.class, "figure-img figure-img-light");
  assert.equal(images[0]?.props.src, "/light.png");
  assert.equal(images[1]?.props.class, "figure-img figure-img-dark");
  assert.equal(images[1]?.props.src, "/dark.png");
  assert.equal(images[1]?.props.alt, "Diagram");
  assert.equal(images[1]?.props.loading, "lazy");
});

test("the dark image gets the same size as the light one", () => {
  const images = imagesOf(render({ src: "/l.png", src_dark: "/d.png", width: "320", height: "200" }));
  for (const img of images) {
    assert.equal(img.props.width, 320);
    assert.equal(img.props.height, 200);
  }
});

test("src_dark equal to src, or blank, gives one image and no pair", () => {
  for (const src_dark of ["/a.png", "  "]) {
    const tree = render({ src: "/a.png", src_dark }) as Tree;
    assert.equal(tree.props.class, "figure");
    assert.equal(imagesOf(tree).length, 1);
  }
});

test("the caption is the caption prop", () => {
  const tree = render({ src: "/a.png", caption: "Figure 1: load over time" });
  const caption = find(tree, "figure-caption") as Tree;
  assert.equal(caption.type, "figcaption");
  assert.equal(textOf(find(tree, "figure-text")), "Figure 1: load over time");
});

test("without a caption prop the directive body is the caption, as HTML", () => {
  const tree = render({ src: "/a.png" }, "<p>Load over <em>time</em></p>");
  const text = find(tree, "figure-text") as Tree;
  assert.deepEqual(text.props.dangerouslySetInnerHTML, { __html: "<p>Load over <em>time</em></p>" });
});

test("the caption prop wins over the body", () => {
  const tree = render({ src: "/a.png", caption: "Prop" }, "<p>Body</p>");
  assert.equal(textOf(find(tree, "figure-text")), "Prop");
  assert.equal(find(tree, "figure-text")?.props.dangerouslySetInnerHTML, undefined);
});

test("no figcaption is rendered without a caption, a body, or a credit", () => {
  const tree = render({ src: "/a.png" }, "  ") as Tree;
  assert.equal(elements(tree).some((element) => element.type === "figcaption"), false);
});

test("a credit appears under the caption, linked only for web addresses", () => {
  const linked = render({ src: "/a.png", credit: "Ada", credit_url: "https://example.com/ada" });
  const anchor = elements(linked).find((element) => element.type === "a") as Tree;
  assert.equal(anchor.props.href, "https://example.com/ada");
  assert.equal(textOf(anchor), "Ada");

  const unsafe = render({ src: "/a.png", credit: "Ada", credit_url: "javascript:alert(1)" });
  assert.equal(elements(unsafe).some((element) => element.type === "a"), false);
  assert.equal(textOf(find(unsafe, "figure-credit")), "Ada");
});

test("creditHref accepts only http and https", () => {
  assert.equal(creditHref("https://example.com"), "https://example.com");
  assert.equal(creditHref(" HTTP://example.com "), "HTTP://example.com");
  assert.equal(creditHref("//example.com"), undefined);
  assert.equal(creditHref("data:text/html,x"), undefined);
  assert.equal(creditHref(undefined), undefined);
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

test("style.css swaps the paired images by data-theme and by the system setting", () => {
  assert.match(css, /:root\[data-theme="dark"\] \.figure-paired \.figure-img-light\s*\{\s*display:\s*none/);
  assert.match(css, /:root\[data-theme="dark"\] \.figure-paired \.figure-img-dark\s*\{\s*display:\s*block/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \.figure-paired \.figure-img-dark\s*\{\s*display:\s*block/);
});
