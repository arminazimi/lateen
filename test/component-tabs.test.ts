import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import tabs, {
  BODY_CLASS,
  DEFAULT_ID,
  TABS_CLASS,
  TITLE_CLASS,
  directive,
  groupKey,
  idBase,
  labelOf,
  sections,
  type TabsProps,
} from "../components/tabs/index.ts";
import {
  STORAGE_KEY,
  TAB_PARAM,
  TABLIST_SELECTOR,
  activate,
  langSearch,
  syncTabs,
  type TabsElement,
  type TabsEnv,
  type TabsGroup,
} from "../components/tabs/client.ts";
import { TAB_SELECTOR, type TabsEvent } from "../components/code-tabs/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 4, column: 1, endLine: 20, endColumn: 1 };

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

const page: Page = {
  url: "/example/guide/install/",
  source: pos,
  frontMatter: { title: "Install" },
  title: "Install",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const site: Site = { config, pages: [page], nav: {}, data: {} };

const BODY = [
  "<h3>macOS</h3>",
  "<p>brew install slipway</p>",
  "<h3>Windows</h3>",
  "<p>winget install slipway</p>",
  "<h3>Linux</h3>",
  "<p>curl -fsSL https://get.slipway.dev | sh</p>",
].join("\n");

function render(props: TabsProps, body = BODY): string {
  return html(tabs({ props, page, site, html: body }));
}

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode to HTML string for assertions. Escapes text; `dangerouslySetInnerHTML` is raw. */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  const tag = node.type as string;
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeAttr(String(value))}"`))
    .join("");
  const inner = dangerouslySetInnerHTML ? (dangerouslySetInnerHTML as { __html: string }).__html : html(children);
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** A DOM element the island can touch. */
class FakeEl implements TabsElement {
  hidden = false;
  readonly attrs = new Map<string, string>();
  focused = false;
  readonly listeners = new Map<string, Array<(event: TabsEvent) => void>>();
  readonly id: string;
  readonly textContent: string | null;
  constructor(id: string, text: string | null = null) {
    this.id = id;
    this.textContent = text;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  focus(): void {
    this.focused = true;
  }
  addEventListener(type: string, listener: (event: TabsEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string, event: Partial<TabsEvent> & { target: unknown }): { prevented: boolean } {
    const state = { prevented: false };
    const full: TabsEvent = { preventDefault: () => (state.prevented = true), ...event };
    for (const listener of this.listeners.get(type) ?? []) listener(full);
    return state;
  }
  click(): void {
    this.fire("click", { target: this });
  }
}

/** A group with one tab and panel per label, the first tab selected. */
function fakeGroup(labels: string[], { panels = labels.length, enhanced = true } = {}) {
  const list = new FakeEl("list");
  list.hidden = true;
  const tabs = labels.map((label, i) => {
    const tab = new FakeEl(`t${i + 1}`, label);
    tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
    tab.setAttribute("tabindex", i === 0 ? "0" : "-1");
    return tab;
  });
  const bodies = labels.slice(0, panels).map((_, i) => {
    const panel = new FakeEl(`p${i + 1}`);
    panel.setAttribute("role", "tabpanel");
    panel.hidden = enhanced && i !== 0;
    return panel;
  });
  const group = {
    attrs: new Map<string, string>(enhanced ? [["data-enhanced", ""]] : []),
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    querySelector(selector: string) {
      return selector === TABLIST_SELECTOR ? list : null;
    },
    querySelectorAll(selector: string) {
      if (selector === TAB_SELECTOR) return tabs as Iterable<TabsElement>;
      if (selector === "[role=tabpanel]") return bodies as Iterable<TabsElement>;
      return [];
    },
  } as TabsGroup & { attrs: Map<string, string> };
  return { group, list, tabs, panels: bodies };
}

type Group = ReturnType<typeof fakeGroup>;

/** An environment over `groups`, with a query, storage, and a scroll position the tests can move. */
function fakeEnv(groups: Group[], { search = "", stored = {} as Record<string, string>, scrollY = 200 } = {}) {
  const written = new Map<string, string>();
  const scrolls: number[] = [];
  let top = scrollY;
  const env: TabsEnv = {
    groups: () => groups.map((g) => g.group),
    search: () => search,
    scrollY: () => top,
    scrollTo: (position: number) => {
      scrolls.push(position);
      top = position;
    },
    read: (key: string) => stored[key],
    write: (key: string, value: string) => {
      written.set(key, value);
    },
  };
  return { env, written, scrolls, at: () => top };
}

const selected = (tabs: FakeEl[]) => tabs.map((tab) => tab.attrs.get("aria-selected"));
const shown = (panels: FakeEl[]) => panels.map((panel) => !panel.hidden);

test("default export is the tabs component and the directive names it", () => {
  assert.equal(typeof tabs, "function");
  assert.equal(directive, "tabs");
});

test("labelOf() turns a heading's HTML into plain text", () => {
  assert.equal(labelOf("macOS"), "macOS");
  assert.equal(labelOf("<code>pnpm</code> install"), "pnpm install");
  assert.equal(labelOf("  a\n  b  "), "a b");
  assert.equal(labelOf("&lt;script&gt;"), "<script>");
  assert.equal(labelOf("&#109;ac&#x4F;S"), "macOS");
});

test("sections() keeps each heading's content and reports its label", () => {
  assert.deepEqual(sections("<h3>macOS</h3><p>a</p><h3>Windows</h3><p>b</p>"), [
    { label: "macOS", html: "<p>a</p>" },
    { label: "Windows", html: "<p>b</p>" },
  ]);
});

test("sections() joins text before the first heading to the first section", () => {
  assert.deepEqual(sections("<p>intro</p><h2>One</h2><p>a</p>"), [{ label: "One", html: "<p>intro</p>\n<p>a</p>" }]);
});

test("sections() gives no sections for a body with no heading", () => {
  assert.deepEqual(sections("<p>none</p>"), []);
});

test("idBase() keeps letters, digits, dash and underscore, and falls back to the default", () => {
  assert.equal(idBase("install tabs!"), "install-tabs");
  assert.equal(idBase("نصب"), "نصب");
  assert.equal(idBase('"><script>'), "script");
  assert.equal(idBase("   "), DEFAULT_ID);
  assert.equal(idBase(undefined), DEFAULT_ID);
});

test("groupKey() prefers the directive's group over its id", () => {
  assert.equal(groupKey({ group: "install" }), "install");
  assert.equal(groupKey({ id: "fallback" }), "fallback");
  assert.equal(groupKey({ group: "  ", id: "fallback" }), "fallback");
  assert.equal(groupKey({}), DEFAULT_ID);
});

test("the component renders a hidden tab list and one labelled panel per heading", () => {
  const out = render({ group: "install" });
  assert.match(out, /^<div class="tabs" data-tabs-group="install">/);
  assert.match(out, /<div role="tablist" hidden>/);

  const buttons = [...out.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(
    buttons.map((match) => match[1]),
    ["macOS", "Windows", "Linux"],
  );
  assert.match(out, /id="install-tab-1" aria-controls="install-panel-1" aria-selected="true" tabindex="0"/);
  assert.match(out, /id="install-tab-2" aria-controls="install-panel-2" aria-selected="false" tabindex="-1"/);
  assert.match(out, /role="tabpanel" id="install-panel-2" aria-labelledby="install-tab-2"/);
  assert.match(out, /<h3 class="tabs-title" id="install-title-2">Windows<\/h3>/);
  assert.match(out, /<div class="tabs-body"><p>winget install slipway<\/p><\/div>/);
});

test("the component keeps a body with no heading whole, with no tab list", () => {
  const out = render({}, "<p>just text</p>");
  assert.equal(out, `<div class="tabs" data-tabs-group="${DEFAULT_ID}"><div class="tabs-body"><p>just text</p></div></div>`);
});

test("activate() reveals the list and selects the first tab", () => {
  const { group, list, tabs, panels } = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(group, false);
  assert.equal(list.hidden, false);
  assert.equal(group.attrs.get("data-enhanced"), "");
  assert.deepEqual(selected(tabs), ["true", "false", "false"]);
  assert.deepEqual(shown(panels), [true, false, false]);
  assert.deepEqual(
    panels.map((panel) => panel.attrs.get("aria-labelledby")),
    ["t1", "t2", "t3"],
  );
});

test("activate() selects the tab a click lands on", () => {
  const { group, tabs, panels } = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(group, false);
  tabs[2]!.click();
  assert.deepEqual(selected(tabs), ["false", "false", "true"]);
  assert.deepEqual(shown(panels), [false, false, true]);
});

test("activate() moves the selection with arrow keys and Home/End, wrapping", () => {
  const { group, list, tabs } = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(group, false);

  const right = list.fire("keydown", { key: "ArrowRight", target: tabs[0] });
  assert.equal(right.prevented, true);
  assert.deepEqual(selected(tabs), ["false", "true", "false"]);
  assert.equal(tabs[1]?.focused, true);

  list.fire("keydown", { key: "End", target: tabs[1] });
  assert.deepEqual(selected(tabs), ["false", "false", "true"]);

  list.fire("keydown", { key: "ArrowRight", target: tabs[2] });
  assert.deepEqual(selected(tabs), ["true", "false", "false"], "the last tab wraps to the first");

  const other = list.fire("keydown", { key: "Enter", target: tabs[0] });
  assert.equal(other.prevented, false);
});

test("activate() moves backwards in a right-to-left group", () => {
  const { group, list, tabs } = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(group, true);
  list.fire("keydown", { key: "ArrowRight", target: tabs[0] });
  assert.deepEqual(selected(tabs), ["false", "false", "true"]);
});

test("activate() leaves a group whose tabs and panels do not pair up stacked", () => {
  const { group, list, tabs, panels } = fakeGroup(["macOS", "Windows"], { panels: 1, enhanced: false });
  activate(group, false);
  assert.equal(list.hidden, true);
  assert.equal(group.attrs.get("data-enhanced"), undefined);
  assert.deepEqual(shown(panels), [true]);
  assert.deepEqual(selected(tabs), ["true", "false"]);
});

test("activate() does nothing when the group has no tab list", () => {
  const group = {
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  assert.doesNotThrow(() => activate(group, false));
});

test("langSearch() writes ?tab= as the ?lang= the shared sync module reads", () => {
  assert.equal(langSearch(`?${TAB_PARAM}=macOS`), "?lang=macOS");
  assert.equal(langSearch(`?${TAB_PARAM}=%20Linux%20`), "?lang=Linux");
  assert.equal(langSearch("?lang=Windows"), "?lang=Windows");
  assert.equal(langSearch(""), "");
});

test("syncTabs() starts every group with the label remembered from the last page", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const b = fakeGroup(["Linux", "macOS", "Windows"]);
  const c = fakeGroup(["npm", "pnpm"]);
  const { env } = fakeEnv([a, b, c], { stored: { [STORAGE_KEY]: "Windows" } });
  syncTabs(env);
  assert.deepEqual(selected(a.tabs), ["false", "true", "false"]);
  assert.deepEqual(selected(b.tabs), ["false", "false", "true"]);
  assert.deepEqual(selected(c.tabs), ["true", "false"], "a group without the label stays on its first tab");
});

test("syncTabs() lets ?tab= in the URL win over what is remembered", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const { env } = fakeEnv([a], { search: `?${TAB_PARAM}=Linux`, stored: { [STORAGE_KEY]: "Windows" } });
  syncTabs(env);
  assert.deepEqual(selected(a.tabs), ["false", "false", "true"]);
});

test("syncTabs() still accepts ?lang=, as code tabs do", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const { env } = fakeEnv([a], { search: "?lang=Windows", stored: { [STORAGE_KEY]: "Linux" } });
  syncTabs(env);
  assert.deepEqual(selected(a.tabs), ["false", "true", "false"]);
});

test("syncTabs() applies a click to every other group with that label and keeps the page still", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const b = fakeGroup(["Windows", "Linux", "macOS"]);
  const c = fakeGroup(["npm", "pnpm"]);
  const { env, written, scrolls, at } = fakeEnv([a, b, c], { scrollY: 340 });
  syncTabs(env);
  a.tabs[2]!.click();
  assert.deepEqual(selected(b.tabs), ["false", "true", "false"], "group b follows the label");
  assert.deepEqual(selected(c.tabs), ["true", "false"], "a group without the label stays put");
  assert.deepEqual([...written], [[STORAGE_KEY, "Linux"]], "the label is remembered for later pages");
  assert.deepEqual(scrolls, [340], "the scroll offset goes back to where it was");
  assert.equal(at(), 340);
});

