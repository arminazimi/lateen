import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ChromeProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import copyMarkdown, { twinUrl } from "../chrome/copy-markdown/index.ts";
import {
  activate,
  copy,
  isCopyShortcut,
  isTypingTarget,
  type ActivateEnv,
  type Clipboard,
  type CopyButton,
  type CopyStatus,
  type ShortcutEvent,
  type ShortcutHost,
} from "../chrome/copy-markdown/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

function siteConfig(): SiteConfig {
  return {
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
}

const trail: Trail = [];
const pager: Pager = {};

function pageWith(url = "/example/guide/install/", kind: Page["kind"] = "doc", lang = "en", dir: Page["dir"] = "ltr"): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang,
    dir,
    headings: [],
    html: "",
    markdown: "# Install\n",
    kind,
  };
}

function props(page: Page = pageWith()): ChromeProps {
  const site: Site = { config: siteConfig(), pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager };
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

test("renders a plain Markdown link, a hidden copy button, and a status region", () => {
  const out = html(copyMarkdown(props()));

  assert.match(out, /^<div class="copy-markdown" data-copy-markdown>/);
  assert.match(
    out,
    /<button type="button" class="copy-markdown-button" hidden data-copy-markdown-button data-markdown="\/example\/guide\/install\/index\.md" data-copied="Copied" data-copy-failed="Press Ctrl\+C" aria-keyshortcuts="m" title="Press M to copy">Copy page as Markdown<kbd class="copy-markdown-key" aria-hidden="true">M<\/kbd><\/button>/,
  );
  assert.match(out, /<a class="copy-markdown-link" href="\/example\/guide\/install\/index\.md">View Markdown<\/a>/);
  assert.match(out, /<p class="copy-markdown-status" role="status" data-copy-markdown-status><\/p>/);
});

test("the link, button, hint, and confirmation follow the page language", () => {
  const out = html(copyMarkdown(props(pageWith("/example/fa/install/", "doc", "fa", "rtl"))));

  assert.match(out, />کپی صفحه به صورت مارک‌داون</);
  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, /title="برای کپی M را بزنید"/);
  assert.match(out, /<a class="copy-markdown-link" href="\/example\/fa\/install\/index\.md">مشاهده مارک‌داون<\/a>/);
});

test("a page with no Markdown twin, or one that is not a doc page, renders nothing", () => {
  assert.equal(copyMarkdown(props(pageWith("/example/dashboard/", "app"))), null);
  assert.equal(copyMarkdown(props(pageWith("/example/guide/install.json"))), null);
});

test("the site's base stays in the Markdown twin address", () => {
  const out = html(copyMarkdown(props(pageWith("/prefix/guide/install/"))));

  assert.match(out, /href="\/prefix\/guide\/install\/index\.md"/);
});

test("twinUrl: pretty URLs get index.md, HTML files swap their extension, and other files have no twin", () => {
  assert.equal(twinUrl("/guide/install/"), "/guide/install/index.md");
  assert.equal(twinUrl("/guide/install"), "/guide/install/index.md");
  assert.equal(twinUrl("/"), "/index.md");
  assert.equal(twinUrl("/example"), "/example/index.md");
  assert.equal(twinUrl("/404.html"), "/404.md");
  assert.equal(twinUrl("/feed.xml"), undefined);
});

/** A button that records the click listeners wired to it. */
function fakeButton(
  dataset: CopyButton["dataset"] = { markdown: "/example/guide/install/index.md", copied: "Copied", copyFailed: "Press Ctrl+C" },
): CopyButton & { clicks: Array<() => void> } {
  const fake = {
    hidden: true,
    dataset,
    clicks: [] as Array<() => void>,
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
  };
  return fake;
}

