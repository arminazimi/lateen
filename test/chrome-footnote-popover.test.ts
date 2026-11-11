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
const REF_2 =
  '<p>Again<sup><a href="#user-content-fn-2" id="user-content-fnref-2" data-footnote-ref aria-describedby="footnote-label">2</a></sup>.</p>';
const NOTE_ONE =
  '<li id="user-content-fn-1"><p>A note with &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more. <a href="#user-content-fnref-1" data-footnote-backref aria-label="Back to reference 1">↩</a></p></li>';
const NOTE_TWO =
  '<li id="user-content-fn-2"><p>Second note. <a href="#user-content-fnref-2" data-footnote-backref aria-label="Back to reference 2">↩</a></p></li>';
const DEFINITION = `<section data-footnotes class="footnotes"><h2 id="footnote-label">Footnotes</h2><ol>${NOTE_ONE}</ol></section>`;
const TWO_DEFINITIONS = `<section data-footnotes class="footnotes"><h2 id="footnote-label">Footnotes</h2><ol>${NOTE_ONE}${NOTE_TWO}</ol></section>`;
const NOTE = 'A note with <script>alert("x")</script> & more.';
const NOTE_2 = "Second note.";
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

/** Fires a pointer event of a given type (mouse, pen, or touch) on an element. */
function firePointer(element: unknown, dom: JSDOM, type: string, pointerType: string): void {
  const event = new dom.window.Event(type);
  Object.assign(event, { pointerType });
  (element as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
}

/** A reference that records which listeners the island adds and removes, backed by a real element. */
function track(ref: FootnoteRef): { ref: FootnoteRef; added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  return {
    added,
    removed,
    ref: {
      getAttribute: (name) => ref.getAttribute(name),
      setAttribute: (name, value) => ref.setAttribute(name, value),
      removeAttribute: (name) => ref.removeAttribute(name),
      get parentNode() {
        return ref.parentNode;
      },
      addEventListener(type, listener) {
        added.push(type);
        ref.addEventListener(type, listener);
      },
      removeEventListener(type, listener) {
        removed.push(type);
        ref.removeEventListener(type, listener);
      },
    },
  };
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
  assert.equal(typeof activate(refs, popover, raw as unknown as FootnoteDocument), "function");

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

test("entering a reference with a pointer shows the note and leaving hides it", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  assert.equal(typeof activate(refs, popover, raw as unknown as FootnoteDocument), "function");

  firePointer(refElements[0], dom, "pointerenter", "mouse");
  assert.equal(popover.hidden, false);
  assert.equal(popover.textContent, NOTE);
  assert.equal(refs[0]?.getAttribute("aria-describedby"), `footnote-label ${POPOVER_ID}`);
  assert.equal(refs[0]?.parentNode?.getAttribute("data-footnote-anchor"), "true");
  assert.equal(refElements[0]?.getAttribute("href"), "#user-content-fn-1", "the link still points at the note");

  fire(refElements[0], dom, "pointerleave");
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label", "the reference keeps its own description");
});

test("mouse, pen, and touch pointers all reveal the same note", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  for (const pointerType of ["mouse", "pen", "touch"]) {
    firePointer(refElements[0], dom, "pointerenter", pointerType);
    assert.equal(popover.hidden, false, `${pointerType} reveals the note`);
    assert.equal(popover.textContent, NOTE, `${pointerType} reveals the same text`);

    fire(refElements[0], dom, "pointerleave");
    assert.equal(popover.hidden, true, `${pointerType} leaving hides the note`);
  }
});

test("a cancelled pointer hides the note and restores the reference's own description", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  firePointer(refElements[0], dom, "pointerenter", "touch");
  assert.equal(popover.hidden, false);

  fire(refElements[0], dom, "pointercancel");
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");
});

test("focus shows the note and blur hides it", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false);
  assert.equal(popover.textContent, NOTE);

  fire(refElements[0], dom, "blur");
  assert.equal(popover.hidden, true);
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");
});

test("rapid pointer and focus changes leave one active reference described, with no stale text", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + REF_2 + TWO_DEFINITIONS + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.textContent, NOTE);
  assert.equal(refs[0]?.getAttribute("aria-describedby"), `footnote-label ${POPOVER_ID}`);

  // The pointer engages the second reference while the first still has focus: the pointer wins.
  firePointer(refElements[1], dom, "pointerenter", "pen");
  assert.equal(popover.textContent, NOTE_2);
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label", "the first reference is restored");
  assert.equal(refs[1]?.getAttribute("aria-describedby"), `footnote-label ${POPOVER_ID}`);

  // The pointer leaves: the still-focused first reference shows again, with no stale second note.
  fire(refElements[1], dom, "pointerleave");
  assert.equal(popover.textContent, NOTE);
  assert.equal(refs[1]?.getAttribute("aria-describedby"), "footnote-label");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), `footnote-label ${POPOVER_ID}`);

  fire(refElements[0], dom, "blur");
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");
});

