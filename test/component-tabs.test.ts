import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import tabs, {
  BODY_CLASS,
  DEFAULT_ID,
  FRAGMENT_CLASS,
  TABS_CLASS,
  TITLE_CLASS,
  bodyStart,
  directive,
  disambiguate,
  groupKey,
  idBase,
  labelOf,
  sections,
  tabsDirectives,
  type TabsProps,
  uniqueKey,
} from "../components/tabs/index.ts";
import {
  STORAGE_KEY,
  TAB_PARAM,
  TABLIST_SELECTOR,
  activate,
  applyHash,
  hashId,
  langSearch,
  showAt,
  syncTabs,
  targetOf,
  withTab,
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
  "<p>brew install mizzen</p>",
  "<h3>Windows</h3>",
  "<p>winget install mizzen</p>",
  "<h3>Linux</h3>",
  "<p>curl -fsSL https://get.mizzen.dev | sh</p>",
].join("\n");

function render(props: TabsProps, body = BODY): string {
  return html(tabs({ props, page, site, html: body }));
}

/** One tabs directive the Markdown stage left in a page's html, at the source lines `line`–`endLine`. */
function slTag(props: Record<string, string>, line: number, endLine: number): string {
  const dataProps = JSON.stringify(props).replace(/"/g, "&#x22;");
  return `<sl-component name="tabs" data-props="${dataProps}" data-src="docs/guide/install.md:${line}:1-${endLine}:3"></sl-component>`;
}

/** A group body whose first heading starts at source `line`, as the Markdown stage renders it. */
function bodyAt(line: number): string {
  return `<h3 data-src="docs/guide/install.md:${line}:1-${line + 2}:9">macOS</h3><p>brew install mizzen</p><h3>Windows</h3><p>winget install mizzen</p>`;
}

/** The component rendered inside a page whose html carries these Markdown-stage directives. */
function renderOn(pageHtml: string, props: TabsProps, body: string): string {
  return html(tabs({ props, page: { ...page, html: pageHtml }, site, html: body }));
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

/** A group with one tab and panel per label, the first tab selected. `prefix` gives the ids the element names the component renders. */
function fakeGroup(labels: string[], { panels = labels.length, enhanced = true, prefix = "" } = {}) {
  const list = new FakeEl("list");
  list.hidden = true;
  const tabs = labels.map((label, i) => {
    const tab = new FakeEl(`${prefix}t${i + 1}`, label);
    tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
    tab.setAttribute("tabindex", i === 0 ? "0" : "-1");
    return tab;
  });
  const bodies = labels.slice(0, panels).map((_, i) => {
    const panel = new FakeEl(`${prefix}p${i + 1}`);
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

/** Finds the fake panel that owns a fragment id: a panel's own id, or a heading mapped into one. */
function fakePanelOf(groups: Group[], inside: Record<string, FakeEl> = {}) {
  return (id: string): FakeEl | undefined => {
    const mapped = inside[id];
    if (mapped) return mapped;
    for (const { panels } of groups) {
      const panel = panels.find((candidate) => candidate.id === id);
      if (panel) return panel;
    }
    return undefined;
  };
}

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
  assert.doesNotMatch(out, /<div role="tabpanel"[^>]*hidden/, "every section shows without JavaScript");

  const buttons = [...out.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(
    buttons.map((match) => match[1]),
    ["macOS", "Windows", "Linux"],
  );
  assert.match(out, /id="install-tab-1" aria-controls="install-panel-1" aria-selected="true" tabindex="0"/);
  assert.match(out, /id="install-tab-2" aria-controls="install-panel-2" aria-selected="false" tabindex="-1"/);
  assert.match(out, /role="tabpanel" id="install-panel-2" aria-labelledby="install-tab-2"/);
  assert.match(out, /<h3 class="tabs-title" id="install-title-2">Windows<\/h3>/);
  assert.match(out, /<div class="tabs-body"><p>winget install mizzen<\/p><\/div>/);
  assert.ok(
    out.indexOf("brew install mizzen") < out.indexOf("winget install mizzen") &&
      out.indexOf("winget install mizzen") < out.indexOf("curl -fsSL"),
    "sections keep their reading order",
  );
});

test("the component keeps a body with no heading whole, with no tab list", () => {
  const out = render({}, "<p>just text</p>");
  assert.equal(out, `<div class="tabs" data-tabs-group="${DEFAULT_ID}"><div class="tabs-body"><p>just text</p></div></div>`);
});

test("tabsDirectives() reads every tabs directive's key and source start, in document order", () => {
  const pageHtml = `${slTag({}, 1, 9)}\n${slTag({ group: "install tabs" }, 11, 19)}\n<sl-component name="callout" data-props="{&#x22;type&#x22;:&#x22;note&#x22;}" data-src="docs/guide/install.md:21:1-23:3"></sl-component>`;
  assert.deepEqual(tabsDirectives(pageHtml), [
    { base: DEFAULT_ID, start: { line: 1, column: 1 } },
    { base: "install-tabs", start: { line: 11, column: 1 } },
  ]);
});

test("tabsDirectives() ignores malformed props and spans without dropping the group", () => {
  const pageHtml =
    '<sl-component name="tabs" data-props="{oops" data-src="docs/guide/install.md:1:1-9:3"></sl-component>' +
    '<sl-component name="tabs" data-props="{}" data-src="nowhere"></sl-component>';
  assert.deepEqual(tabsDirectives(pageHtml), [
    { base: DEFAULT_ID, start: { line: 1, column: 1 } },
    { base: DEFAULT_ID, start: undefined },
  ]);
});

test("bodyStart() reads the first heading's source position and nothing without one", () => {
  assert.deepEqual(bodyStart(bodyAt(12)), { line: 12, column: 1 });
  assert.equal(bodyStart(BODY), undefined, "a hand-written body without source spans has no position");
  assert.equal(bodyStart("<p>no heading</p>"), undefined);
});

test("disambiguate() keeps the first key and gives later repeats free suffixes", () => {
  assert.deepEqual(disambiguate(["tabs", "tabs", "tabs"]), ["tabs", "tabs-2", "tabs-3"]);
  assert.deepEqual(disambiguate(["install", "install"]), ["install", "install-2"]);
  assert.deepEqual(disambiguate(["نصب", "نصب"]), ["نصب", "نصب-2"]);
  assert.deepEqual(disambiguate(["tabs", "tabs-2", "tabs"]), ["tabs", "tabs-2", "tabs-3"]);
  assert.deepEqual(disambiguate(["install"]), ["install"], "a group alone on its key keeps it");
});

test("uniqueKey() locates each render among the page's directives", () => {
  const pageHtml = `${slTag({}, 1, 9)}\n${slTag({}, 11, 19)}`;
  assert.equal(uniqueKey(pageHtml, DEFAULT_ID, bodyAt(2)), "tabs", "the first ordinary group keeps its published key");
  assert.equal(uniqueKey(pageHtml, DEFAULT_ID, bodyAt(12)), "tabs-2");
  assert.equal(uniqueKey("", DEFAULT_ID, bodyAt(2)), DEFAULT_ID, "html without Markdown-stage markers passes through");
  assert.equal(uniqueKey(pageHtml, DEFAULT_ID, BODY), DEFAULT_ID, "a body with no source position passes through");
});

test("groups repeating the default key render unique tab, panel, and title ids with correct aria relationships", () => {
  const pageHtml = `${slTag({}, 1, 9)}\n${slTag({}, 11, 19)}`;
  const first = renderOn(pageHtml, {}, bodyAt(2));
  const second = renderOn(pageHtml, {}, bodyAt(12));

  assert.match(first, /^<div class="tabs" data-tabs-group="tabs">/);
  assert.match(second, /^<div class="tabs" data-tabs-group="tabs-2">/);
  assert.match(second, /id="tabs-2-tab-1" aria-controls="tabs-2-panel-1"/);
  assert.match(second, /role="tabpanel" id="tabs-2-panel-2" aria-labelledby="tabs-2-tab-2"/);
  assert.match(second, /<h3 class="tabs-title" id="tabs-2-title-2">Windows<\/h3>/);

  const ids = [...`${first}${second}`.matchAll(/id="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, "no id repeats between the two groups");

  assert.match(second, /<div role="tablist" hidden>/, "the no-JS state still hides the tab list");
  assert.doesNotMatch(second, /<div role="tabpanel"[^>]*hidden/, "and still stacks every section");
});

test("repeated explicit and slug-equivalent keys are disambiguated per page", () => {
  const pageHtml = `${slTag({ group: "install tabs!" }, 1, 9)}\n${slTag({ group: "install/tabs" }, 11, 19)}`;
  assert.match(renderOn(pageHtml, { group: "install tabs!" }, bodyAt(2)), /id="install-tabs-tab-1"/);
  assert.match(renderOn(pageHtml, { group: "install/tabs" }, bodyAt(12)), /id="install-tabs-2-tab-1"/);
});

test("repeated Unicode keys are disambiguated per page", () => {
  const pageHtml = `${slTag({ group: "نصب" }, 1, 9)}\n${slTag({ group: "نصب" }, 11, 19)}`;
  const first = renderOn(pageHtml, { group: "نصب" }, bodyAt(2));
  const second = renderOn(pageHtml, { group: "نصب" }, bodyAt(12));
  assert.match(first, /<div class="tabs" data-tabs-group="نصب">/);
  assert.match(second, /aria-controls="نصب-2-panel-1"/);
});

test("a group beside an explicit key that reads like a suffix keeps both published ids", () => {
  const pageHtml = `${slTag({}, 1, 9)}\n${slTag({ group: "tabs-2" }, 11, 19)}\n${slTag({}, 21, 29)}`;
  assert.match(renderOn(pageHtml, {}, bodyAt(2)), /id="tabs-panel-1"/);
  assert.match(renderOn(pageHtml, { group: "tabs-2" }, bodyAt(12)), /id="tabs-2-panel-1"/);
  assert.match(renderOn(pageHtml, {}, bodyAt(22)), /id="tabs-3-panel-1"/, "the third default group steps around tabs-2");
});

test("the component puts an authored heading fragment on the generated panel title", () => {
  const body = '<h3>Install notes {#notes}</h3><p>a</p><h3 id="plain">Plain</h3><p>b</p>';
  const out = render({}, body);
  assert.match(
    out,
    /<h3 class="tabs-title" id="tabs-title-1"><span class="tabs-fragment" id="notes"><\/span>Install notes<\/h3>/,
  );
  assert.match(
    out,
    /<h3 class="tabs-title" id="tabs-title-2"><span class="tabs-fragment" id="plain"><\/span>Plain<\/h3>/,
  );
  const buttons = [...out.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(
    buttons.map((match) => match[1]),
    ["Install notes", "Plain"],
    "the authored marker stays out of the synced label",
  );
});

test("sections() reports the authored fragment and keeps a malformed one as plain text", () => {
  assert.deepEqual(sections("<h3>Notes {#notes}</h3><p>a</p>"), [{ label: "Notes", html: "<p>a</p>", anchor: "notes" }]);
  assert.deepEqual(sections('<h3 id="ok">X</h3><p>a</p>'), [{ label: "X", html: "<p>a</p>", anchor: "ok" }]);
  assert.deepEqual(sections("<h3>Keep {#not an id}</h3><p>a</p>"), [{ label: "Keep {#not an id}", html: "<p>a</p>" }]);
  assert.deepEqual(sections("<h3>{#only}</h3><p>a</p>"), [{ label: "{#only}", html: "<p>a</p>" }]);
});

test("a malformed fragment keeps the section readable without an anchor", () => {
  const out = render({}, "<h3>Keep {#no id}</h3><p>x</p>");
  assert.doesNotMatch(out, new RegExp(`class="${FRAGMENT_CLASS}"`));
  assert.match(out, /<button\b[^>]*>Keep \{#no id\}<\/button>/);
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

test("activate() leaves every section stacked when wiring a panel fails", () => {
  const { group, list, panels } = fakeGroup(["macOS", "Windows", "Linux"], { enhanced: false });
  panels[1]!.setAttribute = () => {
    throw new Error("broken panel");
  };
  assert.doesNotThrow(() => activate(group, false));
  assert.equal(list.hidden, true, "the tab list stays hidden");
  assert.equal(group.attrs.get("data-enhanced"), undefined, "the titles stay visible");
  assert.deepEqual(
    panels.map((panel) => panel.hidden),
    [false, false, false],
    "every section stays readable",
  );
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

test("hashId() strips the # and decodes, rejecting empty or malformed fragments", () => {
  assert.equal(hashId("#install-panel-2"), "install-panel-2");
  assert.equal(hashId("#%D9%86%D8%B5%D8%A8"), "نصب");
  assert.equal(hashId("#"), undefined);
  assert.equal(hashId(""), undefined);
  assert.equal(hashId("#   "), undefined);
  assert.equal(hashId("#%E0%A4%A"), undefined, "a broken escape fails soft");
});

test("withTab() sets the tab and keeps every other parameter", () => {
  assert.equal(withTab("?q=beacon&page=2", "Linux"), "?q=beacon&page=2&tab=Linux");
  assert.equal(withTab("?tab=macOS&q=beacon", "Linux"), "?tab=Linux&q=beacon");
  assert.equal(withTab("", "mac OS"), "?tab=mac+OS");
});

test("targetOf() resolves a panel id and a heading inside a panel to its group", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const b = fakeGroup(["npm", "pnpm"]);
  const panelOf = fakePanelOf([a, b], { "install-heading": a.panels[2]! });

  assert.deepEqual(targetOf([a.group, b.group], panelOf, "#p3"), { group: a.group, index: 2 });
  assert.equal(targetOf([a.group, b.group], panelOf, "#install-heading")?.group, a.group);
  assert.equal(targetOf([a.group, b.group], panelOf, "#nope"), undefined);
  assert.equal(targetOf([a.group, b.group], panelOf, "#"), undefined);
});

test("targetOf() ignores a group whose tabs and panels do not pair up", () => {
  const broken = fakeGroup(["macOS", "Windows"], { panels: 1 });
  assert.equal(targetOf([broken.group], fakePanelOf([broken]), "#p1"), undefined);
});

test("a fragment inside a closed panel opens its group and beats ?tab= for that group", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const b = fakeGroup(["Windows", "macOS"]);
  const panelOf = fakePanelOf([a, b], { "linux-heading": a.panels[2]! });

  // Resolution happens before any group hides a panel; the shared label sync runs first, then the target.
  const target = targetOf([a.group, b.group], panelOf, "#linux-heading");
  activate(a.group, false);
  activate(b.group, false);
  const { env } = fakeEnv([a, b], { search: `?${TAB_PARAM}=macOS` });
  syncTabs(env);
  assert.deepEqual(shown(b.panels), [false, true], "the shared label still applies to the other group");
  assert.ok(target);
  assert.equal(showAt(target.group, target.index), true);
  assert.deepEqual(shown(a.panels), [false, false, true], "the fragment picks the panel in its own group");
  assert.deepEqual(shown(b.panels), [false, true], "and leaves the other group alone");
});

test("an authored fragment and a disambiguated panel id each move only their own group", () => {
  const a = fakeGroup(["macOS", "Windows"], { prefix: "tabs-" });
  const b = fakeGroup(["npm", "pnpm"], { prefix: "tabs-2-" });
  activate(a.group, false);
  activate(b.group, false);
  const panelOf = fakePanelOf([a, b], { notes: a.panels[1]! });

  assert.equal(applyHash([a.group, b.group], panelOf, "#notes"), true);
  assert.deepEqual(shown(a.panels), [false, true], "the fragment opens the panel that carries it");
  assert.deepEqual(shown(b.panels), [true, false], "and leaves the other group's selection alone");

  assert.equal(applyHash([a.group, b.group], panelOf, "#tabs-2-p2"), true);
  assert.deepEqual(shown(b.panels), [false, true]);
  assert.deepEqual(shown(a.panels), [false, true], "group a keeps what the first fragment left");

  assert.equal(applyHash([a.group, b.group], panelOf, "#tabs-p1"), true);
  assert.deepEqual(shown(a.panels), [true, false], "a panel id resolves by its owning group, never by position");
});

test("a hash change opens the panel that owns the new fragment, and an unknown one changes nothing", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(a.group, false);
  const panelOf = fakePanelOf([a], { "windows-heading": a.panels[1]! });

  assert.equal(applyHash([a.group], panelOf, "#windows-heading"), true);
  assert.deepEqual(selected(a.tabs), ["false", "true", "false"]);
  assert.deepEqual(shown(a.panels), [false, true, false]);

  assert.equal(applyHash([a.group], panelOf, "#gone"), false);
  assert.deepEqual(shown(a.panels), [false, true, false], "a stale fragment leaves the current panel up");
});

test("choosing a tab shares the label without losing other parameters", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const shared: string[] = [];
  activate(a.group, false, (label) => shared.push(withTab("?q=beacon&tab=macOS", label)));
  a.tabs[1]!.click();
  assert.deepEqual(shared, ["?q=beacon&tab=Windows"], "an explicit choice replaces the stale tab and keeps q");
});

test("keyboard selection in a right-to-left group shares the chosen label", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  const shared: string[] = [];
  activate(a.group, true, (label) => shared.push(label));
  a.list.fire("keydown", { key: "ArrowRight", target: a.tabs[0] });
  assert.deepEqual(selected(a.tabs), ["false", "false", "true"], "ArrowRight moves back in RTL");
  assert.deepEqual(shared, ["Linux"]);
});

test("URL synchronization leaves the scroll position alone", () => {
  const a = fakeGroup(["macOS", "Windows"]);
  const b = fakeGroup(["macOS", "Windows"]);
  const shared: string[] = [];
  const onSelect = (label: string): void => {
    shared.push(label);
  };
  activate(a.group, false, onSelect);
  activate(b.group, false, onSelect);
  const { env, scrolls, at } = fakeEnv([a, b], { scrollY: 120 });
  syncTabs(env);

  a.tabs[1]!.click();
  assert.deepEqual(shared, ["Windows"]);
  assert.deepEqual(selected(b.tabs), ["false", "true"], "the other group follows the label");
  assert.deepEqual(scrolls, [120], "sharing adds no scroll of its own; only the existing sync restores the offset");
  assert.equal(at(), 120);
});

test("a shared fragment does not overwrite what the visitor remembered", () => {
  const a = fakeGroup(["macOS", "Windows", "Linux"]);
  activate(a.group, false);
  const { env, written } = fakeEnv([a], { stored: { [STORAGE_KEY]: "Windows" } });
  syncTabs(env);

  const target = targetOf([a.group], fakePanelOf([a]), "#p3");
  assert.ok(target);
  showAt(target.group, target.index);
  assert.deepEqual([...written], [], "opening a shared link is not a choice to remember");
  assert.deepEqual(shown(a.panels), [false, false, true]);
});

test("stale fragments fail soft and keep a stacked group fully readable", () => {
  const stacked = fakeGroup(["macOS", "Windows"], { enhanced: false });
  const panelOf = fakePanelOf([stacked]);

  assert.equal(applyHash([stacked.group], panelOf, "#p2"), false);
  assert.equal(showAt(stacked.group, 1), false);
  assert.deepEqual(shown(stacked.panels), [true, true], "no panel is hidden when the island did not run");
});

test("an unknown ?tab= leaves every group on its first tab", () => {
  const a = fakeGroup(["macOS", "Windows"]);
  const { env } = fakeEnv([a], { search: `?${TAB_PARAM}=Ghost&keep=1` });
  syncTabs(env);
  assert.deepEqual(selected(a.tabs), ["true", "false"]);
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
  for (const cls of [TABS_CLASS, TITLE_CLASS, BODY_CLASS, FRAGMENT_CLASS]) {
    assert.match(styleCss, new RegExp(`\\.${cls}\\b`), cls);
  }
});

test("style.css also styles the engine's role-based tab markup", () => {
  assert.match(styleCss, /\.tabs > \[role="tablist"\] > \[role="tab"\]/);
  assert.match(styleCss, /\.tabs > \[role="tabpanel"\]/);
});

test("tab motion goes through the motion tokens, which prefers-reduced-motion turns off", () => {
  let transitions = 0;
  for (const name of ["tabs", "os-tabs", "code-tabs"]) {
    const css = readFileSync(new URL(`../components/${name}/style.css`, import.meta.url), "utf8");
    for (const match of css.matchAll(/(?:transition|animation)(?:-[a-z]+)?\s*:\s*([^;]+);/gi)) {
      const value = match[1] ?? "";
      transitions++;
      assert.match(value, /var\(--motion-[a-z]+\)/, `${name}/style.css must time through a motion token`);
      assert.doesNotMatch(value, /\b\d+(?:\.\d+)?m?s\b/, `${name}/style.css must not hard-code a duration`);
    }
  }
  assert.ok(transitions >= 3, "each tab component animates through a motion token");

  const tokensCss = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
  assert.match(tokensCss, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*--motion-fast:\s*0ms/s);
});