test("syncTabs() does not scroll when no other group follows the label", () => {
  const a = fakeGroup(["macOS", "Windows"]);
  const { env, scrolls } = fakeEnv([a]);
  syncTabs(env);
  a.tabs[1]!.click();
  assert.deepEqual(scrolls, []);
});

test("syncTabs() touches only groups the island enhanced", () => {
  const stacked = fakeGroup(["macOS", "Windows"], { enhanced: false });
  const { env } = fakeEnv([stacked], { stored: { [STORAGE_KEY]: "Windows" } });
  syncTabs(env);
  assert.deepEqual(selected(stacked.tabs), ["true", "false"], "a stacked group keeps its first tab");
});

test("syncTabs() wires nothing for a page with no group", () => {
  const { env } = fakeEnv([]);
  assert.doesNotThrow(() => syncTabs(env));
});

const styleCss = readFileSync(new URL("../components/tabs/style.css", import.meta.url), "utf8");
const namesFile = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(namesFile).flatMap(([group, entries]) => Object.keys(entries).map((name) => `--${group}-${name}`)),
);

test("style.css uses logical properties only, so right-to-left pages lay out correctly", () => {
  const physical = /\b(margin|padding|border|inset)-(left|right)\b|\b(left|right):\s/;
  assert.doesNotMatch(styleCss, physical);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...styleCss.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1] ?? "");
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(tokenNames.has(name), `${name} is not in names.json`);
});

test("the tab list and panels are hidden by a rule that beats their display value", () => {
  assert.match(styleCss, /\.tabs > \[role="tablist"\]\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(styleCss, /\.tabs > \[role="tabpanel"\]\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test("the titles are hidden only once the island has enhanced the group", () => {
  assert.match(styleCss, /\.tabs\[data-enhanced\]\s+\.tabs-title\s*\{[^}]*display:\s*none/s);
});

test("every class the component writes has a rule in style.css", () => {
  for (const cls of [TABS_CLASS, TITLE_CLASS, BODY_CLASS]) {
    assert.match(styleCss, new RegExp(`\\.${cls}\\b`), cls);
  }
});

test("style.css also styles the engine's role-based tab markup", () => {
  assert.match(styleCss, /\.tabs > \[role="tablist"\] > \[role="tab"\]/);
  assert.match(styleCss, /\.tabs > \[role="tabpanel"\]/);
});
