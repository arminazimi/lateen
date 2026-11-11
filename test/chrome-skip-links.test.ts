import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { h } from "preact";
import type { ChromeProps, LayoutProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import skipLinks, { MAIN_ID, NAVIGATION_ID } from "../chrome/skip-links/index.ts";
import {
  activate,
  fragmentId,
  release,
  type SkipClickEvent,
  type SkipDocument,
  type SkipLink,
  type SkipTarget,
} from "../chrome/skip-links/client.ts";
import base from "../layouts/base.ts";
import home from "../layouts/home.ts";
import notFound from "../layouts/not-found.ts";

const pos: SourcePos = { file: "docs/index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "",
    lang: "en",
    dir: "ltr",
    languages: [],
    source: ".",
    include: [],
    exclude: [],
    navigation: "_data/navigation.yml",
    defaults: [],
    theme: { options: {} },
    search: { text: 300 },
    redirects: {},
    outputs: {},
    ...overrides,
  };
}

function pageAt(lang = "en"): Page {
  return {
    url: "/",
    source: pos,
    frontMatter: {},
    title: "Home",
    lang,
    dir: lang === "en" ? "ltr" : "rtl",
    headings: [],
    html: "<p>Body</p>",
    markdown: "",
    kind: "doc",
  };
}

const tree: NavTree = {
  main: [
    { title: "Home", url: "/" },
    { title: "Guide", children: [{ title: "Install", url: "/guide/install/" }] },
  ],
};

function props(nav: NavTree, lang = "en"): LayoutProps {
  const page = pageAt(lang);
  const site: Site = { config: configWith({ lang, dir: lang === "en" ? "ltr" : "rtl" }), pages: [page], nav, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: {},
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

function chromeProps(nav: NavTree, lang = "en"): ChromeProps {
  const { site, page, trail, pager } = props(nav, lang);
  return { site, page, trail, pager };
}

type VNode = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

const VOID = new Set(["meta", "link", "input"]);

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : html(children)}</${tag}>`;
}

/** Every in-page link must lead to an element that exists. */
function assertTargets(document: string): void {
  for (const match of document.matchAll(/href="#([^"]+)"/g)) {
    assert.match(document, new RegExp(`id="${match[1]}"`), `#${match[1]} has no target`);
  }
}

test("the first link is always the content link", () => {
  assert.equal(html(skipLinks(chromeProps({}))), `<a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`);
});

test("the navigation link appears only when the site has navigation", () => {
  assert.doesNotMatch(html(skipLinks(chromeProps({}))), new RegExp(NAVIGATION_ID));
  assert.doesNotMatch(html(skipLinks(chromeProps({ main: [] }))), new RegExp(NAVIGATION_ID));

  const out = html(skipLinks(chromeProps(tree)));
  assert.match(out, new RegExp(`<a class="skip-link" href="#${NAVIGATION_ID}">Skip to navigation</a>`));
});

test("content comes before navigation", () => {
  const out = html(skipLinks(chromeProps(tree)));
  assert.ok(out.indexOf(`#${MAIN_ID}`) < out.indexOf(`#${NAVIGATION_ID}`));
});

test("the labels follow the page language", () => {
  const fa = html(skipLinks(chromeProps(tree, "fa")));
  assert.match(fa, />رفتن به محتوا</);
  assert.match(fa, />رفتن به ناوبری</);

  const ar = html(skipLinks(chromeProps(tree, "ar")));
  assert.match(ar, />انتقال إلى المحتوى</);
  assert.match(ar, />انتقال إلى التنقل</);
});

test("the base shell places both links and gives the sidebar column the navigation id", () => {
  const out = html(base({ ...props(tree), sidebar: h("nav", { "aria-label": "Site navigation" }, "S") }));
  assert.match(out, new RegExp(`<body><a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`));
  assert.match(out, new RegExp(`<a class="skip-link" href="#${NAVIGATION_ID}">Skip to navigation</a>`));
  assert.match(out, new RegExp(`<div class="sidebar" id="${NAVIGATION_ID}"><nav aria-label="Site navigation">S</nav></div>`));
  assert.match(out, new RegExp(`<main id="${MAIN_ID}"`));
  assert.equal(out.match(/aria-label="Site navigation"/g)?.length, 1, "one navigation landmark, named once");
  assertTargets(out);
});

