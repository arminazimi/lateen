import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import codeTabs, {
  BODY_CLASS,
  CODE_TABS_CLASS,
  DEFAULT_ID,
  PANEL_CLASS,
  TABLIST_CLASS,
  TAB_CLASS,
  TITLE_CLASS,
  blocks,
  idBase,
  parseLabels,
  type CodeTabsProps,
} from "../components/code-tabs/index.ts";
import {
  activate,
  select,
  step,
  type TabsElement,
  type TabsEvent,
  type TabsGroup,
} from "../components/code-tabs/client.ts";

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

const PRE_NPM = '<pre class="code" data-lang="bash"><code>npm install slipway</code></pre>';
const PRE_PNPM = '<pre class="code" data-lang="bash"><code>pnpm add slipway</code></pre>';
const PRE_YARN = '<pre class="code" data-lang="bash"><code>yarn add slipway</code></pre>';

function render(props: CodeTabsProps, body = `${PRE_NPM}${PRE_PNPM}`): string {
  return html(codeTabs({ props, page, site, html: body }));
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

test("default export is the code tabs component", () => {
  assert.equal(typeof codeTabs, "function");
});

test("without JavaScript, the tab list starts hidden and every block shows stacked under its title", () => {
  const out = render({ labels: '["npm","pnpm"]' });
  assert.match(out, new RegExp(`<div class="${TABLIST_CLASS}" role="tablist" hidden>`));
  assert.doesNotMatch(out, /class="code-tabs-panel"[^>]*hidden/);
  assert.match(out, new RegExp(`<h3 class="${TITLE_CLASS}" id="code-tabs-title-1">npm</h3>`));
  assert.match(out, new RegExp(`<h3 class="${TITLE_CLASS}" id="code-tabs-title-2">pnpm</h3>`));
  assert.equal(out.split(`class="${PANEL_CLASS}"`).length - 1, 2);
  assert.ok(out.indexOf(PRE_NPM) < out.indexOf(PRE_PNPM), "blocks keep source order");
});

test("the root carries the class and the data attribute the island finds", () => {
  const out = render({});
  assert.match(out, new RegExp(`^<div class="${CODE_TABS_CLASS}" data-code-tabs="">`));
});

test("each block sits in a body element inside its panel", () => {
  const out = render({ labels: '["npm","pnpm"]' });
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}">${PRE_NPM}</div>`));
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}">${PRE_PNPM}</div>`));
});

test("tabs are buttons that point at their panels, with the first one selected", () => {
  const out = render({ id: "install", labels: '["npm","pnpm"]' });
  assert.match(
    out,
    /<button type="button" class="code-tabs-tab" role="tab" id="install-tab-1" aria-controls="install-panel-1" aria-selected="true" tabindex="0">npm<\/button>/,
  );
  assert.match(
    out,
    /<button type="button" class="code-tabs-tab" role="tab" id="install-tab-2" aria-controls="install-panel-2" aria-selected="false" tabindex="-1">pnpm<\/button>/,
  );
  assert.match(out, /<div class="code-tabs-panel" id="install-panel-1">/);
  assert.match(out, /<div class="code-tabs-panel" id="install-panel-2">/);
});

test("the id prop prefixes every id, and the default prefix is used when it is missing", () => {
  assert.match(render({ id: "second" }), /id="second-tab-1"/);
  assert.match(render({}), new RegExp(`id="${DEFAULT_ID}-tab-1"`));
});

test("a label missing from the list reads as the block's position", () => {
  const out = render({ labels: '["npm"]' }, `${PRE_NPM}${PRE_PNPM}${PRE_YARN}`);
  assert.match(out, />npm<\/button>/);
  assert.match(out, />2<\/button>/);
  assert.match(out, />3<\/button>/);
});