test("Escape dismisses the note without moving focus, and engaging again previews it", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false);
  assert.equal(refElements[0]?.getAttribute("href"), "#user-content-fn-1", "focus never enters the tooltip");

  (raw as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");

  // A late blur or pointer leave must not resurrect the dismissed note.
  fire(refElements[0], dom, "blur");
  fire(refElements[0], dom, "pointerleave");
  assert.equal(popover.hidden, true);

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false, "focusing again reveals the note");
});

test("escape on a closed page changes nothing and does not prevent the key's own action", () => {
  const { dom, raw, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  const event = new dom.window.KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  (raw as unknown as { dispatchEvent(event: unknown): boolean }).dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(popover.hidden, true);
});

test("a missing or malformed target previews nothing and leaves no stale note behind", () => {
  const broken =
    '<p><a href="#missing" data-footnote-ref aria-describedby="footnote-label">?</a> <a href="https://example.com/#fn-9" data-footnote-ref aria-describedby="footnote-label">x</a></p>';
  const { dom, raw, refElements, refs, popover } = domFor(REF + broken + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  firePointer(refElements[0], dom, "pointerenter", "mouse");
  assert.equal(popover.textContent, NOTE);

  firePointer(refElements[1], dom, "pointerenter", "mouse");
  assert.equal(popover.hidden, true, "a reference to a missing definition shows nothing");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label", "the previous note is put away");

  firePointer(refElements[2], dom, "pointerenter", "mouse");
  assert.equal(popover.hidden, true, "an external link never qualifies as a definition");
  assert.equal(refs[1]?.getAttribute("aria-describedby"), "footnote-label");

  fire(refElements[2], dom, "pointerleave");
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
});

test("cleanup removes every listener and puts the reference and tooltip back", () => {
  const { dom, raw, refElements, refs, popover } = domFor(REF + DEFINITION + POPOVER);
  const tracked = track(refs[0]!);
  const stop = activate([tracked.ref], popover, raw as unknown as FootnoteDocument);

  assert.deepEqual(tracked.added.sort(), ["blur", "focus", "pointercancel", "pointerenter", "pointerleave"]);
  assert.ok(!tracked.added.includes("click"), "no click handler can suppress the link's navigation");

  fire(refElements[0], dom, "focus");
  assert.equal(popover.hidden, false);

  stop();
  assert.deepEqual(tracked.removed.sort(), ["blur", "focus", "pointercancel", "pointerenter", "pointerleave"]);
  assert.equal(popover.hidden, true);
  assert.equal(popover.textContent, "");
  assert.equal(refs[0]?.getAttribute("aria-describedby"), "footnote-label");

  fire(refElements[0], dom, "focus");
  firePointer(refElements[0], dom, "pointerenter", "touch");
  assert.equal(popover.hidden, true, "no listener survives cleanup");
});

test("no references: activate wires nothing and its cleanup is harmless", () => {
  const { raw, popover } = domFor(DEFINITION + POPOVER);
  const listened: string[] = [];
  const doc = {
    getElementById: () => null,
    addEventListener: (type: string) => {
      listened.push(type);
    },
    removeEventListener: (type: string) => {
      listened.push(`remove:${type}`);
    },
  } as unknown as FootnoteDocument;

  const stop = activate([], popover, doc);
  assert.equal(typeof stop, "function");
  assert.deepEqual(listened, [], "no key listener is added without a reference");
  stop();
  assert.deepEqual(listened, [], "cleanup has nothing to remove");
  assert.equal(popover.hidden, true);
  assert.equal(raw.querySelectorAll("[data-footnote-ref]").length, 0);
});

test("without the island the reference and its back-link still navigate and the tooltip is inert", () => {
  const { raw } = domFor(REF + DEFINITION + POPOVER);
  const ref = raw.querySelector("[data-footnote-ref]");
  const back = raw.querySelector("[data-footnote-backref]");
  const popover = raw.querySelector("[data-footnote-popover]");

  assert.equal(ref?.getAttribute("href"), "#user-content-fn-1", "the note is still one click away");
  assert.equal(back?.getAttribute("href"), "#user-content-fnref-1", "the back-link still returns");
  assert.equal(popover?.hasAttribute("hidden"), true, "the mount point starts out of sight");
  assert.equal(popover?.querySelectorAll("a, button, input, select, textarea, [tabindex]").length, 0);
  assert.equal(raw.querySelectorAll("[data-footnote-ref]").length, 1);
});

test("a note's markup is written as text, never parsed as HTML", () => {
  const { dom, raw, refElements, refs, popover, popoverElement } = domFor(REF + DEFINITION + POPOVER);
  activate(refs, popover, raw as unknown as FootnoteDocument);

  firePointer(refElements[0], dom, "pointerenter", "mouse");
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
