import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import sidebar from "../chrome/sidebar/index.ts";
import {
  activate,
  read,
  restore,
  save,
  STORAGE_KEY,
  type SidebarGroup,
  type SidebarStorage,
} from "../chrome/sidebar/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

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

function pageAt(url: string): Page {
  return {
    url,
    source: pos,
    frontMatter: { title: "Page" },
    title: "Page",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function propsAt(nav: NavTree, url: string): ChromeProps {
  const page = pageAt(url);
  const site: Site = { config, pages: [page], nav, data: {} };
  return { site, page, trail: [], pager: {} };
}

const tree: NavTree = {
  main: [
    { title: "Home", url: "/home/" },
    {
      title: "Guide",
      children: [
        { title: "Install", url: "/guide/install/" },
        { title: "Setup", children: [{ title: "Config", url: "/guide/setup/config/" }] },
      ],
    },
    { title: "Reference", children: [{ title: "API", url: "/reference/api/" }] },
  ],
};

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
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

/** An in-memory store that records what was written. */
function store(saved?: string): SidebarStorage & { written: string | undefined } {
  const fake = {
    written: undefined as string | undefined,
    getItem: (key: string) => (key === STORAGE_KEY && saved !== undefined ? saved : null),
    setItem: (key: string, value: string) => {
      if (key === STORAGE_KEY) fake.written = value;
    },
  };
  return fake;
}

/** A store whose every access throws, as private browsing can. */
function brokenStore(): SidebarStorage {
  return {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
}

/** A group `<details>` with its key and its listeners, as the script sees it. */
class FakeGroup implements SidebarGroup {
  open: boolean;
  readonly attrs: Map<string, string>;
  readonly listeners: (() => void)[] = [];

  constructor(key: string, open = false, current = false) {
    this.open = open;
    this.attrs = new Map([["data-sidebar-group", key]]);
    if (current) this.attrs.set("data-current", "true");
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(_type: "toggle", listener: () => void): void {
    this.listeners.push(listener);
  }

  /** The browser fires `toggle` after the reader opens or closes the group. */
  toggle(open: boolean): void {
    this.open = open;
    for (const listener of this.listeners) listener();
  }
}

test("read returns the saved states and ignores anything that is not a boolean", () => {
  const state = read(store(JSON.stringify({ "Guide": false, "Reference": true, "Odd": "yes" })));
  assert.deepEqual([...state.entries()], [
    ["Guide", false],
    ["Reference", true],
  ]);
});

test("read reads as nothing saved when storage is missing, broken, or holds bad data", () => {
  assert.equal(read(undefined).size, 0);
  assert.equal(read(brokenStore()).size, 0);
  assert.equal(read(store("not json")).size, 0);
  assert.equal(read(store("[true]")).size, 0);
  assert.equal(read(store("null")).size, 0);
});

test("save writes the states under the sidebar key and survives broken storage", () => {
  const storage = store();
  save(storage, new Map([["Guide", false]]));
  assert.equal(storage.written, '{"Guide":false}');

  assert.doesNotThrow(() => save(brokenStore(), new Map([["Guide", true]])));
  assert.doesNotThrow(() => save(undefined, new Map()));
});

test("restore opens the page's own group even when it was saved closed", () => {
  const current = new FakeGroup("Guide", true, true);
  restore([current], new Map([["Guide", false]]));
  assert.equal(current.open, true);
});

test("restore applies saved states to the other groups and keeps the default when none is saved", () => {
  const saved = new FakeGroup("Reference", false);
  const open = new FakeGroup("Docs", true);
  const untouched = new FakeGroup("Blog", false);
  restore([saved, open, untouched], new Map([["Reference", true], ["Docs", false]]));
  assert.equal(saved.open, true);
  assert.equal(open.open, false);
  assert.equal(untouched.open, false);
});

test("restore does not mistake inherited object keys for saved states", () => {
  const group = new FakeGroup("constructor", false);
  restore([group], read(store('{"other":true}')));
  assert.equal(group.open, false);
});

test("activate restores the saved states and remembers every later toggle", () => {
  const storage = store('{"Reference":true}');
  const reference = new FakeGroup("Reference", false);
  const guide = new FakeGroup("Guide", true, true);
  const root = { querySelectorAll: () => [reference, guide] };

  activate({ storage, root });
  assert.equal(reference.open, true);
  assert.equal(guide.open, true);

  reference.toggle(false);
  assert.equal(storage.written, '{"Reference":false}');
});

test("activate still opens the page's group when storage is refused", () => {
  const guide = new FakeGroup("Guide", false, true);
  activate({ storage: brokenStore(), root: { querySelectorAll: () => [guide] } });
  assert.equal(guide.open, true);

  const reference = new FakeGroup("Reference", false);
  activate({ root: { querySelectorAll: () => [reference] } });
  reference.toggle(true);
  assert.equal(reference.open, true);
});

test("without JavaScript the sidebar is native disclosure: the page's group open, the rest closed", () => {
  const out = html(sidebar(propsAt(tree, "/guide/setup/config/")));

  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="Guide" data-current="true" open><summary><h2 aria-current="true">Guide<\/h2><\/summary>/,
  );
  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="Guide\/Setup" data-current="true" open><summary><h3 aria-current="true">Setup<\/h3><\/summary>/,
  );
  assert.match(out, /<details class="sidebar-group" data-sidebar-group="Reference"><summary><h2>Reference<\/h2><\/summary>/);
  assert.doesNotMatch(out, /data-sidebar-group="Reference"[^>]* open/);
});

test("the state key of a nested group includes its parent, so equal titles stay apart", () => {
  const nested: NavTree = {
    main: [
      { title: "A", children: [{ title: "Notes", children: [{ title: "x", url: "/a/x/" }] }] },
      { title: "B", children: [{ title: "Notes", children: [{ title: "y", url: "/b/y/" }] }] },
    ],
  };
  const out = html(sidebar(propsAt(nested, "/a/x/")));
  assert.match(out, /data-sidebar-group="A\/Notes" data-current="true" open/);
  assert.match(out, /data-sidebar-group="B\/Notes"><summary>/);
  assert.doesNotMatch(out, /data-sidebar-group="B\/Notes"[^>]* open/);
});