interface PressOptions {
  key?: string;
  target?: unknown;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

/** A document-shaped key listener the test can press. */
interface FakeKeyHost extends ShortcutHost {
  readonly listeners: Array<(event: ShortcutEvent) => void>;
  press(options?: PressOptions): { prevented: boolean };
}

function keyHost(): FakeKeyHost {
  const listeners: Array<(event: ShortcutEvent) => void> = [];
  return {
    listeners,
    addEventListener(type: "keydown", listener) {
      assert.equal(type, "keydown");
      listeners.push(listener);
    },
    press(options: PressOptions = {}) {
      const result = { prevented: false };
      const event: ShortcutEvent = {
        key: options.key ?? "m",
        ...(options.target === undefined ? {} : { target: options.target }),
        ...(options.ctrlKey === undefined ? {} : { ctrlKey: options.ctrlKey }),
        ...(options.metaKey === undefined ? {} : { metaKey: options.metaKey }),
        ...(options.altKey === undefined ? {} : { altKey: options.altKey }),
        ...(options.repeat === undefined ? {} : { repeat: options.repeat }),
        preventDefault() {
          result.prevented = true;
        },
      };
      for (const listener of listeners) listener(event);
      return result;
    },
  };
}

/** An environment whose fetch, clipboard, and key listener record their calls. */
function env(
  options: { fetchText?: (url: string) => Promise<string>; clipboard?: Clipboard } = {},
): ActivateEnv & { fetched: string[]; wrote: string[]; status: CopyStatus; keys: FakeKeyHost } {
  const fake = {
    fetched: [] as string[],
    wrote: [] as string[],
    status: { textContent: "" },
    keys: keyHost(),
    fetchText:
      options.fetchText ??
      ((url: string) => {
        fake.fetched.push(url);
        return Promise.resolve("# Install\n");
      }),
    clipboard:
      options.clipboard ??
      ({
        writeText(text: string) {
          fake.wrote.push(text);
          return Promise.resolve();
        },
      } satisfies Clipboard),
  };
  return fake;
}

/** Lets the fetch and clipboard promises settle. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("activate reveals the button and wires the key shortcut without requesting anything yet", () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  assert.equal(button.hidden, false);
  assert.equal(button.clicks.length, 1);
  assert.equal(world.keys.listeners.length, 1);
  assert.deepEqual(world.fetched, []);
  assert.deepEqual(world.wrote, []);
});

test("a click fetches the Markdown twin, writes it to the clipboard, and announces it", async () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  button.clicks[0]!();
  await settle();

  assert.deepEqual(world.fetched, ["/example/guide/install/index.md"]);
  assert.deepEqual(world.wrote, ["# Install\n"]);
  assert.equal(world.status.textContent, "Copied");
});

test("the m key copies the twin and prevents the key's own browser action", async () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  const result = world.keys.press();
  await settle();

  assert.equal(result.prevented, true);
  assert.deepEqual(world.fetched, ["/example/guide/install/index.md"]);
  assert.deepEqual(world.wrote, ["# Install\n"]);
  assert.equal(world.status.textContent, "Copied");
});

test("the m shortcut stays out of fields the reader is typing in", async () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  for (const target of [
    { tagName: "INPUT" },
    { tagName: "textarea" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
  ]) {
    const result = world.keys.press({ target });
    assert.equal(result.prevented, false, `${JSON.stringify(target)} should keep the m key`);
  }
  await settle();

  assert.deepEqual(world.fetched, []);
  assert.equal(world.status.textContent, "");
});

test("the shortcut leaves /, ?, and Ctrl/Cmd+K to search and ignores modifiers and repeats", () => {
  const world = env();
  activate(fakeButton(), world);

  for (const options of [
    { key: "/" },
    { key: "?" },
    { key: "k", ctrlKey: true },
    { key: "k", metaKey: true },
    { key: "m", ctrlKey: true },
    { key: "m", metaKey: true },
    { key: "m", altKey: true },
    { key: "m", repeat: true },
  ]) {
    const result = world.keys.press(options);
    assert.equal(result.prevented, false, `${JSON.stringify(options)} should not copy`);
  }

  assert.equal(isCopyShortcut({ key: "m", preventDefault() {} }), true);
  assert.equal(isCopyShortcut({ key: "M", preventDefault() {} }), true);
  assert.equal(isCopyShortcut({ key: "/", preventDefault() {} }), false);
  assert.equal(isCopyShortcut({ key: "?", preventDefault() {} }), false);
  assert.equal(isCopyShortcut({ key: "k", ctrlKey: true, preventDefault() {} }), false);
});

test("isTypingTarget covers every kind of field and nothing else", () => {
  for (const target of [
    { tagName: "INPUT" },
    { tagName: "textarea" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
  ]) {
    assert.equal(isTypingTarget(target), true, `${JSON.stringify(target)} is a field`);
  }
  for (const target of [{ tagName: "BUTTON" }, { tagName: "DIV" }, null, undefined, "input"]) {
    assert.equal(isTypingTarget(target), false, `${String(target)} is not a field`);
  }
});

test("a failed request or a refused clipboard announces the failure instead", async () => {
  const rejectedClipboard: Clipboard = { writeText: () => Promise.reject(new Error("denied")) };
  const requestFails = env({ fetchText: () => Promise.reject(new Error("offline")) });
  const clipboardFails = env({ clipboard: rejectedClipboard });

  await copy(fakeButton(), requestFails);
  assert.equal(requestFails.status.textContent, "Press Ctrl+C");

  await copy(fakeButton(), clipboardFails);
  assert.equal(clipboardFails.status.textContent, "Press Ctrl+C");
});

test("without a clipboard or fetch, the button stays hidden and no key is wired", () => {
  const button = fakeButton();
  const keys = keyHost();
  activate(button, { status: { textContent: "" }, keys });

  assert.equal(button.hidden, true);
  assert.equal(button.clicks.length, 0);
  assert.equal(keys.listeners.length, 0);

  const noFetch = fakeButton();
  activate(noFetch, { clipboard: { writeText: () => Promise.resolve() }, status: { textContent: "" }, keys });

  assert.equal(noFetch.hidden, true);
  assert.equal(noFetch.clicks.length, 0);
});

test("a button with no Markdown address stays hidden and copies nothing", async () => {
  const button = fakeButton({});
  const world = env();
  activate(button, world);

  assert.equal(button.hidden, true);
  assert.equal(button.clicks.length, 0);
  assert.equal(world.keys.listeners.length, 0);

  await copy(button, world);
  assert.deepEqual(world.fetched, []);
  assert.equal(world.status.textContent, "");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/copy-markdown/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states every edge in logical properties and keeps the hidden button hidden", () => {
  const css = readFileSync(new URL("../chrome/copy-markdown/style.css", import.meta.url), "utf8");
  const declarations = css
    .split("\n")
    .filter((line) => !/^\s*@(media|container|supports)/.test(line))
    .join("\n");

  assert.match(css, /\.copy-markdown-button\[hidden\] \{\n  display: none;/);
  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
