import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import osTabs, {
  BODY_CLASS,
  DEFAULT_ID,
  OS_TABS_CLASS,
  PANEL_CLASS,
  TABLIST_CLASS,
  TAB_CLASS,
  TITLE_CLASS,
  directive,
  idBase,
  labelOf,
  osOf,
  sections,
  type OsTabsProps,
} from "../components/os-tabs/index.ts";
import {
  PANEL_SELECTOR,
  STORAGE_KEY,
  TABLIST_SELECTOR,
  activate,
  choose,
  detectOs,
  isKnownOs,
  readChoice,
  saveChoice,
  select,
  step,
  sync,
  type OsEnv,
  type TabsElement,
  type TabsEvent,
  type TabsGroup,
} from "../components/os-tabs/client.ts";

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
  "<h3 id=\"macos\">macOS</h3>",
  "<p>brew install slipway</p>",
  "<h3 id=\"windows\">Windows</h3>",
  "<p>winget install slipway</p>",
  "<h3 id=\"linux\">Linux</h3>",
  "<p>curl -fsSL https://get.slipway.dev | sh</p>",
].join("\n");

function render(props: OsTabsProps, body = BODY): string {
  return html(osTabs({ props, page, site, html: body }));
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

test("default export is the OS tabs component and the directive names it", () => {
  assert.equal(typeof osTabs, "function");
  assert.equal(directive, "os-tabs");
});

test("without JavaScript, the tab list starts hidden and every section shows stacked under its title", () => {
  const out = render({});
  assert.match(out, new RegExp(`<div class="${TABLIST_CLASS}" role="tablist" hidden>`));
  assert.doesNotMatch(out, new RegExp(`class="${PANEL_CLASS}"[^>]*hidden`));
  assert.match(out, new RegExp(`<h3 class="${TITLE_CLASS}" id="os-tabs-title-1">macOS</h3>`));
  assert.match(out, new RegExp(`<h3 class="${TITLE_CLASS}" id="os-tabs-title-2">Windows</h3>`));
  assert.match(out, new RegExp(`<h3 class="${TITLE_CLASS}" id="os-tabs-title-3">Linux</h3>`));
  assert.equal(out.split(`class="${PANEL_CLASS}"`).length - 1, 3);
  assert.ok(out.indexOf("brew install slipway") < out.indexOf("winget install slipway"), "sections keep source order");
});

test("the root carries the class and the data attribute the island finds", () => {
  const out = render({});
  assert.match(out, new RegExp(`^<div class="${OS_TABS_CLASS}" data-os-tabs="">`));
});

test("each section sits in a body element inside its panel", () => {
  const out = render({});
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}"><p>brew install slipway</p></div>`));
  assert.match(out, new RegExp(`<div class="${BODY_CLASS}"><p>winget install slipway</p></div>`));
});

test("tabs are buttons that point at their panels and name their OS", () => {
  const out = render({ id: "install" });
  assert.match(
    out,
    /<button type="button" class="os-tabs-tab" role="tab" id="install-tab-1" aria-controls="install-panel-1" aria-selected="true" tabindex="0" data-os="mac">macOS<\/button>/,
  );
  assert.match(
    out,
    /<button type="button" class="os-tabs-tab" role="tab" id="install-tab-2" aria-controls="install-panel-2" aria-selected="false" tabindex="-1" data-os="win">Windows<\/button>/,
  );
  assert.match(out, /<div class="os-tabs-panel" id="install-panel-1" data-os="mac">/);
  assert.match(out, /<div class="os-tabs-panel" id="install-panel-2" data-os="win">/);
});

test("the id prop prefixes every id, and the default prefix is used when it is missing", () => {
  assert.match(render({ id: "second" }), /id="second-tab-1"/);
  assert.match(render({}), new RegExp(`id="${DEFAULT_ID}-tab-1"`));
});

test("the body is split at h2 and h3 headings, and text before the first heading joins it", () => {
  const out = render(
    {},
    "<p>Pick your system:</p><h2>macOS</h2><p>one</p><h3>Windows</h3><p>two</p><h4>Linux</h4><p>not a section</p>",
  );
  assert.equal(out.split(`class="${PANEL_CLASS}"`).length - 1, 2, "only h2 and h3 start a section");
  assert.match(out, /<div class="os-tabs-body"><p>Pick your system:<\/p>\n<p>one<\/p><\/div>/);
  assert.match(out, /<h4>Linux<\/h4><p>not a section<\/p>/, "a deeper heading stays inside its section");
});

test("a body with no headings is kept whole, without tabs", () => {
  const out = render({}, "<p>No operating systems here.</p>");
  assert.doesNotMatch(out, new RegExp(`class="${TABLIST_CLASS}"`));
  assert.doesNotMatch(out, new RegExp(`class="${PANEL_CLASS}"`));
  assert.match(out, /<div class="os-tabs-body"><p>No operating systems here.<\/p><\/div>/);
});

