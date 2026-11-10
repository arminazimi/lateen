import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import pageAgentMenu, { twinUrl } from "../chrome/page-agent-menu/index.ts";
import {
  activate,
  copy,
  type Clipboard,
  type CopyButton,
  type CopyEnv,
  type CopyStatus,
} from "../chrome/page-agent-menu/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

function siteConfig(options: Readonly<Record<string, unknown>> = {}, url?: string): SiteConfig {
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
    ...(url === undefined ? {} : { url }),
    theme: { options },
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
    markdown: "",
    kind,
  };
}

function props(
  page: Page = pageWith(),
  options: Readonly<Record<string, unknown>> = {},
  url?: string,
): ChromeProps {
  const site: Site = { config: siteConfig(options, url), pages: [page], nav: {}, data: {} };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const absoluteTwin = encodeURIComponent("https://docs.example.com/example/guide/install/index.md");
const absolutePage = encodeURIComponent("https://docs.example.com/example/guide/install/");

test("renders a disclosure with a hidden copy button, a plain Markdown link, and a status region", () => {
  const out = html(pageAgentMenu(props()));

  assert.match(out, /^<details class="page-agent-menu" data-page-agent-menu>/);
  assert.match(out, /<summary class="page-agent-menu-summary"><span class="page-agent-menu-summary-text">Use with an agent<\/span>/);
  assert.match(
    out,
    /<button type="button" class="page-agent-menu-copy" hidden data-page-agent-copy data-markdown="\/example\/guide\/install\/index.md" data-copied="Copied" data-copy-failed="Press Ctrl\+C">Copy page as Markdown<\/button>/,
  );
  assert.match(out, /<a class="page-agent-menu-view" href="\/example\/guide\/install\/index.md">View Markdown<\/a>/);
  assert.match(out, /<p class="page-agent-menu-status" role="status" data-page-agent-status><\/p>/);
});

test("the copy label follows the page language, and the unit ships no untranslated fallback text of its own", () => {
  const out = html(pageAgentMenu(props(pageWith("/example/fa/install/", "doc", "fa", "rtl"))));

  assert.match(out, />کپی صفحه به صورت مارک‌داون</);
  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, /data-copy-failed="Ctrl\+C را بزنید"/);
});

test("offers Claude, ChatGPT, and Cursor by default, in that order, with the absolute Markdown twin", () => {
  const out = html(pageAgentMenu(props(pageWith(), {}, "https://docs.example.com")));

  assert.match(out, /<p class="page-agent-menu-heading">Open in<\/p>/);
  const hrefs = [...out.matchAll(/<a class="page-agent-menu-provider" href="([^"]+)" target="_blank" rel="noopener">([^<]+)<\/a>/g)].map(
    (match) => ({ href: match[1]!, title: match[2]! }),
  );
  assert.deepEqual(
    hrefs.map((provider) => provider.title),
    ["Claude", "ChatGPT", "Cursor"],
  );
  assert.equal(hrefs[0]!.href, `https://claude.ai/new?q=Read+${absoluteTwin}`);
  assert.equal(hrefs[1]!.href, `https://chatgpt.com?q=Read+${absoluteTwin}`);
  assert.equal(hrefs[2]!.href, `https://cursor.com/link/prompt?text=Read+${absoluteTwin}`);
});

test("the provider list comes from theme options, which replace the defaults", () => {
  const out = html(
    pageAgentMenu(
      props(
        pageWith(),
        {
          pageAgent: {
            providers: [
              { title: "Ask", url: "https://example.com/ask?page={url}" },
              { title: "Help", url: "https://example.com/help?title={title}" },
            ],
          },
        },
        "https://docs.example.com",
      ),
    ),
  );

  assert.doesNotMatch(out, /claude\.ai/);
  assert.doesNotMatch(out, /chatgpt\.com/);
  assert.doesNotMatch(out, /cursor\.com/);
  assert.match(out, new RegExp(`href="https://example\\.com/ask\\?page=${escapeRegExp(absolutePage)}"`));
  assert.match(out, /href="https:\/\/example\.com\/help\?title=Install"/);
});

test("an empty provider list keeps the copy and view actions but shows no open-in group", () => {
  const out = html(pageAgentMenu(props(pageWith(), { pageAgent: { providers: [] } })));

  assert.doesNotMatch(out, /page-agent-menu-heading/);
  assert.doesNotMatch(out, /page-agent-menu-providers/);
  assert.match(out, /data-page-agent-copy/);
  assert.match(out, /page-agent-menu-view/);
});