test("labels that are not a JSON array of strings fall back to positions", () => {
  assert.match(render({ labels: "not json" }), />1<\/button>/);
  assert.match(render({ labels: '{"a":1}' }), />1<\/button>/);
  assert.match(render({ labels: '[1,"pnpm"]' }), />pnpm<\/button>/);
});

test("labels are escaped, so markup in a label stays text", () => {
  const out = render({ labels: '["<b>npm</b>"]' });
  assert.doesNotMatch(out, /<b>npm<\/b>/);
  assert.match(out, /&lt;b&gt;npm&lt;\/b&gt;/);
});

test("a group with no code blocks renders an empty tab list and no panels", () => {
  const out = render({}, "<p>No code here.</p>");
  assert.doesNotMatch(out, /class="code-tabs-panel"/);
  assert.doesNotMatch(out, /role="tab"/);
});

test("blocks() returns each pre block in order and ignores the text between them", () => {
  assert.deepEqual(blocks(`<p>x</p>${PRE_NPM}<p>y</p>${PRE_PNPM}`), [PRE_NPM, PRE_PNPM]);
  assert.deepEqual(blocks("<p>none</p>"), []);
});

test("parseLabels() reads a JSON array of strings and nothing else", () => {
  assert.deepEqual(parseLabels('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseLabels(undefined), []);
  assert.deepEqual(parseLabels(""), []);
  assert.deepEqual(parseLabels("[true,null]"), ["", ""]);
});

test("idBase() keeps letters, digits, dash and underscore, and falls back to the default", () => {
  assert.equal(idBase("install tabs!"), "install-tabs");
  assert.equal(idBase("نصب"), "نصب");
  assert.equal(idBase('"><script>'), "script");
  assert.equal(idBase("   "), DEFAULT_ID);
  assert.equal(idBase(undefined), DEFAULT_ID);
});

test("step() moves through tabs and wraps, left to right", () => {
  assert.equal(step("ArrowRight", 0, 3, false), 1);
  assert.equal(step("ArrowRight", 2, 3, false), 0);
  assert.equal(step("ArrowLeft", 0, 3, false), 2);
  assert.equal(step("ArrowLeft", 1, 3, false), 0);
  assert.equal(step("Home", 2, 3, false), 0);
  assert.equal(step("End", 0, 3, false), 2);
});

test("step() reverses the arrow keys in a right-to-left group", () => {
  assert.equal(step("ArrowRight", 0, 3, true), 2);
  assert.equal(step("ArrowLeft", 0, 3, true), 1);
  assert.equal(step("Home", 1, 3, true), 0);
});

test("step() ignores other keys and empty groups", () => {
  assert.equal(step("Enter", 0, 3, false), undefined);
  assert.equal(step("ArrowRight", 0, 0, false), undefined);
});

/** A DOM element the island can touch. */
class FakeEl implements TabsElement {
  hidden = false;
  readonly attrs = new Map<string, string>();
  focused = false;
  readonly listeners = new Map<string, Array<(event: TabsEvent) => void>>();
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
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
}

/** A group with `count` tabs and panels, and a tab list. */
function fakeGroup(count: number, { panels = count }: { panels?: number } = {}) {
  const list = new FakeEl("list");
  const tabs = Array.from({ length: count }, (_, i) => new FakeEl(`t${i}`));
  const panelEls = Array.from({ length: panels }, (_, i) => new FakeEl(`p${i}`));
  panelEls.forEach((p) => (p.hidden = true));
  const group = {
    attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    querySelector(selector: string) {
      return selector === ".code-tabs-list" ? list : null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[role=tab]") return tabs;
      if (selector === ".code-tabs-panel") return panelEls;
      return [];
    },
  } satisfies TabsGroup & { attrs: Map<string, string> };
  return { group, list, tabs, panels: panelEls };
}

test("select() shows one panel, hides the rest, and marks the tab in the tab order", () => {
  const { tabs, panels } = fakeGroup(3);
  select(tabs, panels, 1);
  assert.deepEqual(
    panels.map((p) => p.hidden),
    [true, false, true],
  );
  assert.deepEqual(
    tabs.map((t) => t.attrs.get("aria-selected")),
    ["false", "true", "false"],
  );
  assert.deepEqual(
    tabs.map((t) => t.attrs.get("tabindex")),
    ["-1", "0", "-1"],
  );
});

test("activate() reveals the tab list, marks the group, wires each panel to its tab, and selects the first", () => {
  const { group, list, tabs, panels } = fakeGroup(2);
  activate(group, false);
  assert.equal(list.hidden, false);
  assert.equal(group.attrs.get("data-enhanced"), "");
  assert.equal(panels[0]?.attrs.get("role"), "tabpanel");
  assert.equal(panels[0]?.attrs.get("aria-labelledby"), "t0");
  assert.equal(panels[1]?.attrs.get("aria-labelledby"), "t1");
  assert.deepEqual(
    panels.map((p) => p.hidden),
    [false, true],
  );
  assert.equal(tabs[0]?.attrs.get("aria-selected"), "true");
});

test("activate() selects a tab on click", () => {
  const { group, tabs, panels } = fakeGroup(2);
  activate(group, false);
  tabs[1]?.fire("click", { target: tabs[1] });
  assert.deepEqual(
    panels.map((p) => p.hidden),
    [true, false],
  );
});

test("activate() moves focus with the arrow keys, wraps, and stops the default scroll", () => {
  const { group, list, tabs, panels } = fakeGroup(3);
  activate(group, false);
  const right = list.fire("keydown", { key: "ArrowRight", target: tabs[0] });
  assert.equal(tabs[1]?.focused, true);
  assert.equal(right.prevented, true);
  assert.equal(panels[1]?.hidden, false);
  list.fire("keydown", { key: "ArrowLeft", target: tabs[1] });
  assert.equal(tabs[0]?.focused, true);
});

test("activate() in a right-to-left group moves the other way on arrow keys", () => {
  const { group, list, tabs } = fakeGroup(3);
  activate(group, true);
  list.fire("keydown", { key: "ArrowRight", target: tabs[0] });
  assert.equal(tabs[2]?.focused, true);
});

test("activate() leaves a key event whose target is not a tab alone", () => {
  const { group, list, tabs } = fakeGroup(2);
  activate(group, false);
  const outside = new FakeEl("outside");
  const state = list.fire("keydown", { key: "ArrowRight", target: outside });
  assert.equal(state.prevented, false);
  assert.equal(tabs[1]?.focused, false);
});

test("activate() changes nothing when tabs and panels do not pair up, so the blocks stay stacked", () => {
  const { group, list, panels } = fakeGroup(2, { panels: 1 });
  activate(group, false);
  assert.equal(list.hidden, false, "the list stays as the server wrote it");
  assert.equal(group.attrs.get("data-enhanced"), undefined);
  assert.equal(panels[0]?.hidden, true, "no panel is hidden by the island");
});

test("activate() does nothing when the group has no tab list", () => {
  const group = {
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  assert.doesNotThrow(() => activate(group, false));
});

const styleCss = readFileSync(new URL("../components/code-tabs/style.css", import.meta.url), "utf8");
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
  assert.match(styleCss, /\.code-tabs-list\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(styleCss, /\.code-tabs-panel\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test("the titles are hidden only once the island has enhanced the group", () => {
  assert.match(styleCss, /\.code-tabs\[data-enhanced\]\s+\.code-tabs-title\s*\{[^}]*display:\s*none/s);
});

test("every class the component writes has a rule in style.css", () => {
  for (const cls of [CODE_TABS_CLASS, TABLIST_CLASS, TAB_CLASS, PANEL_CLASS, TITLE_CLASS, BODY_CLASS]) {
    assert.match(styleCss, new RegExp(`\\.${cls}\\b`), cls);
  }
});
