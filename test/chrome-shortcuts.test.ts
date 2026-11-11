import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { Fragment, h } from "preact";
import type { ChromeProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import shortcuts, { SHORTCUTS, SHORTCUTS_TITLE_ID, SHORTCUTS_TOGGLE_ID } from "../chrome/shortcuts/index.ts";
import {
  activate,
  isShortcutsShortcut,
  isTypingTarget,
  type ShortcutsClose,
  type ShortcutsDialog,
  type ShortcutsDocument,
  type ShortcutsEvent,
  type ShortcutsFocus,
  type ShortcutsOpen,
  type ShortcutsParts,
  type ShortcutsToggle,
} from "../chrome/shortcuts/client.ts";
import {
  OFF,
  resetShortcutsPreference,
  STORAGE_KEY,
  type ShortcutStorage,
} from "../chrome/shortcuts/preference.ts";
import { isSearchShortcut } from "../chrome/search/shortcut.ts";
import { stringsOf } from "../i18n/index.ts";
import base from "../layouts/base.ts";

beforeEach(() => resetShortcutsPreference());

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

test("renders a hidden launcher and a closed, hidden dialog named by its heading", () => {
  const rendered = out();

  assert.match(
    rendered,
    /^<button type="button" class="shortcuts-open" hidden data-shortcuts-open="" aria-haspopup="dialog">/,
  );
  assert.match(rendered, /<span class="shortcuts-open-label">Keyboard shortcuts<\/span><\/button>/);
  assert.match(rendered, /<dialog class="shortcuts" data-shortcuts="" aria-labelledby="shortcuts-title" hidden>/);
  assert.doesNotMatch(rendered, /<dialog[^>]* open/);
  assert.match(rendered, /<\/dialog>$/);
  assert.match(
    rendered,
    new RegExp(`<h2 class="shortcuts-title" id="${SHORTCUTS_TITLE_ID}">Keyboard shortcuts</h2>`),
  );
  assert.match(rendered, /<dl class="shortcuts-list">/);
});

test("the dialog carries a labelled preference for the unmodified character shortcuts", () => {
  const rendered = out();
  const strings = stringsOf("en");

  assert.match(
    rendered,
    /<div class="shortcuts-preference"><input type="checkbox" id="shortcuts-toggle" class="shortcuts-toggle" data-shortcuts-toggle="" aria-describedby="shortcuts-hint" checked>/,
  );
  assert.match(rendered, /<label class="shortcuts-preference-label" for="shortcuts-toggle">Enable single-key shortcuts<\/label>/);
  assert.ok(rendered.includes(strings.shortcuts_preference_hint ?? "missing hint"), "the hint is rendered");
  assert.ok(
    rendered.includes(`<p class="shortcuts-preference-hint" id="shortcuts-hint">${strings.shortcuts_preference_hint}</p>`),
    "the hint sits under the label",
  );
});

test("lists every shortcut the theme defines, and says which ones need JavaScript", () => {
  const rendered = out();
  const list = rendered.slice(rendered.indexOf('<dl class="shortcuts-list">'));
  const keys = [...list.matchAll(/<kbd class="shortcut-key">([^<]*)<\/kbd>/g)].map((match) => match[1]);

  assert.match(
    rendered,
    /class="shortcuts-open"[^>]*><kbd class="shortcut-key" aria-hidden="true">\?<\/kbd>/,
    "the launcher carries the key",
  );
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
    assert.ok(rendered.includes(strings.shortcuts_preference ?? "missing preference"), `${lang} preference label`);
    assert.ok(rendered.includes(strings.shortcuts_preference_hint ?? "missing hint"), `${lang} preference hint`);
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
  assert.equal([...rendered.matchAll(/data-shortcuts-open=""/g)].length, 1);
  const ids = [...rendered.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
  assert.equal(ids.filter((id) => id === SHORTCUTS_TITLE_ID).length, 1);
  assert.equal(ids.filter((id) => id === SHORTCUTS_TOGGLE_ID).length, 1);
  assert.equal(new Set(ids).size, ids.length, "no id is written twice");
});

interface FakeDialog extends Omit<ShortcutsDialog, "open"> {
  open: boolean;
  shows: number;
  closes: number;
  fire(type: "keydown" | "close" | "click", event: ShortcutsEvent): void;
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

function fakeOpen(): ShortcutsOpen & { hidden: boolean; clicks: number; fire(): void } {
  const listeners: Array<() => void> = [];
  const open = {
    hidden: true,
    clicks: 0,
    addEventListener(type: "click", listener: () => void) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    fire() {
      open.clicks += 1;
      for (const listener of listeners) listener();
    },
  };
  return open;
}

function fakeToggle(checked = true): ShortcutsToggle & { fire(): void } {
  const listeners: Array<() => void> = [];
  const toggle = {
    checked,
    addEventListener(type: "change", listener: () => void) {
      assert.equal(type, "change");
      listeners.push(listener);
    },
    fire() {
      for (const listener of listeners) listener();
    },
  };
  return toggle;
}

/** A storage that keeps its values in a map, the way a browser keeps them across a reload. */
function fakeStorage(values: Readonly<Record<string, string>> = {}): ShortcutStorage & { values: Map<string, string> } {
  const map = new Map(Object.entries(values));
  return {
    values: map,
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
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
  const open = fakeOpen();
  const toggle = fakeToggle();
  const parts: ShortcutsParts = { dialog, close, open, toggle };
  return { dialog, close, open, toggle, parts };
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

test("a press on the modal backdrop closes the dialog and returns focus to the opener", () => {
  const { dialog, parts } = partsOf();
  const opener = fakeFocus("content");
  const document = fakeDocument(opener);
  activate(parts, { document });

  document.fire(key("?", { tagName: "BODY" }));
  dialog.fire("click", { target: dialog, preventDefault() {} });

  assert.equal(dialog.open, false);
  assert.equal(dialog.closes, 1);
  assert.equal(opener.focused, 1);
});

test("a press on the shortcuts sheet is left to the control under it", () => {
  const { dialog, parts } = partsOf();
  const document = fakeDocument(fakeFocus("content"));
  activate(parts, { document });

  document.fire(key("?", { tagName: "BODY" }));
  dialog.fire("click", { target: fakeFocus("sheet"), preventDefault() {} });

  assert.equal(dialog.open, true);
});

test("the launcher is revealed, opens the dialog, and gets focus back when it closes", () => {
  const { dialog, close, open, parts } = partsOf();
  const opener = fakeFocus("launcher");
  const document = fakeDocument(opener);
  activate(parts, { document });

  assert.equal(open.hidden, false, "the launcher is revealed only with scripting");

  open.fire();
  assert.equal(open.clicks, 1);
  assert.equal(dialog.shows, 1);
  assert.equal(dialog.open, true);

  close.fire();
  assert.equal(dialog.open, false);
  assert.equal(opener.focused, 1);
});

test("the preference starts where storage left it and remembers every change", () => {
  const storage = fakeStorage({ [STORAGE_KEY]: OFF });
  const { toggle, parts } = partsOf();
  activate(parts, { document: fakeDocument(), storage });

  assert.equal(toggle.checked, false);

  toggle.checked = true;
  toggle.fire();
  assert.equal(storage.values.get(STORAGE_KEY), "on");

  toggle.checked = false;
  toggle.fire();
  assert.equal(storage.values.get(STORAGE_KEY), OFF);
});

test("with the shortcuts off, `?` types normally and the launcher is still the way in", () => {
  const storage = fakeStorage({ [STORAGE_KEY]: OFF });
  const { dialog, open, parts } = partsOf();
  const document = fakeDocument();
  activate(parts, { document, storage });

  const event = key("?", { tagName: "BODY" });
  document.fire(event);

  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false);
  assert.equal(dialog.shows, 0);

  open.fire();
  assert.equal(dialog.shows, 1);
});

test("a change in the dialog gates `?` at once, in both directions", () => {
  const storage = fakeStorage();
  const { dialog, toggle, parts } = partsOf();
  const document = fakeDocument();
  activate(parts, { document, storage });

  toggle.checked = false;
  toggle.fire();
  document.fire(key("?", { tagName: "BODY" }));
  assert.equal(dialog.shows, 0);

  toggle.checked = true;
  toggle.fire();
  document.fire(key("?", { tagName: "BODY" }));
  assert.equal(dialog.shows, 1);
});

test("blocked or corrupt storage reads as on and never stops the dialog or the launcher", () => {
  const blocked: ShortcutStorage = {
    getItem(): string | null {
      throw new Error("storage is blocked");
    },
    setItem(): void {
      throw new Error("storage is blocked");
    },
  };
  for (const storage of [blocked, fakeStorage({ [STORAGE_KEY]: "something-else" })]) {
    const { dialog, open, toggle, parts } = partsOf();
    const document = fakeDocument();
    activate(parts, { document, storage });

    assert.equal(toggle.checked, true);
    toggle.fire(); // a best-effort write must not throw

    document.fire(key("?", { tagName: "BODY" }));
    assert.equal(dialog.shows, 1);
    assert.equal(open.hidden, false);
  }
});

test("an explicit choice applies at once even when storage is blocked or read-only", () => {
  const blocked: ShortcutStorage = {
    getItem(): string | null {
      throw new Error("storage is blocked");
    },
    setItem(): void {
      throw new Error("storage is blocked");
    },
  };
  const readOnly: ShortcutStorage = {
    getItem: () => null,
    setItem(): void {
      throw new Error("storage is read-only");
    },
  };

  for (const storage of [blocked, readOnly]) {
    resetShortcutsPreference();
    const { dialog, toggle, parts } = partsOf();
    const document = fakeDocument();
    activate(parts, { document, storage });

    toggle.checked = false;
    toggle.fire();
    let event = key("?", { tagName: "BODY" });
    document.fire(event);
    assert.equal(event.prevented, false, "`?` should type normally after the explicit choice");
    assert.equal(dialog.shows, 0);

    toggle.checked = true;
    toggle.fire();
    event = key("?", { tagName: "BODY" });
    document.fire(event);
    assert.equal(event.prevented, true, "the choice can be turned back on without storage");
    assert.equal(dialog.shows, 1);
  }
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