test("labels are escaped, so markup and references in a heading stay text", () => {
  const out = render({}, "<h3>Mac &amp; <b>OS</b></h3><p>x</p>");
  assert.doesNotMatch(out, /<b>OS<\/b>/);
  assert.match(out, />Mac &amp; OS<\/button>/);
});

test("osOf() names macOS, Windows, and Linux, and reads anything else as unknown", () => {
  assert.equal(osOf("macOS"), "mac");
  assert.equal(osOf("Mac OS"), "mac");
  assert.equal(osOf("Darwin"), "mac");
  assert.equal(osOf("Windows"), "win");
  assert.equal(osOf("Win32"), "win");
  assert.equal(osOf("Linux"), "linux");
  assert.equal(osOf("Ubuntu"), "linux");
  assert.equal(osOf("FreeBSD"), "unknown");
  assert.equal(osOf("  "), "unknown");
});

test("labelOf() strips tags and decodes references", () => {
  assert.equal(labelOf("Mac &amp; <b>OS</b>"), "Mac & OS");
  assert.equal(labelOf("  Windows\n"), "Windows");
  assert.equal(labelOf("&lt;script&gt;"), "<script>");
});

test("sections() keeps each heading's content and reports its OS", () => {
  assert.deepEqual(
    sections("<h3>macOS</h3><p>a</p><h3>Windows</h3><p>b</p>"),
    [
      { label: "macOS", os: "mac", html: "<p>a</p>" },
      { label: "Windows", os: "win", html: "<p>b</p>" },
    ],
  );
  assert.deepEqual(sections("<p>none</p>"), []);
});

test("idBase() keeps letters, digits, dash and underscore, and falls back to the default", () => {
  assert.equal(idBase("install tabs!"), "install-tabs");
  assert.equal(idBase("نصب"), "نصب");
  assert.equal(idBase('"><script>'), "script");
  assert.equal(idBase("   "), DEFAULT_ID);
  assert.equal(idBase(undefined), DEFAULT_ID);
});

test("detectOs() reads desktop platforms and treats phones as unknown", () => {
  assert.equal(detectOs("MacIntel"), "mac");
  assert.equal(detectOs("Macintosh"), "mac");
  assert.equal(detectOs("macOS"), "mac");
  assert.equal(detectOs("Darwin"), "mac");
  assert.equal(detectOs("Win32"), "win");
  assert.equal(detectOs("Win64"), "win");
  assert.equal(detectOs("Windows"), "win");
  assert.equal(detectOs("Linux x86_64"), "linux");
  assert.equal(detectOs("Linux"), "linux");
  assert.equal(detectOs("X11"), "linux");
  assert.equal(detectOs(""), "unknown");
  assert.equal(detectOs(undefined), "unknown");
  assert.equal(detectOs("Android"), "unknown");
  assert.equal(detectOs("iPhone"), "unknown");
  assert.equal(detectOs("iPad"), "unknown");
  assert.equal(detectOs("Chrome OS"), "unknown");
});

test("isKnownOs() accepts only the three names the island chooses", () => {
  assert.equal(isKnownOs("mac"), true);
  assert.equal(isKnownOs("win"), true);
  assert.equal(isKnownOs("linux"), true);
  assert.equal(isKnownOs("unknown"), false);
  assert.equal(isKnownOs(""), false);
  assert.equal(isKnownOs(undefined), false);
});

test("readChoice() takes only a remembered OS, and treats storage that throws as absent", () => {
  assert.equal(readChoice(() => "linux"), "linux");
  assert.equal(readChoice(() => "unknown"), undefined);
  assert.equal(readChoice(() => "freebsd"), undefined);
  assert.equal(readChoice(() => undefined), undefined);
  assert.equal(
    readChoice(() => {
      throw new Error("blocked");
    }),
    undefined,
  );
});

test("saveChoice() remembers the OS under the storage key and ignores storage that throws", () => {
  const written = new Map<string, string>();
  saveChoice("win", (key, value) => written.set(key, value));
  assert.deepEqual([...written], [[STORAGE_KEY, "win"]]);
  assert.doesNotThrow(() =>
    saveChoice("mac", () => {
      throw new Error("blocked");
    }),
  );
});

