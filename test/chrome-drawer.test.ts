import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import drawer from "../chrome/drawer/index.ts";
import {
  activate,
  DESKTOP_QUERY,
  trap,
  type DrawerClickEvent,
  type DrawerControl,
  type DrawerDialog,
  type DrawerEnv,
  type DrawerEvent,
  type DrawerFocusable,
  type DrawerLink,
  type DrawerTarget,
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

test("the drawer markup is a no-JS sidebar: plain links, no scripts, nothing that only works when enhanced", () => {
  const out = html(drawer(props(tree, "/home/")));

  const anchors = [...out.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(anchors.length >= 3, "the sidebar links are rendered as anchors");
  for (const anchor of anchors) {
    assert.match(anchor, /\shref="\/[^"]+"/, "each link is a plain href the browser can follow without JavaScript");
    assert.doesNotMatch(anchor, /\son[a-z]+\b=/, "no inline handlers");
    assert.doesNotMatch(anchor, /\shref="javascript:/, "no script URLs");
    assert.doesNotMatch(anchor, /\sdata-[a-z-]+=/, "the drawer adds no JS-only hooks to the links");
    assert.doesNotMatch(anchor, /\shidden\b/, "every link is reachable in the no-JS flow");
  }
  assert.doesNotMatch(out, /\son[a-z]+\s*=/, "the drawer markup carries no inline handlers at all");
  assert.doesNotMatch(out, /data-enhanced/, "enhancement is applied by the script, not the markup");
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
function fakeDialog(items: DrawerFocusable[] = [], links: DrawerLink[] = []) {
  const listeners: Record<string, Array<(event: DrawerEvent) => void>> = {};
  const fake = {
    open: false,
    attrs: {} as Record<string, string>,
    shows: 0,
    closes: 0,
    items,
    links,
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
      return [...fake.items, ...fake.links];
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

/**
 * A fake navigation link inside the drawer. `fire` plays the browser's click dispatch (an ordinary
 * activation carries no modifiers and no `button`), and `prevented` says whether the drawer cancelled it.
 */
function link(href: string) {
  const listeners: Array<(event: DrawerClickEvent) => void> = [];
  const fake: {
    href: string;
    focused: number;
    clicks: typeof listeners;
    prevented?: boolean;
    focus(): void;
    addEventListener(type: string, listener: (event: DrawerClickEvent) => void): void;
    fire(modifiers?: Partial<DrawerClickEvent>): void;
  } = {
    href,
    focused: 0,
    clicks: listeners,
    focus() {
      fake.focused += 1;
    },
    addEventListener(type: string, listener: (event: DrawerClickEvent) => void) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    fire(modifiers: Partial<DrawerClickEvent> = {}) {
      const event: DrawerClickEvent = {
        target: fake,
        preventDefault() {
          fake.prevented = true;
        },
        ...modifiers,
      };
      fake.prevented = false;
      for (const listener of listeners) listener(event);
    },
  };
  return fake;
}

/** The page the drawer sits on: its address, and the elements same-page links can land on. */
function pageEnv(href: string, targets: Record<string, DrawerTarget> = {}): DrawerEnv {
  return { location: { href }, locate: (fragment: string) => targets[fragment] };
}

/** A same-page destination, counting the drawer's moves on it. */
function destination() {
  const fake = {
    scrolled: 0,
    focused: 0,
    scrollIntoView() {
      fake.scrolled += 1;
    },
    focus() {
      fake.focused += 1;
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

/** The browser's media query list: `change` listeners hear every crossing of the breakpoint. */
function fakeViewport(matches: boolean) {
  const listeners: Array<() => void> = [];
  const viewport = {
    matches,
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "change");
      listeners.push(listener);
    },
    resize(next: boolean) {
      viewport.matches = next;
      for (const listener of listeners) listener();
    },
  };
  return viewport;
}

test("a press on the modal backdrop closes the drawer and returns focus to the menu button", () => {
  const button = control("menu");
  const dialog = fakeDialog();
  activate({ dialog, button: button as unknown as DrawerControl });
  button.clicks[0]!();

  dialog.fire("click", { target: dialog, preventDefault() {} });

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 1);
});

test("a press inside the drawer is left to the control under it", () => {
  const { first, items } = panel();
  const button = control("menu");
  const dialog = fakeDialog(items);
  activate({ dialog, button: button as unknown as DrawerControl });
  button.clicks[0]!();

  dialog.fire("click", { target: first, preventDefault() {} });

  assert.equal(dialog.open, true);
});

test("crossing to the desktop layout closes the drawer without focusing the menu button it hides", () => {
  const button = control("menu");
  const dialog = fakeDialog();
  const viewport = fakeViewport(false);
  activate({ dialog, button: button as unknown as DrawerControl }, { viewport });
  button.clicks[0]!();

  viewport.resize(true);

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 0, "the header hides the menu button at desktop width");

  // The next ordinary close still returns focus to the menu button.
  button.clicks[0]!();
  dialog.fire("keydown", key("Escape", undefined));
  assert.equal(button.focused, 1);
});

test("a viewport change that stays narrow, or arrives while the drawer is closed, is ignored", () => {
  const button = control("menu");
  const dialog = fakeDialog();
  const viewport = fakeViewport(false);
  activate({ dialog, button: button as unknown as DrawerControl }, { viewport });

  viewport.resize(true);
  assert.equal(dialog.closes, 0, "a closed drawer is left closed");

  button.clicks[0]!();
  viewport.resize(false);
  assert.equal(dialog.open, true);
  assert.equal(dialog.closes, 0);
});

test("an ordinary page link click closes the drawer and clears aria-expanded without cancelling the click", () => {
  const button = control("menu");
  const page = link("https://example.test/guide/quickstart/");
  const dialog = fakeDialog([], [page]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  page.fire();

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(page.prevented, false, "the browser still does the navigation");
  assert.equal(button.focused, 1, "the close keeps the existing focus-return rule");
});

test("a same-page link closes the drawer and clears aria-expanded before the destination is revealed", () => {
  const button = control("menu");
  const at = destination();
  const anchor = link("https://example.test/guide/install/#quickstart");
  let ariaAtArrival: string | undefined;
  let openAtArrival: boolean | undefined;
  let dialog: ReturnType<typeof fakeDialog>;
  const record: DrawerTarget = {
    scrollIntoView() {
      ariaAtArrival = button.attrs["aria-expanded"];
      openAtArrival = dialog.open;
      at.scrollIntoView();
    },
    focus: at.focus,
  };
  dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/", {
    quickstart: record,
  }));
  button.clicks[0]!();

  anchor.fire();

  assert.equal(ariaAtArrival, "false", "aria-expanded is cleared as the destination is revealed");
  assert.equal(openAtArrival, false, "the dialog is closed before the destination is revealed");
  assert.equal(at.scrolled, 1);
  assert.equal(at.focused, 1);
  assert.equal(button.focused, 0, "the destination takes focus, not the menu button");
  assert.equal(anchor.prevented, false);
});

test("a same-page link with no target on the page still closes, with the usual focus return", () => {
  const button = control("menu");
  const anchor = link("https://example.test/guide/install/#missing");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  anchor.fire();

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 1);
});

test("a link to the same page without a fragment closes like any other page link", () => {
  const button = control("menu");
  const anchor = link("https://example.test/guide/install/");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  anchor.fire();

  assert.equal(dialog.open, false);
  assert.equal(button.focused, 1);
});

test("a link to another page with a fragment is not treated as same-page arrival", () => {
  const button = control("menu");
  const at = destination();
  const anchor = link("https://example.test/guide/quickstart/#install");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/", {
    install: at,
  }));
  button.clicks[0]!();

  anchor.fire();

  assert.equal(dialog.open, false);
  assert.equal(at.scrolled, 0, "the destination of another page is left to that page");
  assert.equal(at.focused, 0);
  assert.equal(button.focused, 1);
});

