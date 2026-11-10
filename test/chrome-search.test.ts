import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { ChromeProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import search from "../chrome/search/index.ts";
import {
  activate,
  countMessage,
  emptyMessage,
  groupBySection,
  indexUrl,
  MESSAGES,
  OTHER_SECTION,
  resultNodes,
  sectionOf,
  trap,
  type PagefindApi,
  type SearchButton,
  type SearchClose,
  type SearchDialog,
  type SearchDocument,
  type SearchElement,
  type SearchEvent,
  type SearchFocusable,
  type SearchInput,
  type SearchLink,
  type SearchNode,
  type SearchParts,
  type SearchRecord,
  type SearchResults,
  type SearchStatus,
} from "../chrome/search/client.ts";

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

function props(overrides: Partial<SiteConfig> = {}): ChromeProps {
  const page = pageWith();
  const site: Site = { config: { ...config, ...overrides }, pages: [page], nav: { main: [] }, data: {} };
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

test("renders a closed, hidden dialog that carries the site base", () => {
  const out = html(search(props({ base: "/example" })));

  assert.match(out, /^<dialog class="search" data-search="" data-base="\/example" aria-label="Search" hidden>/);
  assert.doesNotMatch(out, /<dialog[^>]* open/);
  assert.match(out, /<\/dialog>$/);
});

test("holds the query field, a close button, the status region, and the result container", () => {
  const out = html(search(props()));

  assert.match(out, /<label class="search-label" for="search-input">Search<\/label>/);
  assert.match(
    out,
    /<input class="search-input" id="search-input" type="search" name="q" placeholder="Search the docs" autocomplete="off" data-search-input="">/,
  );
  assert.match(out, /<button type="button" class="search-close" aria-label="Close search" data-search-close=""><span aria-hidden="true">×<\/span><\/button>/);
  assert.match(out, /<p class="search-status" role="status" data-search-status=""><\/p>/);
  assert.match(out, /<div class="search-results" role="listbox" aria-label="Search" data-search-results=""><\/div>/);
});

test("a visitor without JavaScript sees no dialog and no search control", () => {
  const out = html(search(props()));

  // The header keeps its button hidden until client.ts runs; the dialog itself starts hidden too.
  assert.match(out, /\bhidden\b/);
  assert.doesNotMatch(out, /<input[^>]* autofocus/);
});

const records: readonly SearchRecord[] = [
  {
    url: "/rules/cache/",
    excerpt: "Clear the <mark>cache</mark> after a deploy.",
    meta: { title: "Cache rules" },
    filters: { section: ["rules"] },
  },
  {
    url: "/guide/install/",
    excerpt: "Install <mark>cache</mark> tools.",
    meta: { title: "Install" },
    filters: { section: ["guide"] },
  },
];

test("results are grouped by section in rank order", () => {
  const groups = groupBySection(records);

  assert.deepEqual(
    groups.map((group) => group.section),
    ["rules", "guide"],
  );
  assert.equal(groups[0]?.results[0]?.meta?.title, "Cache rules");
});

test("a result without a section filter, or with a blank one, lands in Other", () => {
  assert.equal(sectionOf(records[0]!), "rules");
  assert.equal(sectionOf({ url: "/", excerpt: "", filters: { section: ["  "] } }), OTHER_SECTION);
  assert.equal(sectionOf({ url: "/", excerpt: "" }), OTHER_SECTION);
});

test("result nodes are grouped by section and keep Pagefind's mark emphasis", () => {
  const nodes = resultNodes(records, fakeDocument());

  assert.deepEqual(sectionTitles(nodes), ["rules", "guide"]);
  assert.deepEqual(marks(nodes).map((mark) => textOf(mark)), ["cache", "cache"]);
});

test("result text is built from text nodes: a page title cannot inject an element", () => {
  const nodes = resultNodes(
    [
      {
        url: "/rules/cache/",
        excerpt: '<img src=x onerror="alert(1)">Clear the <mark onmouseover="alert(1)">cache</mark>.',
        meta: { title: "<script>alert(1)</script>" },
        filters: { section: ["rules"] },
      },
    ],
    fakeDocument(),
  );
  const all = walkAll(nodes);

  assert.equal(textOf(findClass(all, "search-result-title")!), "<script>alert(1)</script>");
  assert.equal(textOf(findClass(all, "search-result-excerpt")!), '<img src=x onerror="alert(1)">Clear the cache.');
  assert.ok(all.every((node) => node.tag !== "script" && node.tag !== "img"));
});

test("Pagefind entities are decoded for display and mark elements carry no attributes", () => {
  const nodes = resultNodes(
    [{ url: "/guide/", excerpt: 'Tom & Jerry &lt;script&gt; <mark class="hit">cache</mark>', meta: { title: "A & B" } }],
    fakeDocument(),
  );
  const all = walkAll(nodes);
  const mark = all.find((node) => node.tag === "mark");

  assert.equal(textOf(findClass(all, "search-result-title")!), "A & B");
  assert.equal(textOf(findClass(all, "search-result-excerpt")!), "Tom & Jerry <script> cache");
  assert.deepEqual(mark?.attrs, {});
});

test("a result whose URL is not a safe link is shown without an href", () => {
  const all = walkAll(resultNodes([{ url: "javascript:alert(1)", excerpt: "No link", meta: { title: "Bad" } }], fakeDocument()));
  const link = findClass(all, "search-result-link")!;

  assert.equal(link.tag, "span");
  assert.equal(link.attrs.href, undefined);
});

test("the index URL follows the site base, with no double slash at the root", () => {
  assert.equal(indexUrl(""), "/pagefind/pagefind.js");
  assert.equal(indexUrl("/"), "/pagefind/pagefind.js");
  assert.equal(indexUrl("/example"), "/example/pagefind/pagefind.js");
  assert.equal(indexUrl("/example/"), "/example/pagefind/pagefind.js");
});

test("messages name the query and count results in the singular and plural", () => {
  assert.equal(emptyMessage("cache"), "No results for “cache”.");
  assert.equal(countMessage(1), "1 result.");
  assert.equal(countMessage(3), "3 results.");
});

/** Lets every pending promise in `activate` settle before the test asserts. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function fakeButton(name = "button") {
  const fake = {
    name,
    hidden: true,
    focused: 0,
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
    click() {
      for (const listener of fake.clicks) listener();
    },
  };
  return fake;
}

function fakeInput(initial = "") {
  const listeners: Array<() => void> = [];
  const fake = {
    value: initial,
    focused: 0,
    focus() {
      fake.focused += 1;
    },
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "input");
      listeners.push(listener);
    },
    type(value: string) {
      fake.value = value;
      for (const listener of listeners) listener();
    },
  };
  return fake;
}

function fakeLink(name: string) {
  const fake = {
    name,
    focused: 0,
    clicks: 0,
    focus() {
      fake.focused += 1;
    },
    click() {
      fake.clicks += 1;
    },
  };
  return fake;
}

/** A node built by `fakeDocument`: an element has a tag and attributes, a text node has `#text` and `text`. */
interface FakeNode {
  tag: string;
  text?: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  setAttribute(name: string, value: string): void;
  append(...nodes: SearchNode[]): void;
}

/** A tiny document for the result renderer, so tests can inspect the tree without a browser. */
function fakeDocument(): SearchDocument {
  const make = (tag: string, text?: string): FakeNode => ({
    tag,
    ...(text === undefined ? {} : { text }),
    attrs: {},
    children: [],
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    append(...nodes: SearchNode[]) {
      for (const node of nodes) this.children.push(node as unknown as FakeNode);
    },
  });
  return {
    createElement: (tag: string) => make(tag) as unknown as SearchElement,
    createTextNode: (text: string) => make("#text", text) as unknown as SearchNode,
  };
}

/** Every node under `nodes`, itself included, in document order. */
function walkAll(nodes: readonly SearchNode[]): FakeNode[] {
  return nodes.flatMap((node) => {
    const fake = node as unknown as FakeNode;
    return [fake, ...walkAll(fake.children)];
  });
}

/** The first node whose class attribute is `name`. */
function findClass(nodes: readonly FakeNode[], name: string): FakeNode | undefined {
  return nodes.find((node) => node.attrs.class === name);
}

/** The text content of a node tree. */
function textOf(node: FakeNode): string {
  return node.tag === "#text" ? node.text ?? "" : node.children.map(textOf).join("");
}

/** The group headings, in order. */
function sectionTitles(nodes: readonly SearchNode[]): string[] {
  return walkAll(nodes)
    .filter((node) => node.attrs.class === "search-group-title")
    .map(textOf);
}

/** Every `<mark>` element in the tree. */
function marks(nodes: readonly SearchNode[]): FakeNode[] {
  return walkAll(nodes).filter((node) => node.tag === "mark");
}

function fakeResults(links: SearchLink[] = []) {
  const fake = {
    links,
    nodes: [] as SearchNode[],
    replaceChildren(...nodes: SearchNode[]) {
      fake.nodes = nodes;
    },
    querySelectorAll(selector: string): Iterable<SearchLink> {
      assert.match(selector, /a\[href\]/);
      return fake.links;
    },
  };
  return fake;
}

function fakeStatus() {
  const fake: SearchStatus = { textContent: "" };
  return fake;
}

function fakeDialog(options: { base?: string; focusables?: SearchFocusable[] } = {}) {
  const listeners: Record<string, Array<(event: SearchEvent) => void>> = {};
  const fake = {
    open: false,
    hidden: true,
    shows: 0,
    closes: 0,
    base: options.base ?? "",
    focusables: options.focusables ?? [],
    attrs: {} as Record<string, string>,
    getAttribute(name: string) {
      assert.equal(name, "data-base");
      return fake.base;
    },
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
    querySelectorAll(selector: string): Iterable<SearchFocusable> {
      assert.match(selector, /a\[href\]/);
      return fake.focusables;
    },
    addEventListener(type: string, listener: (event: SearchEvent) => void) {
      (listeners[type] ??= []).push(listener);
    },
    fire(type: string, event: SearchEvent) {
      for (const listener of listeners[type] ?? []) listener(event);
    },
  };
  return fake;
}

function key(name: string, target: unknown, shiftKey = false): SearchEvent & { prevented: boolean } {
  const event: SearchEvent & { prevented: boolean } = {
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

function partsOf(options: { base?: string; links?: SearchLink[]; focusables?: SearchFocusable[] } = {}) {
  const dialog = fakeDialog({ ...(options.base === undefined ? {} : { base: options.base }), ...(options.focusables === undefined ? {} : { focusables: options.focusables }) });
  const button = fakeButton("search");
  const close = fakeButton("close");
  const input = fakeInput();
  const results = fakeResults(options.links ?? []);
  const status = fakeStatus();
  const parts: SearchParts = {
    dialog: dialog as unknown as SearchDialog,
    button: button as unknown as SearchButton,
    close: close as unknown as SearchClose,
    input: input as unknown as SearchInput,
    results: results as unknown as SearchResults,
    status,
  };
  return { dialog, button, close, input, results, status, parts };
}

function apiOf(data: readonly SearchRecord[], terms: string[] = []): PagefindApi {
  return {
    search(term: string) {
      terms.push(term);
      return Promise.resolve({ results: data.map((record) => ({ data: () => Promise.resolve(record) })) });
    },
  };
}

function envWith(api: PagefindApi) {
  const env = {
    calls: [] as string[],
    document: fakeDocument(),
    load(url: string) {
      env.calls.push(url);
      return Promise.resolve(api);
    },
  };
  return env;
}

test("activate reveals the search button and the dialog but loads no index until it opens", () => {
  const { dialog, button, input, parts } = partsOf();
  const env = envWith(apiOf([]));

  activate(parts, env);

  assert.equal(button.hidden, false);
  assert.equal(dialog.hidden, false);
  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(env.calls.length, 0, "opening the page must not fetch the index");
  assert.equal(input.focused, 0);
});

test("the first open loads the index, shows the dialog, and focuses the field; later opens reuse it", async () => {
  const { dialog, button, input, parts } = partsOf();
  const env = envWith(apiOf([]));
  activate(parts, env);

  button.click();
  await tick();

  assert.equal(dialog.shows, 1);
  assert.equal(input.focused, 1);
  assert.equal(button.attrs["aria-expanded"], "true");
  assert.deepEqual(env.calls, ["/pagefind/pagefind.js"]);

  button.click();
  await tick();

  assert.equal(dialog.shows, 1, "an already open dialog is not shown again");
  assert.deepEqual(env.calls, ["/pagefind/pagefind.js"], "the index is loaded once");
});

test("the index URL includes a site base", async () => {
  const { button, parts } = partsOf({ base: "/example" });
  const env = envWith(apiOf([]));
  activate(parts, env);

  button.click();
  await tick();

  assert.deepEqual(env.calls, ["/example/pagefind/pagefind.js"]);
});

test("a failed index load is announced and leaves the dialog usable for a retry", async () => {
  const { button, status, parts } = partsOf();
  let calls = 0;
  activate(parts, {
    document: fakeDocument(),
    load() {
      calls += 1;
      return Promise.reject(new Error("offline"));
    },
  });

  button.click();
  await tick();

  assert.equal(status.textContent, MESSAGES.failed);

  button.click();
  await tick();

  assert.equal(calls, 2, "a later open tries the index again");
});

test("typing searches the loaded index and renders grouped, highlighted results", async () => {
  const terms: string[] = [];
  const { button, input, results, status, parts } = partsOf();
  activate(parts, envWith(apiOf(records, terms)));
  button.click();
  await tick();

  input.type("cache");
  await tick();

  assert.deepEqual(terms, ["cache"]);
  assert.deepEqual(sectionTitles(results.nodes), ["rules", "guide"]);
  assert.deepEqual(marks(results.nodes).map((mark) => textOf(mark)), ["cache", "cache"]);
  assert.equal(status.textContent, "2 results.");
});

test("an empty field clears the results and the status", async () => {
  const { button, input, results, status, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  input.type("   ");
  await tick();

  assert.equal(results.nodes.length, 0);
  assert.equal(status.textContent, "");
});

test("a query with no hits announces it in words", async () => {
  const { button, input, status, parts } = partsOf();
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  input.type("nothing");
  await tick();

  assert.equal(status.textContent, emptyMessage("nothing"));
});

test("Escape closes the dialog and returns focus to the search button", async () => {
  const { dialog, button, input, parts } = partsOf();
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  const event = key("Escape", input);
  dialog.fire("keydown", event);

  assert.equal(event.prevented, true);
  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(button.focused, 1);
});

test("arrow keys move between result links and wrap at both ends", async () => {
  const first = fakeLink("first");
  const second = fakeLink("second");
  const { dialog, button, input, parts } = partsOf({ links: [first, second] });
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();

  const downFromField = key("ArrowDown", input);
  dialog.fire("keydown", downFromField);
  assert.equal(downFromField.prevented, true);
  assert.equal(first.focused, 1);

  dialog.fire("keydown", key("ArrowDown", second));
  assert.equal(first.focused, 2, "past the last result, focus wraps to the first");

  dialog.fire("keydown", key("ArrowUp", first));
  assert.equal(second.focused, 1, "before the first result, focus wraps to the last");

  dialog.fire("keydown", key("ArrowUp", input));
  assert.equal(second.focused, 2);
});

test("Enter in the field opens the first result", async () => {
  const first = fakeLink("first");
  const second = fakeLink("second");
  const { dialog, button, input, parts } = partsOf({ links: [first, second] });
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();

  const event = key("Enter", input);
  dialog.fire("keydown", event);

  assert.equal(event.prevented, true);
  assert.equal(first.clicks, 1);
  assert.equal(second.clicks, 0);
});

test("Tab past the last control wraps to the first; Shift+Tab before the first wraps to the last", () => {
  const close = fakeLink("close");
  const first = fakeLink("first");
  const last = fakeLink("last");
  const dialog = fakeDialog({ focusables: [close, first, last] });

  const forward = key("Tab", last);
  trap(dialog as unknown as SearchDialog, forward);
  assert.equal(forward.prevented, true);
  assert.equal(close.focused, 1);

  const inside = key("Tab", first);
  trap(dialog as unknown as SearchDialog, inside);
  assert.equal(inside.prevented, false);

  const back = key("Tab", close, true);
  trap(dialog as unknown as SearchDialog, back);
  assert.equal(back.prevented, true);
  assert.equal(last.focused, 1);
});

test("focus that has left the dialog is brought back to its first control", () => {
  const close = fakeLink("close");
  const dialog = fakeDialog({ focusables: [close] });

  const event = key("Tab", {});
  trap(dialog as unknown as SearchDialog, event);

  assert.equal(event.prevented, true);
  assert.equal(close.focused, 1);
});

test("a dialog with no focusable control keeps Tab from leaving it", () => {
  const dialog = fakeDialog({ focusables: [] });
  const event = key("Tab", {});

  trap(dialog as unknown as SearchDialog, event);

  assert.equal(event.prevented, true);
});

test("keys other than Tab are left to the browser", () => {
  const first = fakeLink("first");
  const dialog = fakeDialog({ focusables: [first] });
  const event = key("a", first);

  trap(dialog as unknown as SearchDialog, event);

  assert.equal(event.prevented, false);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/search/style.css", import.meta.url), "utf8");
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
  const css = readFileSync(new URL("../chrome/search/style.css", import.meta.url), "utf8");
  const declarations = css.replace(/@media[^{]*\{/g, "");

  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.search\[hidden\] \{/);
  assert.match(css, /\.search::backdrop \{/);
});