test("step() moves through tabs and wraps, left to right and right to left", () => {
  assert.equal(step("ArrowRight", 0, 3, false), 1);
  assert.equal(step("ArrowRight", 2, 3, false), 0);
  assert.equal(step("ArrowLeft", 0, 3, false), 2);
  assert.equal(step("Home", 2, 3, false), 0);
  assert.equal(step("End", 0, 3, false), 2);
  assert.equal(step("ArrowRight", 0, 3, true), 2);
  assert.equal(step("ArrowLeft", 0, 3, true), 1);
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
}

/** A group with one tab and panel per OS name, the first tab selected. */
function fakeGroup(names: string[], { panels = names.length }: { panels?: number } = {}) {
  const list = new FakeEl("list");
  list.hidden = true;
  const tabs = names.map((name, i) => {
    const tab = new FakeEl(`t${i + 1}`);
    tab.setAttribute("data-os", name);
    tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
    return tab;
  });
  const panelEls = Array.from({ length: panels }, (_, i) => {
    const panel = new FakeEl(`p${i + 1}`);
    panel.hidden = i !== 0;
    return panel;
  });
  const group = {
    attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    querySelector(selector: string) {
      return selector === TABLIST_SELECTOR ? list : null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[role=tab]") return tabs;
      if (selector === PANEL_SELECTOR) return panelEls;
      return [];
    },
  } satisfies TabsGroup & { attrs: Map<string, string> };
  return { group, list, tabs, panels: panelEls };
}

/** An environment over `groups`, with a platform, storage, and a scroll position the tests can move. */
function fakeEnv(
  groups: ReturnType<typeof fakeGroup>[],
  { platform = "Unknown", stored = {} as Record<string, string>, scrollY = 200 } = {},
) {
  const written = new Map<string, string>();
  const writes: Array<[string, string]> = [];
  const scrolls: number[] = [];
  let top = scrollY;
  const env: OsEnv = {
    querySelectorAll: (selector) => (selector === "[data-os-tabs]" ? groups.map((g) => g.group) : []),
    platform: () => platform,
    scrollY: () => top,
    scrollTo: (position: number) => {
      scrolls.push(position);
      top = position;
    },
    read: (key: string) => stored[key],
    write: (key: string, value: string) => {
      written.set(key, value);
      writes.push([key, value]);
    },
  };
  return { env, written, writes, scrolls, at: () => top };
}

const selected = (tabs: FakeEl[]) => tabs.map((tab) => tab.attrs.get("aria-selected"));
const shown = (panels: FakeEl[]) => panels.map((panel) => !panel.hidden);

test("select() shows one panel, hides the rest, and marks the tab in the tab order", () => {
  const { tabs, panels } = fakeGroup(["mac", "win", "linux"]);
  select(tabs, panels, 1);
  assert.deepEqual(shown(panels), [false, true, false]);
  assert.deepEqual(selected(tabs), ["false", "true", "false"]);
  assert.deepEqual(
    tabs.map((t) => t.attrs.get("tabindex")),
    ["-1", "0", "-1"],
  );
});

test("activate() reveals the tab list, marks the group, pairs panels with tabs, and selects the first", () => {
  const { group, list, tabs, panels } = fakeGroup(["mac", "win"]);
  activate(group, false);
  assert.equal(list.hidden, false);
  assert.equal(group.attrs.get("data-enhanced"), "");
  assert.equal(panels[0]?.attrs.get("role"), "tabpanel");
  assert.equal(panels[0]?.attrs.get("aria-labelledby"), "t1");
  assert.equal(panels[1]?.attrs.get("aria-labelledby"), "t2");
  assert.deepEqual(shown(panels), [true, false]);
  assert.deepEqual(selected(tabs), ["true", "false"]);
});

test("activate() moves focus with the arrow keys and stops the default scroll", () => {
  const { group, list, tabs, panels } = fakeGroup(["mac", "win", "linux"]);
  activate(group, false);
  const right = list.fire("keydown", { key: "ArrowRight", target: tabs[0] });
  assert.equal(tabs[1]?.focused, true);
  assert.equal(right.prevented, true);
  assert.deepEqual(shown(panels), [false, true, false]);
  list.fire("keydown", { key: "ArrowLeft", target: tabs[1] });
  assert.equal(tabs[0]?.focused, true);
});

test("activate() leaves a group whose tabs and panels do not pair up stacked", () => {
  const { group, list, panels } = fakeGroup(["mac", "win"], { panels: 1 });
  activate(group, false);
  assert.equal(list.hidden, true, "the list stays as the server wrote it");
  assert.equal(group.attrs.get("data-enhanced"), undefined);
  assert.equal(panels[0]?.hidden, false, "no panel is hidden by the island");
});

test("choose() switches a group to the tab for the OS", () => {
  const { group, tabs, panels } = fakeGroup(["mac", "win", "linux"]);
  assert.equal(choose(group, "linux"), true);
  assert.deepEqual(selected(tabs), ["false", "false", "true"]);
  assert.deepEqual(shown(panels), [false, false, true]);
});

test("choose() reports false for an OS the group does not offer, and lands on the first tab", () => {
  const { group, tabs } = fakeGroup(["mac", "linux"]);
  assert.equal(choose(group, "win"), false);
  assert.deepEqual(selected(tabs), ["true", "false"]);
});

test("choose() with an unknown OS falls back to the first tab", () => {
  const { group, tabs, panels } = fakeGroup(["mac", "linux"]);
  choose(group, "linux");
  assert.equal(choose(group, "unknown"), true);
  assert.deepEqual(selected(tabs), ["true", "false"]);
  assert.deepEqual(shown(panels), [true, false]);
});

test("choose() leaves a group whose tabs and panels do not pair up alone", () => {
  const { group, tabs } = fakeGroup(["mac", "linux"], { panels: 1 });
  assert.equal(choose(group, "linux"), false);
  assert.deepEqual(selected(tabs), ["true", "false"]);
});

test("sync() applies the remembered OS to every group on the page", () => {
  const a = fakeGroup(["mac", "linux"]);
  const b = fakeGroup(["mac", "win", "linux"]);
  const { env } = fakeEnv([a, b], { stored: { [STORAGE_KEY]: "linux" } });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["false", "true"]);
  assert.deepEqual(selected(b.tabs), ["false", "false", "true"]);
});

