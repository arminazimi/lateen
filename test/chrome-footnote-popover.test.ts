import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { Fragment } from "preact";
import type { ChromeProps, Head, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import footnotePopover, { hasFootnoteRefs, POPOVER_ID } from "../chrome/footnote-popover/index.ts";
import {
  activate,
  definitionText,
  targetId,
  type FootnoteDocument,
  type FootnotePopover,
  type FootnoteRef,
} from "../chrome/footnote-popover/client.ts";
import base from "../layouts/base.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const config: SiteConfig = {
  title: "Example",
  base: "/example",
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
};

/** Markup in the shape remark-gfm writes: a reference in the text, its note at the end, a back-link in the note. */
const REF =
  '<p>Use it<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup>.</p>';
const DEFINITION =
  '<section data-footnotes class="footnotes"><h2 id="footnote-label">Footnotes</h2><ol><li id="user-content-fn-1"><p>A note with &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more. <a href="#user-content-fnref-1" data-footnote-backref aria-label="Back to reference 1">↩</a></p></li></ol></section>';
const NOTE = 'A note with <script>alert("x")</script> & more.';
const POPOVER = `<span id="${POPOVER_ID}" class="footnote-popover" role="tooltip" data-footnote-popover hidden></span>`;

function pageWith(html: string, kind: Page["kind"] = "doc"): Page {
  return {
    url: "/example/guide/install/",
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html,
    markdown: "",
    kind,
  };
}

function props(html: string, kind: Page["kind"] = "doc"): ChromeProps {
  const page = pageWith(html, kind);
  const site: Site = { config, pages: [page], nav: {}, data: {} };
  return { site, page, trail: [], pager: {} };
}

const head: Head = { title: "Install · Example", meta: [], links: [], jsonLd: [] };

function layoutProps(html: string): LayoutProps {
  return { ...props(html), head, islands: [] };
}

