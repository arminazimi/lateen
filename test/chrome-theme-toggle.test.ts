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

/** A switch root with three radios, a status region, and the change listeners that were wired. */
function fakeToggle(): ThemeToggleRoot & {
  radios: Array<{ value: string; checked: boolean }>;
  changes: Array<(event: { target: unknown }) => void>;
  status: { textContent: string | null };
} {
  const fake = {
    hidden: true,
    radios: [
      { value: "light", checked: false },
      { value: "system", checked: false },
      { value: "dark", checked: false },
    ],
    changes: [] as Array<(event: { target: unknown }) => void>,
    status: { textContent: "" } as { textContent: string | null },
    querySelectorAll(selector: string) {
      assert.equal(selector, "input[type=radio]");
      return fake.radios;
    },
    querySelector(selector: string) {
      assert.equal(selector, ".theme-toggle-status");
      return fake.status;
    },
    addEventListener(type: string, listener: (event: { target: unknown }) => void) {
      assert.equal(type, "change");
      fake.changes.push(listener);
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

test("renders a hidden switch with data-theme-toggle, a named group, and a status region", () => {
  const out = render();

  assert.match(out, /^<fieldset class="theme-toggle" data-theme-toggle hidden>/);
  assert.match(out, /<legend class="theme-toggle-legend">Color theme<\/legend>/);
  assert.match(out, /<p class="theme-toggle-status" role="status"><\/p>/);
});

test("offers light, system, and dark in that order, none pre-checked", () => {
  const out = render();

  const values = [...out.matchAll(/<input class="theme-toggle-input" type="radio" name="color-theme" value="([a-z]+)">/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(values, ["light", "system", "dark"]);
  assert.match(out, /<span class="theme-toggle-option-text">Light<\/span>/);
  assert.match(out, /<span class="theme-toggle-option-text">System<\/span>/);
  assert.match(out, /<span class="theme-toggle-option-text">Dark<\/span>/);
  assert.doesNotMatch(out, /checked/);
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

test("sync: reveals the switch and checks the one radio for the choice", () => {
  const toggle = fakeToggle();
  sync(toggle, "dark");
  assert.equal(toggle.hidden, false);
  assert.deepEqual(
    toggle.radios.map((radio) => radio.checked),
    [false, false, true],
  );
});

test("announce: names the choice on the status region", () => {
  for (const choice of ["light", "system", "dark"] as const) {
    const toggle = fakeToggle();
    announce(toggle, choice);
    assert.equal(toggle.status.textContent, `${choice[0]!.toUpperCase()}${choice.slice(1)} theme.`);
  }
});

test("activate: reveals, shows and applies the saved choice, and listens for changes", () => {
  const toggle = fakeToggle();
  const page = env(store("light"));
  activate(toggle, page);

  assert.equal(toggle.hidden, false);
  assert.deepEqual(
    toggle.radios.map((radio) => radio.checked),
    [true, false, false],
  );
  assert.equal(page.attrs["data-theme"], "light");
  assert.equal(toggle.changes.length, 1);
});

test("activate with nothing stored: system is the default choice and follows the OS", () => {
  const toggle = fakeToggle();
  const page = env(store(), false);
  activate(toggle, page);

  assert.deepEqual(
    toggle.radios.map((radio) => radio.checked),
    [false, true, false],
  );
  assert.equal(page.attrs["data-theme"], "dark");
});

test("a change saves, applies, reflects, and announces the new choice", () => {
  const toggle = fakeToggle();
  const page = env(store());
  activate(toggle, page);

  toggle.changes[0]!({ target: toggle.radios[2] });

  assert.equal(page.storage.written, "dark");
  assert.equal(page.attrs["data-theme"], "dark");
  assert.deepEqual(
    toggle.radios.map((radio) => radio.checked),
    [false, false, true],
  );
  assert.equal(toggle.status.textContent, "Dark theme.");
});

test("a change from a target that is not one of the radios does nothing", () => {
  const toggle = fakeToggle();
  const page = env(store());
  activate(toggle, page);

  toggle.changes[0]!({ target: {} });
  toggle.changes[0]!({ target: undefined });

  assert.equal(page.storage.written, undefined);
  assert.equal(page.attrs["data-theme"], "dark");
  assert.equal(toggle.status.textContent, "");
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

test("style.css hides only the radio and status region, and states the switch in logical properties", () => {
  const css = readFileSync(new URL("../chrome/theme-toggle/style.css", import.meta.url), "utf8");

  assert.match(css, /\.theme-toggle-input,\n\.theme-toggle-status \{/);
  assert.match(css, /\.theme-toggle-option:has\(\.theme-toggle-input:checked\) \{/);
  assert.match(css, /\.theme-toggle-option:has\(\.theme-toggle-input:focus-visible\) \{/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
