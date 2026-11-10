import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, LayoutProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import feedback, { endpointOf } from "../chrome/feedback/index.ts";
import {
  activate,
  keyFor,
  KEY_PREFIX,
  read,
  save,
  type FeedbackButton,
  type FeedbackPost,
  type FeedbackRoot,
  type FeedbackStatus,
  type FeedbackStorage,
} from "../chrome/feedback/client.ts";
import doc from "../layouts/doc.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const ENDPOINT = "https://feedback.example.com/vote";
const PAGE_URL = "/example/guide/install/";

function siteConfig(options: Readonly<Record<string, unknown>> = {}): SiteConfig {
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
    theme: { options },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

const trail: Trail = [];
const pager: Pager = {};

function pageWith(lang = "en", dir: Page["dir"] = "ltr"): Page {
  return {
    url: PAGE_URL,
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang,
    dir,
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(page: Page = pageWith(), options: Readonly<Record<string, unknown>> = {}): ChromeProps {
  const site: Site = { config: siteConfig(options), pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager };
}

function layoutProps(options: Readonly<Record<string, unknown>>): LayoutProps {
  const page = pageWith();
  const site: Site = { config: siteConfig(options), pages: [page], nav: {}, data: {} };
  return {
    site,
    page,
    trail,
    pager: { prev: { title: "Overview", url: "/guide/" }, next: { title: "Configure", url: "/guide/configure/" } },
    head: { title: "Install · Example", meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

/** The configured feedback block. */
function configured(): Readonly<Record<string, unknown>> {
  return { feedback: { endpoint: ENDPOINT } };
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

test("without an endpoint the unit renders nothing at all", () => {
  assert.equal(feedback(props()), null);
  assert.equal(feedback(props(pageWith(), { feedback: {} })), null);
  assert.equal(feedback(props(pageWith(), { feedback: { endpoint: "   " } })), null);
  assert.equal(feedback(props(pageWith(), { feedback: { endpoint: 3 } })), null);
  assert.equal(feedback(props(pageWith(), { feedback: "yes" })), null);
});

test("endpointOf trims the configured address and rejects anything else", () => {
  assert.equal(endpointOf(siteConfig({ feedback: { endpoint: `  ${ENDPOINT}  ` } })), ENDPOINT);
  assert.equal(endpointOf(siteConfig({ feedback: { endpoint: "" } })), undefined);
  assert.equal(endpointOf(siteConfig({ feedback: {} })), undefined);
  assert.equal(endpointOf(siteConfig()), undefined);
});

test("with an endpoint it renders the question, two named buttons, and a status region", () => {
  const out = html(feedback(props(pageWith(), configured())));

  assert.match(
    out,
    /^<div class="feedback" data-feedback hidden data-endpoint="https:\/\/feedback\.example\.com\/vote" data-url="\/example\/guide\/install\/" data-thanks="Thanks for your feedback\." data-failed="Thanks for your answer\." data-already="You already answered for this page\.">/,
  );
  assert.match(out, /<p class="feedback-question">Was this page helpful\?<\/p>/);
  assert.match(
    out,
    /<button type="button" class="feedback-button" hidden data-feedback-vote="yes">Yes, this page helped<\/button>/,
  );
  assert.match(out, /<button type="button" class="feedback-button" hidden data-feedback-vote="no">No<\/button>/);
  assert.match(out, /<p class="feedback-status" role="status"><\/p>/);
});

test("the widget and both buttons start hidden, so a visitor without JavaScript sees nothing", () => {
  const out = html(feedback(props(pageWith(), configured())));

  assert.match(out, /^<div class="feedback"[^>]* hidden /);
  assert.equal([...out.matchAll(/<button\b/g)].length, 2);
  assert.equal([...out.matchAll(/<button\b[^>]* hidden /g)].length, 2);
});

test("Persian and Arabic pages get their own question and button names", () => {
  const fa = html(feedback(props(pageWith("fa", "rtl"), configured())));
  assert.match(fa, /<p class="feedback-question">آیا این صفحه مفید بود؟<\/p>/);
  assert.match(fa, />بله، این صفحه کمک کرد<\/button>/);
  assert.match(fa, />خیر<\/button>/);
  assert.match(fa, /data-thanks="از بازخورد شما سپاسگزاریم\."/);

  const ar = html(feedback(props(pageWith("ar", "rtl"), configured())));
  assert.match(ar, /<p class="feedback-question">هل كانت هذه الصفحة مفيدة؟<\/p>/);
  assert.match(ar, />نعم، ساعدتني هذه الصفحة<\/button>/);
  assert.match(ar, />لا<\/button>/);
  assert.match(ar, /data-thanks="شكرًا على ملاحظاتك\."/);
});

test("the doc layout places the feedback under the page footer and before the pager", () => {
  const out = html(doc(layoutProps(configured())));
  const footer = out.indexOf('class="page-footer"');
  const widget = out.indexOf('class="feedback"');
  const pager = out.indexOf('class="pager"');

  assert.ok(footer >= 0, "page footer present");
  assert.ok(widget > footer, "feedback follows the page footer");
  assert.ok(pager > widget, "pager follows the feedback");
});

test("without an endpoint the doc layout renders no feedback markup", () => {
  assert.doesNotMatch(html(doc(layoutProps({}))), /class="feedback"/);
});

/** A button with the attributes the page renders and a click listener that tests can fire. */
interface FakeButton extends FeedbackButton {
  clicks: Array<() => void>;
  click(): void;
}

function fakeButton(vote: "yes" | "no", hidden = true): FakeButton {
  const fake: FakeButton = {
    hidden,
    disabled: false,
    dataset: { vote },
    clicks: [],
    addEventListener(type, listener) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
    click() {
      for (const listener of fake.clicks) listener();
    },
  };
  return fake;
}

/** The widget root as the page renders it, with fake buttons and status region. */
interface FakeRoot extends FeedbackRoot {
  buttons: FakeButton[];
  status: FeedbackStatus;
}

function fakeRoot(endpoint = ENDPOINT): FakeRoot {
  const buttons = [fakeButton("yes"), fakeButton("no")];
  const status: FeedbackStatus = { textContent: "Thanks for your feedback." };
  const root: FakeRoot = {
    hidden: true,
    dataset: {
      endpoint,
      url: PAGE_URL,
      thanks: "Thanks for your feedback.",
      failed: "Thanks for your answer.",
      already: "You already answered for this page.",
    },
    buttons,
    status,
    querySelectorAll(selector) {
      assert.equal(selector, "[data-feedback-vote]");
      return buttons;
    },
    querySelector(selector) {
      assert.equal(selector, ".feedback-status");
      return status;
    },
  };
  return root;
}

/** A session storage that records every key it reads and writes. */
interface FakeStorage extends FeedbackStorage {
  values: Map<string, string>;
  reads: string[];
  writes: string[];
}

function fakeStorage(initial: Readonly<Record<string, string>> = {}): FakeStorage {
  const values = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    values,
    reads,
    writes,
    getItem(key) {
      reads.push(key);
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push(key);
      values.set(key, value);
    },
  };
}

/** A POST that records its endpoint and body, and resolves or rejects as the test asks. */
function fakePost(ok = true): FeedbackPost & { calls: Array<{ endpoint: string; body: string }> } {
  const calls: Array<{ endpoint: string; body: string }> = [];
  const post: FeedbackPost = (endpoint, body) => {
    calls.push({ endpoint, body });
    return ok ? Promise.resolve() : Promise.reject(new Error("offline"));
  };
  return Object.assign(post, { calls });
}

/** Lets the promise chain in `vote` settle. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("activate reveals the widget and both buttons and wires each click", () => {
  const root = fakeRoot();
  activate(root, { storage: fakeStorage(), post: fakePost() });

  assert.equal(root.hidden, false);
  assert.equal(root.buttons[0]!.hidden, false);
  assert.equal(root.buttons[1]!.hidden, false);
  assert.equal(root.buttons[0]!.clicks.length, 1);
  assert.equal(root.buttons[1]!.clicks.length, 1);
});

test("Yes posts the page URL and helpful:true, thanks the reader, and records the vote", async () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  const post = fakePost();
  activate(root, { storage, post });

  root.buttons[0]!.click();
  await settle();

  assert.deepEqual(post.calls, [{ endpoint: ENDPOINT, body: `{"url":"${PAGE_URL}","helpful":true}` }]);
  assert.equal(root.status.textContent, "Thanks for your feedback.");
  assert.deepEqual(storage.writes, [keyFor(PAGE_URL)]);
  assert.equal(storage.values.get(keyFor(PAGE_URL)), "yes");
  assert.equal(root.buttons[0]!.hidden, true);
  assert.equal(root.buttons[1]!.hidden, true);
  assert.equal(root.buttons[0]!.disabled, true);
  assert.equal(root.buttons[1]!.disabled, true);
});

test("No posts helpful:false and records that answer", async () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  const post = fakePost();
  activate(root, { storage, post });

  root.buttons[1]!.click();
  await settle();

  assert.deepEqual(post.calls, [{ endpoint: ENDPOINT, body: `{"url":"${PAGE_URL}","helpful":false}` }]);
  assert.equal(storage.values.get(keyFor(PAGE_URL)), "no");
});

test("a failed request still shows a neutral thank-you and records nothing", async () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  const post = fakePost(false);
  activate(root, { storage, post });

  root.buttons[0]!.click();
  await settle();

  assert.equal(post.calls.length, 1);
  assert.equal(root.status.textContent, "Thanks for your answer.");
  assert.deepEqual(storage.writes, []);
  assert.equal(root.buttons[0]!.hidden, true);
  assert.equal(root.buttons[1]!.hidden, true);
  assert.equal(root.buttons[0]!.disabled, true);
  assert.equal(root.buttons[1]!.disabled, true);
});

test("a session that already answered shows the stored acknowledgement, not the buttons", () => {
  const root = fakeRoot();
  const storage = fakeStorage({ [keyFor(PAGE_URL)]: "yes" });
  const post = fakePost();

  activate(root, { storage, post });

  assert.equal(root.hidden, false);
  assert.equal(root.buttons[0]!.hidden, true);
  assert.equal(root.buttons[1]!.hidden, true);
  assert.equal(root.buttons[0]!.clicks.length, 0);
  assert.equal(root.status.textContent, "You already answered for this page.");
  assert.deepEqual(post.calls, []);
});

test("without an endpoint the island leaves the widget hidden and wires nothing", () => {
  const root = fakeRoot("");
  activate(root, { storage: fakeStorage(), post: fakePost() });

  assert.equal(root.hidden, true);
  assert.equal(root.buttons[0]!.hidden, true);
  assert.equal(root.buttons[1]!.hidden, true);
  assert.equal(root.buttons[0]!.clicks.length, 0);
});

test("a vote is stored under one session key per page, and storage failures are tolerated", () => {
  assert.equal(KEY_PREFIX, "slipway-feedback:");
  assert.equal(keyFor(PAGE_URL), "slipway-feedback:/example/guide/install/");

  const storage = fakeStorage();
  save(storage, PAGE_URL, "no");
  assert.deepEqual(storage.writes, ["slipway-feedback:/example/guide/install/"]);
  assert.equal(read(storage, PAGE_URL), "no");
  assert.equal(read(fakeStorage({ [keyFor(PAGE_URL)]: "maybe" }), PAGE_URL), undefined);

  const broken: FeedbackStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.equal(read(broken, PAGE_URL), undefined);
  assert.doesNotThrow(() => save(broken, PAGE_URL, "yes"));
});

test("the island never reads or writes cookies or localStorage, and touches sessionStorage only", () => {
  const source = readFileSync(new URL("../chrome/feedback/client.ts", import.meta.url), "utf8");

  assert.match(source, /sessionStorage/);
  assert.doesNotMatch(source, /localStorage|document\.cookie|cookieStore/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/feedback/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states the widget in logical properties and keeps hidden things hidden", () => {
  const css = readFileSync(new URL("../chrome/feedback/style.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.feedback\[hidden\] \{\n {2}display: none;\n\}/);
  assert.match(css, /\.feedback-button\[hidden\] \{\n {2}display: none;\n\}/);
});