type VNode = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string }; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function htmlOf(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(htmlOf).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return htmlOf(node.props.children);
  if (typeof node.type === "function") return htmlOf((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  if (tag === "meta" || tag === "link") return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${dangerouslySetInnerHTML ? dangerouslySetInnerHTML.__html : htmlOf(children)}</${tag}>`;
}

/** A page document with real GFM-shaped footnote markup. */
function domFor(body: string) {
  const dom = new JSDOM(`<!DOCTYPE html><html lang="en" dir="ltr"><body>${body}</body></html>`);
  const raw = dom.window.document;
  const refElements = [...raw.querySelectorAll("[data-footnote-ref]")];
  return {
    dom,
    raw,
    refElements,
    refs: refElements as unknown as FootnoteRef[],
    popover: raw.querySelector("[data-footnote-popover]") as unknown as FootnotePopover,
    popoverElement: raw.querySelector("[data-footnote-popover]") as unknown as { innerHTML: string },
  };
}

/** Fires a listener type on an element without needing the DOM lib. */
function fire(element: unknown, dom: JSDOM, type: string): void {
  (element as { dispatchEvent(event: unknown): boolean }).dispatchEvent(new dom.window.Event(type));
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("hasFootnoteRefs recognises a GFM reference and nothing else", () => {
  assert.equal(hasFootnoteRefs(REF), true);
  assert.equal(hasFootnoteRefs('<a data-footnote-ref=""></a>'), true);
  assert.equal(hasFootnoteRefs("<p>No notes.</p>"), false);
  assert.equal(hasFootnoteRefs('<a data-footnote-reference="x"></a>'), false);
});

test("renders nothing on a page without a reference, or outside a doc page", () => {
  assert.equal(footnotePopover(props("<p>No notes.</p>")), null);
  assert.equal(footnotePopover(props(REF, "app")), null);
});

test("renders one hidden tooltip mount point on a doc page with a reference", () => {
  const out = htmlOf(footnotePopover(props(REF)));

  assert.match(
    out,
    new RegExp(`^<span id="${POPOVER_ID}" class="footnote-popover" role="tooltip" hidden data-footnote-popover></span>$`),
  );
});

test("the base layout places the mount point once, and only when the page has a reference", () => {
  const withNotes = htmlOf(base(layoutProps(REF + DEFINITION)));
  assert.equal(withNotes.match(/data-footnote-popover/g)?.length, 1, "exactly one mount point");
  assert.ok(withNotes.indexOf("data-footnote-popover") > withNotes.indexOf("</main>"), "the mount point follows the page");

  const withoutNotes = htmlOf(base(layoutProps("<p>No notes.</p>")));
  assert.doesNotMatch(withoutNotes, /data-footnote-popover/);
});

test("targetId reads a same-page fragment, and definitionText copies the note without its back-links", () => {
  const { raw, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  assert.equal(activate(refs, popover, raw as unknown as FootnoteDocument), true);

  assert.equal(targetId("#user-content-fn-1"), "user-content-fn-1");
  assert.equal(targetId("#a%20b"), "a b");
  assert.equal(targetId("#"), undefined);
  assert.equal(targetId("https://example.com/#fn-1"), undefined);
  assert.equal(definitionText(raw as unknown as FootnoteDocument, "#user-content-fn-1"), NOTE);
  assert.equal(definitionText(raw as unknown as FootnoteDocument, "#missing"), undefined);
  assert.equal(definitionText(raw as unknown as FootnoteDocument, "https://example.com/#fn-1"), undefined);

  const backrefs = raw.querySelectorAll("[data-footnote-backref]");
  assert.equal(backrefs.length, 1, "the definition's back-link is untouched");
  assert.equal(backrefs[0]?.getAttribute("href"), "#user-content-fnref-1");
});

test("hover shows the note beside the reference and leaving hides it", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  assert.equal(activate(refs, popover, raw as unknown as FootnoteDocument), true);

  fire(refElements[0], dom, "mouseenter");
  assert.equal(popover.hidden, false);
  assert.equal(popover.textContent, NOTE);
  assert.equal(refs[0]?.getAttribute("aria-describedby"), POPOVER_ID);
  assert.equal(refs[0]?.parentNode?.getAttribute("data-footnote-anchor"), "true");
  assert.equal(refElements[0]?.getAttribute("href"), "#user-content-fn-1", "the link still points at the note");

  fire(refElements[0], dom, "mouseleave");
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label", "the reference keeps its own description");
});

test("focus shows the note and blur hides it", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false);
  assert.equal(popover.textContent, NOTE);

  fire(refElements[0], dom, "blur");
  assert.equal(popover.hidden, true);
});

test("Escape hides an open popover from anywhere in the document", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false);

  (raw as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");
});

test("escape on a closed page changes nothing and does not prevent the key's own action", () => {
  const { dom, raw, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  const event = new dom.window.KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  (raw as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(popover.hidden, true);
});

test("no references: activate reports that it wired nothing", () => {
  const { raw, popover } = domFor(DEFINITION + POPOVER);
  const listened: string[] = [];
  const doc = {
    getElementById: () => null,
    addEventListener: (type: string) => {
      listened.push(type);
    },
  } as unknown as FootnoteDocument;

  assert.equal(activate([], popover, doc), false);
  assert.deepEqual(listened, [], "no key listener is added without a reference");
  assert.equal(popover.hidden, true);
  assert.equal(raw.querySelectorAll("[data-footnote-ref]").length, 0);
});

test("a note's markup is written as text, never parsed as HTML", () => {
  const { dom, raw, refElements, refs, popover, popoverElement } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "mouseenter");
  assert.equal(popover.textContent, NOTE);
  assert.match(popoverElement.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(popoverElement.innerHTML, /<script>/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/footnote-popover/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);
});

test("style.css opens the tooltip with logical insets and raw-value-free tokens", () => {
  const css = readFileSync(new URL("../chrome/footnote-popover/style.css", import.meta.url), "utf8");

  assert.match(css, /\.footnote-popover\[hidden\] \{\n  display: none;/);
  assert.match(css, /inset-block-start: 100%/);
  assert.match(css, /inset-inline-start: 0/);
  assert.match(css, /text-align: start/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /\b(?:margin|padding|border)-(?:left|right|top|bottom)\b/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\s*\(/i);
  assert.doesNotMatch(css, /\b\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh)\b/);
});