test("sync() detects the OS when nothing is remembered", () => {
  const a = fakeGroup(["mac", "win", "linux"]);
  const { env } = fakeEnv([a], { platform: "Win32" });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["false", "true", "false"]);
});

test("sync() treats an unknown platform as the first tab", () => {
  const a = fakeGroup(["mac", "win", "linux"]);
  const { env } = fakeEnv([a], { platform: "Android" });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["true", "false", "false"]);
});

test("sync() ignores a stored value that names no OS and falls back to the platform", () => {
  const a = fakeGroup(["mac", "win"]);
  const { env } = fakeEnv([a], { platform: "MacIntel", stored: { [STORAGE_KEY]: "freebsd" } });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["true", "false"]);
});

test("sync() remembers a manual choice and applies it to every other group", () => {
  const a = fakeGroup(["mac", "win", "linux"]);
  const b = fakeGroup(["mac", "win", "linux"]);
  const c = fakeGroup(["mac", "win"]);
  const { env, written, scrolls } = fakeEnv([a, b, c], { platform: "MacIntel", scrollY: 340 });
  sync(env);
  a.tabs[2]!.fire("click", { target: a.tabs[2] });
  assert.deepEqual(selected(b.tabs), ["false", "false", "true"], "group b follows the chosen OS");
  assert.deepEqual(selected(c.tabs), ["true", "false"], "a group without Linux stays on its first tab");
  assert.deepEqual([...written], [[STORAGE_KEY, "linux"]], "the choice is remembered for later pages");
  assert.deepEqual(scrolls, [340], "the scroll offset goes back to where it was");
});

test("sync() does not scroll when no other group offers the chosen OS", () => {
  const a = fakeGroup(["mac", "linux"]);
  const b = fakeGroup(["win"]);
  const { env, scrolls } = fakeEnv([a, b], { platform: "MacIntel" });
  sync(env);
  a.tabs[1]!.fire("click", { target: a.tabs[1] });
  assert.deepEqual(scrolls, []);
});

test("sync() keeps the stored choice shared across a page that changes its mind", () => {
  const a = fakeGroup(["mac", "win"]);
  const b = fakeGroup(["mac", "win"]);
  const { env, writes } = fakeEnv([a, b], { platform: "MacIntel" });
  sync(env);
  a.tabs[1]!.fire("click", { target: a.tabs[1] });
  b.tabs[0]!.fire("click", { target: b.tabs[0] });
  assert.deepEqual(writes, [
    [STORAGE_KEY, "win"],
    [STORAGE_KEY, "mac"],
  ]);
  assert.deepEqual(selected(a.tabs), ["true", "false"], "the other group follows back");
});

test("sync() wires nothing for a page with no group", () => {
  const { env } = fakeEnv([]);
  assert.doesNotThrow(() => sync(env));
});

const styleCss = readFileSync(new URL("../components/os-tabs/style.css", import.meta.url), "utf8");
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
  assert.match(styleCss, /\.os-tabs-list\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(styleCss, /\.os-tabs-panel\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test("the titles are hidden only once the island has enhanced the group", () => {
  assert.match(styleCss, /\.os-tabs\[data-enhanced\]\s+\.os-tabs-title\s*\{[^}]*display:\s*none/s);
});

test("every class the component writes has a rule in style.css", () => {
  for (const cls of [OS_TABS_CLASS, TABLIST_CLASS, TAB_CLASS, PANEL_CLASS, TITLE_CLASS, BODY_CLASS]) {
    assert.match(styleCss, new RegExp(`\\.${cls}\\b`), cls);
  }
});