test("the base shell leaves out the navigation link when it places no sidebar", () => {
  const out = html(base(props(tree)));
  assert.doesNotMatch(out, new RegExp(NAVIGATION_ID));
  assertTargets(out);
});

test("home and 404 keep every skip link target", () => {
  for (const layout of [home, notFound]) {
    const out = html(layout(props(tree)));
    assert.match(out, new RegExp(`<a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`));
    assert.doesNotMatch(out, new RegExp(NAVIGATION_ID));
    assertTargets(out);
  }
});

test("style.css keeps the links out of sight until focus, with token values only", () => {
  const css = readFileSync(new URL("../chrome/skip-links/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);

  assert.match(css, /\.skip-link \{[\s\S]*transform: translateY\(-200%\);/);
  assert.match(css, /\.skip-link:focus \{\n {2}transform: none;\n\}/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
});

/* The client island: a real page shape with both destinations, as layouts/base.ts writes them. */
const PAGE = [
  '<!DOCTYPE html><html lang="en" dir="ltr"><body>',
  `<a class="skip-link" href="#${MAIN_ID}">Skip to content</a>`,
  `<a class="skip-link" href="#${NAVIGATION_ID}">Skip to navigation</a>`,
  `<main id="${MAIN_ID}" tabindex="-1"><p>Body</p></main>`,
  `<div class="sidebar" id="${NAVIGATION_ID}"><nav aria-label="Site navigation">S</nav></div>`,
  '<a class="skip-link" href="#missing">Skip nowhere</a>',
  "</body></html>",
].join("");

function skipDom() {
  const dom = new JSDOM(PAGE);
  const raw = dom.window.document;
  const links = [...raw.querySelectorAll(".skip-link")] as unknown as SkipLink[];
  return {
    dom,
    raw,
    doc: raw as unknown as SkipDocument,
    links,
    main: raw.getElementById(MAIN_ID)!,
    nav: raw.getElementById(NAVIGATION_ID)!,
  };
}

/** Activate a link the way Enter or a press does: a cancelable click that still bubbles. */
function click(element: Element, dom: JSDOM): MouseEvent {
  const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

afterEach(release);

test("fragmentId reads a same-page fragment and nothing else", () => {
  assert.equal(fragmentId(`#${MAIN_ID}`), MAIN_ID);
  assert.equal(fragmentId(`#${NAVIGATION_ID}`), NAVIGATION_ID);
  assert.equal(fragmentId("#"), undefined);
  assert.equal(fragmentId(""), undefined);
  assert.equal(fragmentId("https://example.com/#main"), undefined);
});

test("the static links need no island: plain anchors, existing targets, no focus attributes", () => {
  const out = html(base({ ...props(tree), sidebar: h("nav", { "aria-label": "Site navigation" }, "S") }));
  const anchors = [...out.matchAll(/<a class="skip-link"[^>]*>/g)].map((match) => match[0]);
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) assert.match(anchor, /^<a class="skip-link" href="#[^"]+">$/, "a plain fragment link");
  assert.match(out, new RegExp(`id="${MAIN_ID}"`));
  assert.match(out, new RegExp(`id="${NAVIGATION_ID}"`));
});

test("wiring focuses nothing on its own, and hash changes never move focus", () => {
  const { dom, raw, doc, links } = skipDom();
  assert.equal(activate(links, doc), 3);
  assert.equal(raw.activeElement, raw.body, "loading the island does not steal focus");

  raw.body.focus();
  dom.window.dispatchEvent(new dom.window.Event("hashchange"));
  assert.equal(raw.activeElement, raw.body, "an unrelated hash change leaves focus alone");
});

test("activation moves focus to main content and keeps its own tabindex", () => {
  const { dom, raw, doc, links, main } = skipDom();
  activate(links, doc);

  const event = click(raw.querySelector(`a[href="#${MAIN_ID}"]`)!, dom);
  assert.equal(event.defaultPrevented, false, "the fragment is still followed normally");
  assert.equal(raw.activeElement, main);
  assert.equal(main.getAttribute("tabindex"), "-1", "the layout's own tabindex is untouched");
});

test("activation moves focus to navigation with temporary focusability, then puts it back", () => {
  const { dom, raw, doc, links, nav } = skipDom();
  activate(links, doc);

  const event = click(raw.querySelector(`a[href="#${NAVIGATION_ID}"]`)!, dom);
  assert.equal(event.defaultPrevented, false);
  assert.equal(raw.activeElement, nav);
  assert.equal(nav.getAttribute("tabindex"), "-1");

  nav.blur();
  assert.equal(raw.activeElement, raw.body);
  assert.equal(nav.hasAttribute("tabindex"), false, "the temporary attribute is removed on blur");
});

test("repeated activation keeps one temporary attribute and still cleans it on blur", () => {
  const { dom, raw, doc, links, nav } = skipDom();
  activate(links, doc);
  const link = raw.querySelector(`a[href="#${NAVIGATION_ID}"]`)!;

  click(link, dom);
  click(link, dom);
  assert.equal(raw.activeElement, nav);
  assert.deepEqual(
    [...nav.attributes].map((attribute) => attribute.name),
    ["class", "id", "tabindex"],
    "no second attribute is added",
  );

  nav.blur();
  assert.equal(nav.hasAttribute("tabindex"), false);
});

test("a target that is already focusable keeps its own tabindex value", () => {
  const { dom, raw, doc, links, nav } = skipDom();
  nav.setAttribute("tabindex", "0");
  activate(links, doc);

  click(raw.querySelector(`a[href="#${NAVIGATION_ID}"]`)!, dom);
  assert.equal(raw.activeElement, nav);
  assert.equal(nav.getAttribute("tabindex"), "0", "the page's own value is not overwritten");

  nav.blur();
  assert.equal(nav.getAttribute("tabindex"), "0", "and it is not removed");
});

test("a missing target leaves ordinary fragment navigation usable", () => {
  const { dom, raw, doc, links } = skipDom();
  activate(links, doc);

  const event = click(raw.querySelector('a[href="#missing"]')!, dom);
  assert.equal(event.defaultPrevented, false);
  assert.equal(raw.activeElement, raw.body);
  assert.equal(raw.querySelectorAll("[tabindex]").length, 1, "only the layout's main carries tabindex");
});

test("a click another handler already took is left alone", () => {
  const { dom, raw, doc, links } = skipDom();
  activate(links, doc);

  const link = raw.querySelector(`a[href="#${NAVIGATION_ID}"]`)!;
  const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
  event.preventDefault();
  link.dispatchEvent(event);
  assert.equal(raw.activeElement, raw.body);
  assert.equal(raw.getElementById(NAVIGATION_ID)!.hasAttribute("tabindex"), false);
});

test("a target whose focus API is missing or throws leaves navigation usable", () => {
  let listener: ((event: SkipClickEvent) => void) | undefined;
  let focused = 0;
  let attributes = 0;
  const link: SkipLink = {
    getAttribute: (name) => (name === "href" ? "#main" : null),
    addEventListener: (type, next) => {
      assert.equal(type, "click");
      listener = next;
    },
  };
  const target: SkipTarget = {
    getAttribute: () => null,
    setAttribute: () => {
      attributes += 1;
    },
    removeAttribute: () => {},
    focus: () => {
      focused += 1;
      throw new Error("focus is unavailable");
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const doc: SkipDocument = { activeElement: null, getElementById: () => target };

  assert.equal(activate([link], doc), 1);
  let prevented = 0;
  const event = { preventDefault: () => void (prevented += 1) } as SkipClickEvent;
  assert.doesNotThrow(() => listener?.(event));
  assert.equal(prevented, 0, "the link is not taken over");
  assert.equal(focused, 1);
  assert.equal(attributes, 0, "a failed focus adds no temporary attribute");
});
