import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import drawer from "../chrome/drawer/index.ts";
import {
  activate,
  trap,
  type DrawerControl,
  type DrawerDialog,
  type DrawerEvent,
  type DrawerFocusable,
} from "../chrome/drawer/client.ts";

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

function pageAt(url: string): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Page" },
    title: "Page",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(nav: NavTree, url: string): ChromeProps {
  const page = pageAt(url);
  const site: Site = { config, pages: [page], nav, data: {} };
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
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

const tree: NavTree = {
  main: [
    { title: "Home", url: "/home/" },
    {
      title: "Guide",
      children: [
        { title: "Install", url: "/guide/install/" },
        { title: "Quickstart", url: "/guide/quickstart/" },
      ],
    },
  ],
};

test("renders nothing when there is no navigation to put in the drawer", () => {
  assert.equal(drawer(props({}, "/home/")), null);
  assert.equal(drawer(props({ main: [] }, "/home/")), null);
});

test("renders a closed dialog with the sidebar inside it and a hidden close button", () => {
  const out = html(drawer(props(tree, "/guide/install/")));

  assert.match(out, /^<dialog class="drawer" data-drawer aria-label="Menu">/);
  assert.doesNotMatch(out, /<dialog[^>]* open/);
  assert.match(
    out,
    /<button type="button" class="drawer-close" aria-label="Close menu" hidden data-drawer-close>/,
  );
  assert.match(out, /<nav class="sidebar-nav" aria-label="Site navigation">/);
  assert.match(out, /<a href="\/guide\/install\/" aria-current="page">Install<\/a>/);
  assert.ok(out.indexOf("drawer-close") < out.indexOf("sidebar-nav"), "close button comes before the sidebar");
  assert.match(out, /<\/nav><\/dialog>$/);
});

test("the drawer shows the same sidebar links as the sidebar chrome", () => {
  const out = html(drawer(props(tree, "/home/")));
  assert.match(out, /<a href="\/home\/" aria-current="page">Home<\/a>/);
  assert.match(out, /<h2>Guide<\/h2>/);
});

/** A focusable element in the fake dialog, recording focus moves. */
function control(name: string) {
  const fake = {
    name,
    focused: 0,
    hidden: false,
    attrs: {} as Record<string, string>,
    clicks: [] as Array<() => void>,
    focus() {
      fake.focused += 1;
    },
    setAttribute(key: string, value: string) {
      fake.attrs[key] = value;
    },
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
  };
  return fake;
}

/** A fake `<dialog>`: `showModal` and `close` flip `open`, and `close` fires the `close` listeners as a browser does. */
function fakeDialog(items: DrawerFocusable[] = []) {
  const listeners: Record<string, Array<(event: DrawerEvent) => void>> = {};
  const fake = {
    open: false,
    attrs: {} as Record<string, string>,
    shows: 0,
    closes: 0,
    items,
    setAttribute(key: string, value: string) {
      fake.attrs[key] = value;
    },
    showModal() {
      fake.shows += 1;
      fake.open = true;
    },
    close() {
      fake.closes += 1;
      if (!fake.open) return;
      fake.open = false;
      for (const listener of listeners.close ?? []) listener({ target: fake, preventDefault() {} });
    },
    querySelectorAll(selector: string): Iterable<DrawerFocusable> {
      assert.match(selector, /a\[href\]/);
      return fake.items;
    },
    addEventListener(type: string, listener: (event: DrawerEvent) => void) {
      (listeners[type] ??= []).push(listener);
    },
    fire(type: string, event: DrawerEvent) {
      for (const listener of listeners[type] ?? []) listener(event);
    },
  };
  return fake;
}

/** A key event with the target it was pressed on; `prevented` records whether the drawer stopped it. */
function key(name: string, target: unknown, shiftKey = false): DrawerEvent & { prevented: boolean } {
  const event: DrawerEvent & { prevented: boolean } = {
    key: name,
    shiftKey,
    target,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

/** Three links and a close button, in reading order. */
function panel() {
  const close = control("close");
  const first = control("first");
  const middle = control("middle");
  const last = control("last");
  return { close, first, middle, last, items: [close, first, middle, last] as unknown as DrawerFocusable[] };
}

test("activate reveals the menu button and the close button, and marks the drawer as enhanced", () => {
  const button = control("menu");
  const close = control("close");
  button.hidden = true;
  close.hidden = true;
  const dialog = fakeDialog();

  activate({ dialog, button: button as unknown as DrawerControl, closeButton: close as unknown as DrawerControl });

  assert.equal(button.hidden, false);
  assert.equal(close.hidden, false);
  assert.equal(dialog.attrs["data-enhanced"], "");
  assert.equal(dialog.open, false);
});

test("the menu button opens the dialog and sets aria-expanded; a second press does not reopen it", () => {
  const button = control("menu");
  const dialog = fakeDialog();
  activate({ dialog, button: button as unknown as DrawerControl });

  button.clicks[0]!();
  assert.equal(dialog.shows, 1);
  assert.equal(dialog.open, true);
  assert.equal(button.attrs["aria-expanded"], "true");

  button.clicks[0]!();
  assert.equal(dialog.shows, 1);
});

test("the close button closes the dialog, and closing returns focus to the menu button", () => {
  const button = control("menu");
  const close = control("close");
  const dialog = fakeDialog();
  activate({ dialog, button: button as unknown as DrawerControl, closeButton: close as unknown as DrawerControl });
  button.clicks[0]!();

  close.clicks[0]!();

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 1);
});

test("Escape closes the dialog and keeps the browser from doing it another way", () => {
  const button = control("menu");
  const dialog = fakeDialog();
  activate({ dialog, button: button as unknown as DrawerControl });
  button.clicks[0]!();

  const event = key("Escape", undefined);
  dialog.fire("keydown", event);

  assert.equal(event.prevented, true);
  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
});

test("Tab past the last control wraps to the first; Shift+Tab before the first wraps to the last", () => {
  const { close, last, items } = panel();
  const dialog = fakeDialog(items);

  const forward = key("Tab", last);
  trap(dialog, forward);
  assert.equal(forward.prevented, true);
  assert.equal(close.focused, 1);

  const inside = key("Tab", close);
  trap(dialog, inside);
  assert.equal(inside.prevented, false);

  const back = key("Tab", close, true);
  trap(dialog, back);
  assert.equal(back.prevented, true);
  assert.equal(last.focused, 1);
});

test("Tab between inner controls is left to the browser", () => {
  const { middle, items } = panel();
  const dialog = fakeDialog(items);

  const event = key("Tab", items[1]);
  trap(dialog, event);
  assert.equal(event.prevented, false);
  assert.equal(middle.focused, 0);
});

test("focus that has left the drawer is brought back to its first control", () => {
  const { close, items } = panel();
  const dialog = fakeDialog(items);

  const event = key("Tab", {});
  trap(dialog, event);
  assert.equal(event.prevented, true);
  assert.equal(close.focused, 1);
});

test("a drawer with no focusable control keeps Tab from leaving it", () => {
  const dialog = fakeDialog([]);
  const event = key("Tab", {});
  trap(dialog, event);
  assert.equal(event.prevented, true);
});

test("keys other than Tab and Escape are not touched", () => {
  const { items } = panel();
  const dialog = fakeDialog(items);
  const event = key("a", items[0]);
  trap(dialog, event);
  assert.equal(event.prevented, false);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/drawer/style.css", import.meta.url), "utf8");
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

test("style.css uses logical properties for every edge, and only the 768 px breakpoint for width", () => {
  const css = readFileSync(new URL("../chrome/drawer/style.css", import.meta.url), "utf8");
  const declarations = css.replace(/@media[^{]*\{/g, "");

  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /@media \(max-width: 767\.98px\)/);
  assert.match(css, /\.drawer\[data-enhanced\] \{/);
  assert.match(css, /\.drawer:not\(\[data-enhanced\]\) \{/);
});