test("a provider with an unsafe or incomplete entry is dropped", () => {
  const out = html(
    pageAgentMenu(
      props(
        pageWith(),
        {
          pageAgent: {
            providers: [
              { title: "Script", url: "javascript:alert({markdown})" },
              { title: "Data", url: "data:text/html,hi" },
              { title: "", url: "https://example.com/empty-title" },
              { title: "No URL" },
              null,
              { title: "Safe", url: "https://example.com/safe" },
            ],
          },
        },
        "https://docs.example.com",
      ),
    ),
  );

  assert.doesNotMatch(out, /javascript:/);
  assert.doesNotMatch(out, /data:text/);
  assert.doesNotMatch(out, /empty-title/);
  assert.doesNotMatch(out, /No URL/);
  assert.match(out, /href="https:\/\/example\.com\/safe"/);
});

test("the site's base stays in the Markdown link, and address providers wait for a published site URL", () => {
  const out = html(pageAgentMenu(props(pageWith("/prefix/guide/install/"))));

  assert.match(out, /href="\/prefix\/guide\/install\/index.md"/);
  assert.doesNotMatch(out, /claude\.ai|chatgpt\.com|cursor\.com/);
  assert.doesNotMatch(out, /page-agent-menu-heading/);
});

test("a provider with a fixed URL needs no site URL", () => {
  const out = html(
    pageAgentMenu(props(pageWith(), { pageAgent: { providers: [{ title: "Support", url: "https://example.com/support" }] } })),
  );

  assert.match(out, /href="https:\/\/example\.com\/support"/);
});

test("an app page, or a doc page whose URL names another file, renders nothing", () => {
  assert.equal(pageAgentMenu(props(pageWith("/example/dashboard/", "app"))), null);
  assert.equal(pageAgentMenu(props(pageWith("/example/guide/install.json"))), null);
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
function fakeButton(dataset: CopyButton["dataset"] = { markdown: "/example/guide/install/index.md", copied: "Copied", copyFailed: "Press Ctrl+C" }): CopyButton & {
  clicks: Array<() => void>;
} {
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

function status(): CopyStatus {
  return { textContent: "" };
}

/** An environment whose fetch and clipboard record their calls and resolve or reject on demand. */
function env(options: { fetchText?: (url: string) => Promise<string>; clipboard?: Clipboard } = {}): CopyEnv & {
  fetched: string[];
  wrote: string[];
} {
  const fake = {
    fetched: [] as string[],
    wrote: [] as string[],
    status: status(),
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

test("activate reveals the button without requesting anything until the reader clicks", () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  assert.equal(button.hidden, false);
  assert.equal(button.clicks.length, 1);
  assert.deepEqual(world.fetched, []);
  assert.deepEqual(world.wrote, []);
});

test("a click fetches the Markdown twin, writes it to the clipboard, and announces it", async () => {
  const button = fakeButton();
  const world = env();
  activate(button, world);

  button.clicks[0]!();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(world.fetched, ["/example/guide/install/index.md"]);
  assert.deepEqual(world.wrote, ["# Install\n"]);
  assert.equal(world.status.textContent, "Copied");
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

test("without a clipboard or fetch, the button stays hidden and is never wired", () => {
  const button = fakeButton();
  activate(button, { status: status() });

  assert.equal(button.hidden, true);
  assert.equal(button.clicks.length, 0);
});

test("a button with no Markdown address stays hidden and copies nothing", () => {
  const button = fakeButton({});
  const world = env();
  activate(button, world);

  assert.equal(button.hidden, true);
  assert.equal(button.clicks.length, 0);
});

test("copy does nothing when the button has no address", async () => {
  const world = env();
  await copy(fakeButton({}), world);

  assert.deepEqual(world.fetched, []);
  assert.deepEqual(world.wrote, []);
  assert.equal(world.status.textContent, "");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/page-agent-menu/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states every edge in logical properties and keeps the hidden button hidden", () => {
  const css = readFileSync(new URL("../chrome/page-agent-menu/style.css", import.meta.url), "utf8");
  const declarations = css
    .split("\n")
    .filter((line) => !/^\s*@(media|container|supports)/.test(line))
    .join("\n");

  assert.match(css, /\.page-agent-menu-copy\[hidden\] \{\n  display: none;/);
  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