test("an external link click closes the drawer but keeps the browser's behavior", () => {
  const button = control("menu");
  const anchor = link("https://elsewhere.test/docs/");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  anchor.fire({ button: 0 });

  assert.equal(dialog.open, false);
  assert.equal(anchor.prevented, false);
});

test("modified and cancelled activations are not hijacked: the drawer stays open", () => {
  const button = control("menu");
  const anchor = link("https://example.test/guide/quickstart/");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  for (const modifiers of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
  ]) {
    anchor.fire(modifiers);
    assert.equal(dialog.open, true, `the drawer survives ${JSON.stringify(modifiers)}`);
  }
  assert.equal(button.attrs["aria-expanded"], "true");
});

test("a keyboard-activated link closes the drawer like a pointer click", () => {
  const button = control("menu");
  const anchor = link("https://example.test/guide/quickstart/");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));
  button.clicks[0]!();

  // Enter or Space on the focused link makes the browser dispatch an unmodified click.
  anchor.fire({ shiftKey: false });

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
});

test("the drawer is wired once: links hear clicks without a second activation, and a crossing after a link close is quiet", () => {
  const button = control("menu");
  const at = destination();
  const anchor = link("https://example.test/guide/install/#quickstart");
  const dialog = fakeDialog([], [anchor]);
  const viewport = fakeViewport(false);
  activate(
    { dialog, button: button as unknown as DrawerControl },
    { ...pageEnv("https://example.test/guide/install/", { quickstart: at }), viewport },
  );
  assert.equal(anchor.clicks.length, 1, "activate wires each link once");

  button.clicks[0]!();
  anchor.fire();
  assert.equal(dialog.closes, 1);

  viewport.resize(true);
  assert.equal(dialog.closes, 1, "the desktop transition leaves the already-closed drawer alone");
  assert.equal(at.focused, 1);
  assert.equal(button.focused, 0);
});

test("a control that is not a link is never treated as one", () => {
  const button = control("menu");
  const { items } = panel();
  const dialog = fakeDialog(items);
  activate({ dialog, button: button as unknown as DrawerControl }, pageEnv("https://example.test/guide/install/"));

  for (const item of items) {
    assert.equal((item as { clicks?: unknown[] }).clicks?.length ?? 0, 0, "plain controls hear no navigation wiring");
  }
});

test("without a page env, links still close the drawer", () => {
  const button = control("menu");
  const anchor = link("#quickstart");
  const dialog = fakeDialog([], [anchor]);
  activate({ dialog, button: button as unknown as DrawerControl });
  button.clicks[0]!();

  anchor.fire();

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 1, "with no page to arrive on, the usual focus return stands");
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

test("the header shows the menu button at the same breakpoint the drawer replaces the sidebar", () => {
  const header = readFileSync(new URL("../chrome/header/style.css", import.meta.url), "utf8");
  const drawer = readFileSync(new URL("../chrome/drawer/style.css", import.meta.url), "utf8");

  const block = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(header);
  assert.ok(block, "the header has a block at the drawer's breakpoint");
  assert.match(block[1]!, /\.header-menu/, "the menu button appears whenever the sidebar leaves");
  assert.match(drawer, /@media \(max-width: 767\.98px\)/);
  assert.equal(DESKTOP_QUERY, "(min-width: 768px)", "the viewport check matches the CSS breakpoint");
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
