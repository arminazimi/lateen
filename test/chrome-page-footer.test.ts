import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, Page, Pager, RepositoryConfig, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import pageFooter, { isoDate } from "../chrome/page-footer/index.ts";
import { activate, copy, RESET_MS, type Clipboard, type CopyButton, type CopyEnv } from "../chrome/page-footer/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const repository: RepositoryConfig = { url: "https://github.com/arminazimi/slipway/", branch: "main", dir: "docs" };

function siteConfig(repo?: RepositoryConfig): SiteConfig {
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
    ...(repo === undefined ? {} : { repository: repo }),
    theme: { options: {} },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

const trail: Trail = [];
const pager: Pager = {};

function pageWith(frontMatter: Record<string, unknown> = {}, source: SourcePos = pos): Page {
  return {
    url: "/example/guide/install/",
    source,
    frontMatter: { title: "Install", ...frontMatter },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(page: Page, repo?: RepositoryConfig): ChromeProps {
  const site: Site = { config: siteConfig(repo), pages: [page], nav: {}, data: {} };
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

test("the copy button starts hidden, so a visitor without JavaScript never sees it", () => {
  const out = html(pageFooter(props(pageWith())));

  assert.match(out, /<button type="button" class="page-footer-copy" hidden data-page-footer-copy data-prompt=.*>Edit with your agent<\/button>/);
});

test("the agent prompt names the source file and line and the page title", () => {
  const out = html(pageFooter(props(pageWith())));

  assert.match(out, /data-prompt="Edit docs\/guide\/install\.md:3\. Current text: .*Install.*\. Change:"/);
});

test("the button carries the copied and failure messages for the island", () => {
  const out = html(pageFooter(props(pageWith())));

  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Press Ctrl\+C"/);
});

test("the edit link points at the source file on the repository's branch, with the trailing slash dropped", () => {
  const out = html(pageFooter(props(pageWith(), repository)));

  assert.match(out, /<a class="page-footer-edit" href="https:\/\/github\.com\/arminazimi\/slipway\/edit\/main\/docs\/guide\/install\.md">Edit this page on GitHub<\/a>/);
});

test("the edit link uses the configured branch and encodes each path segment", () => {
  const page = pageWith({}, { file: "docs/my guide/install #2.md", line: 1, column: 1, endLine: 1, endColumn: 1 });
  const out = html(pageFooter(props(page, { url: "https://github.com/o/r", branch: "trunk" })));

  assert.match(out, /href="https:\/\/github\.com\/o\/r\/edit\/trunk\/docs\/my%20guide\/install%20%232\.md"/);
});

test("the edit link defaults to the main branch when the config leaves it out", () => {
  const out = html(pageFooter(props(pageWith(), { url: "https://github.com/o/r" })));

  assert.match(out, /\/edit\/main\/docs\/guide\/install\.md"/);
});

test("the feedback link opens a new issue with the page's address and source", () => {
  const out = html(pageFooter(props(pageWith(), repository)));

  assert.match(out, /<p class="page-footer-feedback">Was this helpful\? <a href="https:\/\/github\.com\/arminazimi\/slipway\/issues\/new\?title=Feedback%3A%20Install&body=Page%3A%20%2Fexample%2Fguide%2Finstall%2F%0ASource%3A%20docs%2Fguide%2Finstall\.md%0A">Give feedback<\/a><\/p>/);
});

test("without a repository, the edit and feedback links are left out and the prompt stays", () => {
  const out = html(pageFooter(props(pageWith())));

  assert.doesNotMatch(out, /page-footer-edit/);
  assert.doesNotMatch(out, /issues\/new/);
  assert.doesNotMatch(out, /Was this helpful/);
  assert.match(out, /data-page-footer-copy/);
});

test("last updated shows the front matter date, in a time element with the ISO date", () => {
  const out = html(pageFooter(props(pageWith({ last_modified_at: "2026-03-04" }), repository)));

  assert.match(out, /<span class="page-footer-updated">Last updated <time datetime="2026-03-04">2026-03-04<\/time><\/span>/);
});

test("without a date, last updated is left out and the meta line keeps the edit link", () => {
  const out = html(pageFooter(props(pageWith(), repository)));

  assert.doesNotMatch(out, /Last updated/);
  assert.match(out, /<p class="page-footer-meta"><a class="page-footer-edit"/);
});

test("with neither a date nor a repository, no meta line is rendered", () => {
  const out = html(pageFooter(props(pageWith())));

  assert.doesNotMatch(out, /page-footer-meta/);
});

test("isoDate reads ISO strings and Date objects, and nothing else", () => {
  assert.equal(isoDate("2026-03-04"), "2026-03-04");
  assert.equal(isoDate("2026-03-04T10:00:00Z"), "2026-03-04");
  assert.equal(isoDate(new Date("2026-03-04T00:00:00Z")), "2026-03-04");
  assert.equal(isoDate(new Date("not a date")), undefined);
  assert.equal(isoDate("March 4"), undefined);
  assert.equal(isoDate(20260304), undefined);
  assert.equal(isoDate(undefined), undefined);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/page-footer/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states the footer in logical properties and keeps the hidden button hidden", () => {
  const css = readFileSync(new URL("../chrome/page-footer/style.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.page-footer-copy\[hidden\] \{\n {2}display: none;\n\}/);
});

/** A button with the attributes the page renders and a click listener that tests can fire. */
function fakeButton(hidden = true): CopyButton & { clicks: Array<() => void>; click(): void } {
  const fake = {
    hidden,
    textContent: "Edit with your agent" as string | null,
    dataset: { prompt: "Edit docs/guide/install.md:3.", copied: "Copied", copyFailed: "Press Ctrl+C" },
    clicks: [] as Array<() => void>,
    addEventListener(type: "click", listener: () => void) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
    click() {
      for (const listener of fake.clicks) listener();
    },
  };
  return fake;
}

/** A clipboard that records what it was given and resolves or rejects as the test asks. */
function fakeClipboard(ok = true): Clipboard & { written: string[] } {
  const fake = {
    written: [] as string[],
    writeText(text: string) {
      fake.written.push(text);
      return ok ? Promise.resolve() : Promise.reject(new Error("denied"));
    },
  };
  return fake;
}

/** An environment whose timer is recorded, not run, so tests decide when the label comes back. */
function fakeEnv(clipboard?: Clipboard): CopyEnv & { timers: Array<{ callback: () => void; ms: number }> } {
  const fake = {
    clipboard,
    timers: [] as Array<{ callback: () => void; ms: number }>,
    schedule(callback: () => void, ms: number) {
      fake.timers.push({ callback, ms });
      return fake.timers.length;
    },
  };
  return fake;
}

test("activate: without a clipboard the button stays hidden and nothing is wired", () => {
  const button = fakeButton();
  activate(button, fakeEnv(undefined));

  assert.equal(button.hidden, true);
  assert.equal(button.clicks.length, 0);
});

test("activate: with a clipboard the button is revealed and its click is wired", () => {
  const button = fakeButton();
  activate(button, fakeEnv(fakeClipboard()));

  assert.equal(button.hidden, false);
  assert.equal(button.clicks.length, 1);
});

test("a click writes the prompt, says Copied, and restores the label after the reset delay", async () => {
  const button = fakeButton();
  const clipboard = fakeClipboard();
  const env = fakeEnv(clipboard);
  activate(button, env);

  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(clipboard.written, ["Edit docs/guide/install.md:3."]);
  assert.equal(button.textContent, "Copied");
  assert.equal(env.timers.length, 1);
  assert.equal(env.timers[0]!.ms, RESET_MS);

  env.timers[0]!.callback();
  assert.equal(button.textContent, "Edit with your agent");
});

test("a refused clipboard says Press Ctrl+C and still restores the label", async () => {
  const button = fakeButton();
  const env = fakeEnv(fakeClipboard(false));
  activate(button, env);

  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(button.textContent, "Press Ctrl+C");
  env.timers[0]!.callback();
  assert.equal(button.textContent, "Edit with your agent");
});

test("copy keeps the label it was given, even while a previous result is still on screen", async () => {
  const button = fakeButton();
  button.textContent = "Copied";
  const env = fakeEnv(fakeClipboard());

  await copy(button, "Edit with your agent", env);

  env.timers[0]!.callback();
  assert.equal(button.textContent, "Edit with your agent");
});
