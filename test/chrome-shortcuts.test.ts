import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { ChromeProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import shortcuts, { SHORTCUTS, SHORTCUTS_TITLE_ID } from "../chrome/shortcuts/index.ts";
import {
  activate,
  isShortcutsShortcut,
  isTypingTarget,
  type ShortcutsClose,
  type ShortcutsDialog,
  type ShortcutsDocument,
  type ShortcutsEvent,
  type ShortcutsFocus,
  type ShortcutsParts,
} from "../chrome/shortcuts/client.ts";
import { isSearchShortcut } from "../chrome/search/shortcut.ts";
import { stringsOf } from "../i18n/index.ts";
import base from "../layouts/base.ts";

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

const config: SiteConfig = {
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
};

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

function props(overrides: Partial<Page> = {}): ChromeProps {
  const page = pageWith(overrides);
  const site: Site = { config, pages: [page], nav: { main: [] }, data: {} };
  return { site, page, trail: [], pager: {} };
}

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  const VOID = new Set(["meta", "link", "input"]);
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

const out = (overrides: Partial<Page> = {}) => html(shortcuts(props(overrides)));

test("renders a closed, hidden dialog named by its heading", () => {
  const rendered = out();

  assert.match(rendered, /^<dialog class="shortcuts" data-shortcuts="" aria-labelledby="shortcuts-title" hidden>/);
  assert.doesNotMatch(rendered, /<dialog[^>]* open/);
  assert.match(rendered, /<\/dialog>$/);
  assert.match(
    rendered,
    new RegExp(`<h2 class="shortcuts-title" id="${SHORTCUTS_TITLE_ID}">Keyboard shortcuts</h2>`),
  );
  assert.match(rendered, /<dl class="shortcuts-list">/);
});

test("lists every shortcut the theme defines, and says which ones need JavaScript", () => {
  const rendered = out();
  const keys = [...rendered.matchAll(/<kbd class="shortcut-key">([^<]*)<\/kbd>/g)].map((match) => match[1]);

  assert.deepEqual(keys, ["/", "Ctrl/Cmd+K", "m", "?"]);
  assert.deepEqual(
    SHORTCUTS.map((shortcut) => shortcut.label),
    ["search", "copy_page_md", "shortcuts_open"],
  );
  assert.ok(SHORTCUTS.every((shortcut) => shortcut.needsScript), "every theme shortcut is a client island");
  assert.match(rendered, /<dd class="shortcut-action">Search<span class="shortcut-needs-js">Needs JavaScript<\/span><\/dd>/);
  assert.match(rendered, /<dd class="shortcut-action">Copy page as Markdown<span class="shortcut-needs-js">/);
  assert.match(rendered, /<dd class="shortcut-action">Show this dialog<span class="shortcut-needs-js">/);
  assert.equal([...rendered.matchAll(/class="shortcut-needs-js"/g)].length, 3);
});

test("the heading, close label, dialog label, and notes follow the page language", () => {
  for (const lang of ["fa", "ar"] as const) {
    const rendered = out({ lang, dir: "rtl" });
    const strings = stringsOf(lang);

    assert.ok(rendered.includes(strings.shortcuts_title ?? "missing title"), `${lang} title`);
    assert.ok(rendered.includes(strings.shortcuts_close ?? "missing close"), `${lang} close label`);
    assert.ok(rendered.includes(strings.shortcuts_open ?? "missing open"), `${lang} open label`);
    assert.ok(rendered.includes(strings.shortcuts_needs_js ?? "missing note"), `${lang} needs-JS note`);
  }
});

test("the base layout places one dialog and no id appears twice", () => {
  const rendered = html(
    base({
      ...props(),
      head: { title: "Example", meta: [], links: [], jsonLd: [] },
      islands: [],
    }),
  );

  assert.equal([...rendered.matchAll(/data-shortcuts=""/g)].length, 1);
  const ids = [...rendered.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
  assert.equal(ids.filter((id) => id === SHORTCUTS_TITLE_ID).length, 1);
  assert.equal(new Set(ids).size, ids.length, "no id is written twice");
});

interface FakeDialog extends Omit<ShortcutsDialog, "open"> {
  open: boolean;
  shows: number;
  closes: number;
  fire(type: "keydown" | "close", event: ShortcutsEvent): void;
}

function fakeDialog(): FakeDialog {
  const listeners: Record<string, Array<(event: ShortcutsEvent) => void>> = {};
  const dialog: FakeDialog = {
    open: false,
    hidden: true,
    shows: 0,
    closes: 0,
    showModal() {
      dialog.shows += 1;
      dialog.open = true;
    },
    close() {
      dialog.closes += 1;
      if (!dialog.open) return;
      dialog.open = false;
      dialog.fire("close", { target: dialog, preventDefault() {} });
    },
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    fire(type, event) {
      for (const listener of listeners[type] ?? []) listener(event);
    },
  };
  return dialog;
}

function fakeClose(): ShortcutsClose & { clicks: number; fire(): void } {
  const listeners: Array<() => void> = [];
  const close = {
    clicks: 0,
    addEventListener(type: "click", listener: () => void) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    fire() {
      close.clicks += 1;
      for (const listener of listeners) listener();
    },
  };
  return close;
}

function fakeFocus(name: string) {
  const focus: ShortcutsFocus & { name: string; focused: number } = {
    name,
    focused: 0,
    focus() {
      focus.focused += 1;
    },
  };
  return focus;
}

function fakeDocument(activeElement: ShortcutsFocus | null = null) {
  const listeners: Array<(event: ShortcutsEvent) => void> = [];
  const document: ShortcutsDocument & { fire(event: ShortcutsEvent): void } = {
    activeElement,
    addEventListener(type, listener, options) {
      assert.equal(type, "keydown");
      assert.equal(options?.capture, true, "`?` is handled before the search shortcut's bubble listener");
      listeners.push(listener);
    },
    fire(event: ShortcutsEvent) {
      for (const listener of listeners) listener(event);
    },
  };
  return document;
}

function key(
  name: string,
  target: unknown,
  modifiers: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): ShortcutsEvent & { prevented: boolean; stopped: boolean } {
  const event: ShortcutsEvent & { prevented: boolean; stopped: boolean } = {
    key: name,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    target,
    prevented: false,
    stopped: false,
    preventDefault() {
      event.prevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
  };
  return event;
}

function partsOf() {
  const dialog = fakeDialog();
  const close = fakeClose();
  const parts: ShortcutsParts = { dialog, close };
  return { dialog, close, parts };
}

test("`?` opens the dialog, reveals it, and remembers the focused element", () => {
  const { dialog, parts } = partsOf();
  const opener = fakeFocus("content");
  const document = fakeDocument(opener);
  activate(parts, { document });

  const event = key("?", { tagName: "BODY" });
  document.fire(event);

  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(dialog.hidden, false);
  assert.equal(dialog.shows, 1);
  assert.equal(dialog.open, true);
});

test("`?` in a field the reader is typing in stays an ordinary character", () => {
  const { dialog, parts } = partsOf();
  const document = fakeDocument(fakeFocus("content"));
  activate(parts, { document });

  for (const target of [
    { tagName: "INPUT" },
    { tagName: "textarea" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
  ]) {
    const event = key("?", target);
    document.fire(event);

    assert.equal(event.prevented, false);
    assert.equal(dialog.shows, 0);
  }
});

test("other keys, and `?` with a command modifier, do not open the dialog", () => {
  const { dialog, parts } = partsOf();
  const document = fakeDocument(fakeFocus("content"));
  activate(parts, { document });

  for (const event of [
    key("/", { tagName: "BODY" }),
    key("k", { tagName: "BODY" }, { meta: true }),
    key("?", { tagName: "BODY" }, { ctrl: true }),
    key("?", { tagName: "BODY" }, { alt: true }),
  ]) {
    document.fire(event);
  }

  assert.equal(dialog.shows, 0);
});

test("Escape closes the dialog and focus returns to the element that opened it", () => {
  const { dialog, parts } = partsOf();
  const opener = fakeFocus("content");
  const document = fakeDocument(opener);
  activate(parts, { document });

  document.fire(key("?", { tagName: "BODY" }));
  assert.equal(dialog.open, true);

  const escape = key("Escape", dialog);
  dialog.fire("keydown", escape);

  assert.equal(escape.prevented, true);
  assert.equal(dialog.open, false);
  assert.equal(opener.focused, 1);
});

test("the close button also returns focus to the opener", () => {
  const { dialog, close, parts } = partsOf();
  const opener = fakeFocus("content");
  const document = fakeDocument(opener);
  activate(parts, { document });

  document.fire(key("?", { tagName: "BODY" }));
  close.fire();

  assert.equal(dialog.closes, 1);
  assert.equal(dialog.open, false);
  assert.equal(opener.focused, 1);
});

test("/ still opens search, and ? never does", () => {
  assert.equal(isSearchShortcut({ key: "/", preventDefault() {} }, "MacIntel"), true);
  assert.equal(isSearchShortcut({ key: "/", shiftKey: true, preventDefault() {} }, "Win32"), true);
  assert.equal(isSearchShortcut({ key: "?", preventDefault() {} }, "MacIntel"), false);
  assert.equal(isSearchShortcut({ key: "?", shiftKey: true, preventDefault() {} }, "Win32"), false);

  assert.equal(isShortcutsShortcut({ key: "?", shiftKey: true, preventDefault() {} }), true);
  assert.equal(isShortcutsShortcut({ key: "/", preventDefault() {} }), false);
});

test("the typing predicate recognises fields and contenteditable elements", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(undefined), false);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/shortcuts/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css uses logical properties and keeps the dialog hidden without JavaScript", () => {
  const css = readFileSync(new URL("../chrome/shortcuts/style.css", import.meta.url), "utf8");
  const declarations = css.replace(/@media[^{]*\{/g, "");

  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.shortcuts\[hidden\] \{/);
  assert.match(css, /\.shortcuts::backdrop \{/);
});
