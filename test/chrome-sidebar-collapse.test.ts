import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChromeProps, NavTree, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import sidebar from "../chrome/sidebar/index.ts";
import {
  activate,
  MAX_ENTRIES,
  read,
  restore,
  save,
  STORAGE_KEY,
  storageKey,
  type SidebarEvents,
  type SidebarGroup,
  type SidebarRoot,
  type SidebarStorage,
  type StorageEventLike,
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

/** The base path the test navigation is published under. */
const SITE = "/example";

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

/** An in-memory store that records what was written and removed. */
function fakeStore(): SidebarStorage & {
  data: Map<string, string>;
  written: string | undefined;
  removed: string[];
} {
  const fake = {
    data: new Map<string, string>(),
    written: undefined as string | undefined,
    removed: [] as string[],
    getItem(key: string): string | null {
      return fake.data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      fake.data.set(key, value);
      fake.written = value;
    },
    removeItem(key: string): void {
      fake.data.delete(key);
      fake.removed.push(key);
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
    removeItem: () => {
      throw new Error("denied");
    },
  };
}

/** A group `<details>` with its keys and its listeners, as the script sees it. */
class FakeGroup implements SidebarGroup {
  open: boolean;
  readonly attrs: Map<string, string>;
  readonly listeners: (() => void)[] = [];

  constructor(key: string, open = false, current = false, legacy?: string, site = SITE) {
    this.open = open;
    this.attrs = new Map([
      ["data-sidebar-group", key],
      ["data-sidebar-site", site],
    ]);
    if (legacy !== undefined) this.attrs.set("data-sidebar-legacy", legacy);
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

/** The sidebar's root: the groups as the document would list them. */
function rootOf(groups: SidebarGroup[]): SidebarRoot {
  return { querySelectorAll: () => groups };
}

/** A window that records storage listeners for the test to fire. */
function eventsOf(): SidebarEvents & { listeners: ((event: StorageEventLike) => void)[] } {
  const listeners: ((event: StorageEventLike) => void)[] = [];
  return {
    listeners,
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
  };
}

test("read returns the saved states and ignores anything that is not a boolean", () => {
  const storage = fakeStore();
  storage.data.set(storageKey(SITE), JSON.stringify({ "Guide": false, "Reference": true, Odd: "yes" }));
  const state = read(storage, SITE);
  assert.deepEqual([...state.entries()], [
    ["Guide", false],
    ["Reference", true],
  ]);
});

test("read reads as nothing saved when storage is missing, broken, or holds bad data", () => {
  assert.equal(read(undefined, SITE).size, 0);
  assert.equal(read(brokenStore(), SITE).size, 0);

  for (const bad of ["not json", "[true]", "null"]) {
    const storage = fakeStore();
    storage.data.set(storageKey(SITE), bad);
    assert.equal(read(storage, SITE).size, 0);
  }
});

test("state is namespaced by the published base path, so sites on one origin stay apart", () => {
  const storage = fakeStore();
  save(storage, new Map([["Guide", false]]), "/one");
  assert.deepEqual([...read(storage, "/one").entries()], [["Guide", false]]);
  assert.equal(read(storage, "/two").size, 0);

  const other = new FakeGroup("Guide", false, false, undefined, "/two");
  activate({ storage, root: rootOf([other]) });
  assert.equal(other.open, false, "state from /one does not leak into /two");
  assert.equal(read(storage, "/one").get("Guide"), false, "activating another site leaves it alone");
});

test("save writes the states under the site's key and survives broken storage", () => {
  const storage = fakeStore();
  save(storage, new Map([["Guide", false]]), SITE);
  assert.equal(storage.data.get(storageKey(SITE)), '{"Guide":false}');

  assert.doesNotThrow(() => save(brokenStore(), new Map([["Guide", true]]), SITE));
  assert.doesNotThrow(() => save(undefined, new Map(), SITE));
});

test("malformed or oversized stored data is bounded and never breaks the page", () => {
  const entries: Record<string, unknown> = {};
  for (let i = 0; i < MAX_ENTRIES + 50; i += 1) entries[`Guide ${i}`] = i % 2 === 0;
  entries["x".repeat(400)] = true;
  const storage = fakeStore();
  storage.data.set(storageKey(SITE), JSON.stringify(entries));
  const state = read(storage, SITE);
  assert.equal(state.size, MAX_ENTRIES);
  assert.equal(state.has("x".repeat(400)), false);

  const group = new FakeGroup("Guide 0", false);
  assert.doesNotThrow(() => activate({ storage, root: rootOf([group]) }));
  assert.equal(group.open, true);
});

test("save never writes more than the entry limit", () => {
  const storage = fakeStore();
  const state = new Map<string, boolean>();
  for (let i = 0; i < MAX_ENTRIES + 20; i += 1) state.set(`g${i}`, true);
  save(storage, state, SITE);
  const written = JSON.parse(storage.written ?? "{}") as Record<string, boolean>;
  assert.equal(Object.keys(written).length, MAX_ENTRIES);
});

test("legacy title-keyed state is migrated once, then removed", () => {
  const storage = fakeStore();
  storage.data.set(
    STORAGE_KEY,
    JSON.stringify({ "Guide": false, "Guide/Setup": true, "Gone": false }),
  );
  const guide = new FakeGroup("g1", true, true, "Guide");
  const setup = new FakeGroup("g2", false, false, "Guide/Setup");
  const translated = new FakeGroup("g3", true, false, "Anleitung");

  activate({ storage, root: rootOf([guide, setup, translated]) });

  assert.equal(guide.open, true, "the page's group stays open");
  assert.equal(setup.open, true, "a legacy state carries over to its stable key");
  assert.equal(translated.open, true, "an unknown legacy title attaches nothing");

  assert.deepEqual(storage.removed, [STORAGE_KEY]);
  const saved = JSON.parse(storage.data.get(storageKey(SITE)) ?? "{}") as Record<string, boolean>;
  assert.deepEqual(saved, { g1: false, g2: true });
});

test("migrated state is saved once and the legacy key is gone", () => {
  const storage = fakeStore();
  storage.data.set(STORAGE_KEY, JSON.stringify({ Guide: true }));
  const group = new FakeGroup("g1", false, false, "Guide");

  activate({ storage, root: rootOf([group]) });
  assert.equal(group.open, true);
  assert.equal(storage.data.has(STORAGE_KEY), false);

  const fresh = new FakeGroup("g1", false, false, "Guide");
  activate({ storage, root: rootOf([fresh]) });
  assert.equal(fresh.open, true, "the migrated stable key, not the removed legacy key, decides");
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
  const storage = fakeStore();
  storage.data.set(storageKey(SITE), '{"other":true}');
  restore([group], read(storage, SITE));
  assert.equal(group.open, false);
});

test("activate restores the saved states and remembers every later toggle", () => {
  const storage = fakeStore();
  storage.data.set(storageKey(SITE), '{"Reference":true}');
  const reference = new FakeGroup("Reference", false);
  const guide = new FakeGroup("Guide", true, true);

  activate({ storage, root: rootOf([reference, guide]) });
  assert.equal(reference.open, true);
  assert.equal(guide.open, true);

  reference.toggle(false);
  assert.equal(storage.data.get(storageKey(SITE)), '{"Reference":false}');
});

test("activate still opens the page's group when storage is refused", () => {
  const guide = new FakeGroup("Guide", false, true);
  activate({ storage: brokenStore(), root: rootOf([guide]) });
  assert.equal(guide.open, true);

  const reference = new FakeGroup("Reference", false);
  activate({ root: rootOf([reference]) });
  reference.toggle(true);
  assert.equal(reference.open, true);
});

test("a valid change from another tab updates the groups, and only that site's key is followed", () => {
  const storage = fakeStore();
  const events = eventsOf();
  const guide = new FakeGroup("g1", true, true);
  const reference = new FakeGroup("g2", false);

  activate({ storage, root: rootOf([guide, reference]), events });
  assert.equal(events.listeners.length, 1);

  storage.data.set(storageKey(SITE), '{"g2":true}');
  for (const listener of events.listeners) {
    listener({ key: storageKey(SITE), newValue: '{"g2":true}' });
  }
  assert.equal(reference.open, true);
  assert.equal(guide.open, true, "the page's own group stays open");

  storage.data.set(storageKey("/other"), '{"g2":false}');
  for (const listener of events.listeners) {
    listener({ key: storageKey("/other"), newValue: '{"g2":false}' });
  }
  assert.equal(reference.open, true, "another site's change is ignored");
});

test("without JavaScript the sidebar is native disclosure: the page's group open, the rest closed", () => {
  const out = html(sidebar(propsAt(tree, "/guide/setup/config/")));

  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="[^"]+" data-sidebar-legacy="Guide" data-sidebar-site="\/example" data-current="true" open><summary><h2 aria-current="true">Guide<\/h2><\/summary>/,
  );
  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="[^"]+" data-sidebar-legacy="Guide\/Setup" data-sidebar-site="\/example" data-current="true" open><summary><h3 aria-current="true">Setup<\/h3><\/summary>/,
  );
  assert.match(
    out,
    /<details class="sidebar-group" data-sidebar-group="[^"]+" data-sidebar-legacy="Reference" data-sidebar-site="\/example"><summary><h2>Reference<\/h2><\/summary>/,
  );
  assert.doesNotMatch(out, /data-sidebar-legacy="Reference"[^>]* open/);
});

test("the stable keys of equal titles stay apart, so one group cannot overwrite the other", () => {
  const nested: NavTree = {
    main: [
      { title: "A", children: [{ title: "Notes", children: [{ title: "x", url: "/a/x/" }] }] },
      { title: "B", children: [{ title: "Notes", children: [{ title: "y", url: "/b/y/" }] }] },
    ],
  };
  const out = html(sidebar(propsAt(nested, "/a/x/")));
  const keys = [...out.matchAll(/data-sidebar-group="([^"]+)"/g)].map((match) => match[1]!);
  assert.equal(new Set(keys).size, keys.length);
  assert.match(out, /data-sidebar-group="[^"]+" data-sidebar-legacy="A\/Notes" data-sidebar-site="\/example" data-current="true" open/);
  assert.match(out, /data-sidebar-group="[^"]+" data-sidebar-legacy="B\/Notes" data-sidebar-site="\/example"><summary>/);
  assert.doesNotMatch(out, /data-sidebar-legacy="B\/Notes"[^>]* open/);
});
