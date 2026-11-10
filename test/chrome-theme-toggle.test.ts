import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import themeToggle from "../chrome/theme-toggle/index.ts";
import {
  activate,
  announce,
  apply,
  choose,
  next,
  read,
  resolve,
  save,
  sync,
  type ThemeEnv,
  type ThemeStorage,
  type ThemeToggleRoot,
} from "../chrome/theme-toggle/client.ts";
import { THEME_KEY } from "../layouts/base.ts";

/** The switch reads no props; the engine passes ChromeProps anyway. */
const noopProps = {} as never;
const render = () => html(themeToggle(noopProps));

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

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

/** An in-memory store over `THEME_KEY` that records what was written. */
function store(saved?: string): ThemeStorage & { written: string | undefined } {
  const fake = {
    written: undefined as string | undefined,
    getItem: (key: string) => (key === THEME_KEY && saved !== undefined ? saved : null),
    setItem: (key: string, value: string) => {
      if (key === THEME_KEY) fake.written = value;
    },
  };
  return fake;
}

/** A store whose every access throws, as private browsing can. */
function brokenStore(): ThemeStorage {
  return {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
}

/** A switch root with a button, a status region, and the click listeners that were wired. */
function fakeToggle(): ThemeToggleRoot & {
  attrs: Record<string, string>;
  button: { attrs: Record<string, string>; textContent: string | null; setAttribute(n: string, v: string): void };
  clicks: Array<(event: { target?: unknown }) => void>;
  status: { textContent: string | null; setAttribute(n: string, v: string): void };
} {
  const element = () => {
    const el = {
      attrs: {} as Record<string, string>,
      textContent: "" as string | null,
      setAttribute(name: string, value: string) {
        el.attrs[name] = value;
      },
    };
    return el;
  };
  const fake = {
    hidden: true,
    attrs: {} as Record<string, string>,
    button: element(),
    status: element(),
    clicks: [] as Array<(event: { target?: unknown }) => void>,
    setAttribute(name: string, value: string) {
      fake.attrs[name] = value;
    },
    querySelector(selector: string) {
      if (selector === ".theme-toggle-button") return fake.button;
      if (selector === ".theme-toggle-status") return fake.status;
      return null;
    },
    addEventListener(type: string, listener: (event: { target?: unknown }) => void) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
  };
  return fake;
}

/** An environment with a plain store, a `<html>` that records its attributes, and a light OS. */
function env<S extends ThemeStorage>(
  storage: S,
  prefersLight = false,
): ThemeEnv & { attrs: Record<string, string>; storage: S } {
  const fake = {
    attrs: {} as Record<string, string>,
    storage,
    prefersLight,
    root: {
      setAttribute(name: string, value: string) {
        fake.attrs[name] = value;
      },
    },
  };
  return fake;
}

test("renders a hidden switch with data-theme-toggle, one named button, and a status region", () => {
  const out = render();

  assert.match(out, /^<span class="theme-toggle" data-theme-toggle hidden>/);
  assert.match(out, /<button class="theme-toggle-button" type="button" aria-label="Color theme">/);
  assert.match(out, /<span class="theme-toggle-status" role="status"><\/span>/);
  assert.doesNotMatch(out, /<input|<fieldset|checked/);
});

test("draws a sun, a screen, and a moon, in the order a press cycles", () => {
  const out = render();

  const kinds = [...out.matchAll(/theme-toggle-icon theme-toggle-icon-([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(kinds, ["light", "system", "dark"]);
});

test("resolve: system follows the OS, light and dark win as stored", () => {
  assert.equal(resolve("system", true), "light");
  assert.equal(resolve("system", false), "dark");
  assert.equal(resolve("light", false), "light");
  assert.equal(resolve("dark", true), "dark");
});

test("read: the three choices pass; anything else, nothing stored, or a broken store reads as system", () => {
  assert.equal(read(store("light")), "light");
  assert.equal(read(store("system")), "system");
  assert.equal(read(store("dark")), "dark");
  assert.equal(read(store("banana")), "system");
  assert.equal(read(store()), "system");
  assert.equal(read(brokenStore()), "system");
});

test("save: writes under the key the theme script reads, and survives a broken store", () => {
  const fake = store();
  save(fake, "dark");
  assert.equal(fake.written, "dark");

  assert.doesNotThrow(() => save(brokenStore(), "light"));
});

test("apply: sets data-theme on the root, resolving system", () => {
  const lightPage = env(store(), true);
  apply(lightPage, "system");
  assert.equal(lightPage.attrs["data-theme"], "light");

  const darkPage = env(store(), false);
  apply(darkPage, "system");
  assert.equal(darkPage.attrs["data-theme"], "dark");

  const chosen = env(store(), true);
  apply(chosen, "dark");
  assert.equal(chosen.attrs["data-theme"], "dark");
});

test("next: light, then system, then dark, then light again", () => {
  assert.equal(next("light"), "system");
  assert.equal(next("system"), "dark");
  assert.equal(next("dark"), "light");
});

test("sync: reveals the switch, marks the choice, and labels the button with it and the next one", () => {
  const toggle = fakeToggle();
  sync(toggle, "dark");
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.attrs["data-choice"], "dark");
  assert.equal(toggle.button.attrs["aria-label"], "Color theme: Dark. Switch to light.");
});

test("announce: names the choice on the status region", () => {
  for (const choice of ["light", "system", "dark"] as const) {
    const toggle = fakeToggle();
    announce(toggle, choice);
    assert.equal(toggle.status.textContent, `${choice[0]!.toUpperCase()}${choice.slice(1)} theme.`);
  }
});

test("activate: reveals, shows and applies the saved choice, and listens for clicks", () => {
  const toggle = fakeToggle();
  const page = env(store("light"));
  activate(toggle, page);

  assert.equal(toggle.hidden, false);
  assert.equal(toggle.attrs["data-choice"], "light");
  assert.equal(page.attrs["data-theme"], "light");
  assert.equal(toggle.clicks.length, 1);
});

test("activate with nothing stored: system is the default choice and follows the OS", () => {
  const toggle = fakeToggle();
  const page = env(store(), false);
  activate(toggle, page);

  assert.equal(toggle.attrs["data-choice"], "system");
  assert.equal(page.attrs["data-theme"], "dark");
});

test("every click saves, applies, reflects, and announces the next choice", () => {
  const toggle = fakeToggle();
  const page = env(store("light"));
  activate(toggle, page);

  toggle.clicks[0]!({});
  assert.equal(page.storage.written, "system");
  assert.equal(toggle.attrs["data-choice"], "system");
  assert.equal(toggle.status.textContent, "System theme.");

  toggle.clicks[0]!({});
  assert.equal(page.storage.written, "dark");
  assert.equal(page.attrs["data-theme"], "dark");
  assert.equal(toggle.status.textContent, "Dark theme.");

  toggle.clicks[0]!({});
  assert.equal(page.storage.written, "light");
  assert.equal(page.attrs["data-theme"], "light");
});

test("choose: the whole change works without an event, in order", () => {
  const toggle = fakeToggle();
  const page = env(store("system"), true);
  choose(page, toggle, "light");

  assert.equal(page.storage.written, "light");
  assert.equal(page.attrs["data-theme"], "light");
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.status.textContent, "Light theme.");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/theme-toggle/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css draws one icon at a time, hides only the status region visually, and uses logical properties", () => {
  const css = readFileSync(new URL("../chrome/theme-toggle/style.css", import.meta.url), "utf8");

  assert.match(css, /\.theme-toggle-status \{[^}]*clip-path: inset\(50%\)/);
  assert.match(css, /\.theme-toggle\[hidden\] \{\n  display: none;/);
  assert.match(css, /\.theme-toggle\[data-choice="dark"\] \.theme-toggle-icon-dark/);
  assert.match(css, /\.theme-toggle-button:focus-visible \{/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
