import assert from "node:assert/strict";
import { test } from "node:test";
import type { TabsEvent } from "../components/code-tabs/client.ts";
import {
  ENHANCED_ATTR,
  LANG_PARAM,
  STORAGE_KEY,
  choose,
  readChoice,
  saveChoice,
  sync,
  type SyncGroup,
  type SyncTab,
} from "../components/code-tabs/sync.ts";

/** A tab or panel element the sync part can touch. */
class FakeTab implements SyncTab {
  hidden = false;
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: TabsEvent) => void>>();
  readonly id: string;
  readonly textContent: string | null;
  constructor(id: string, text = "") {
    this.id = id;
    this.textContent = text;
    this.attrs.set("aria-selected", id.endsWith("1") ? "true" : "false");
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  focus(): void {}
  addEventListener(type: string, listener: (event: TabsEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  click(): void {
    const event: TabsEvent = { target: this, preventDefault: () => {} };
    for (const listener of this.listeners.get("click") ?? []) listener(event);
  }
}

/** A group with `labels` tabs; pass `enhanced: false` for one whose blocks still sit stacked. */
function fakeGroup(labels: string[], { enhanced = true }: { enhanced?: boolean } = {}) {
  const tabs = labels.map((label, i) => new FakeTab(`t${i + 1}`, label));
  const panels = labels.map((_, i) => new FakeTab(`p${i + 1}`));
  // An enhanced group has already had its first panel shown; a stacked one shows every block.
  panels.forEach((panel, i) => (panel.hidden = enhanced ? i !== 0 : false));
  const group = {
    attrs: new Map<string, string>(),
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[role=tab]") return tabs as Iterable<SyncTab>;
      if (selector === ".code-tabs-panel") return panels as Iterable<SyncTab>;
      return [];
    },
  } as SyncGroup & { attrs: Map<string, string> };
  if (enhanced) group.attrs.set(ENHANCED_ATTR, "");
  return { group, tabs, panels };
}

type Group = ReturnType<typeof fakeGroup>;

/** An environment over `groups`, with a query, storage, and a scroll position the tests can move. */
function fakeEnv(groups: Group[], { search = "", stored = {} as Record<string, string>, scrollY = 200 } = {}) {
  const written = new Map<string, string>();
  const scrolls: number[] = [];
  let top = scrollY;
  const env = {
    querySelectorAll: (selector: string) =>
      selector === "[data-code-tabs]" ? groups.map((g) => g.group) : [],
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

const selected = (tabs: FakeTab[]) => tabs.map((tab) => tab.attrs.get("aria-selected"));
const shown = (panels: FakeTab[]) => panels.map((panel) => !panel.hidden);

test("readChoice() takes ?lang= from the URL first", () => {
  assert.equal(readChoice(`?${LANG_PARAM}=go`, () => "npm"), "go");
  assert.equal(readChoice(`?${LANG_PARAM}=go&other=x`, () => "npm"), "go");
  assert.equal(readChoice(`theme=dark&${LANG_PARAM}=rust`, () => "npm"), "rust");
});

test("readChoice() falls back to what is remembered", () => {
  assert.equal(readChoice("", () => "npm"), "npm");
  assert.equal(readChoice("?theme=dark", () => "npm"), "npm");
});

test("readChoice() reads an empty ?lang= as absent, so what is remembered still applies", () => {
  assert.equal(readChoice(`?${LANG_PARAM}=`, () => "npm"), "npm");
});

test("readChoice() gives no choice when the URL and the storage have none", () => {
  assert.equal(readChoice("", () => undefined), undefined);
  assert.equal(readChoice("?theme=dark", () => undefined), undefined);
});

test("readChoice() trims the URL value", () => {
  assert.equal(readChoice(`?${LANG_PARAM}=%20go%20`, () => undefined), "go");
});

test("readChoice() treats a storage read that throws as nothing remembered", () => {
  assert.equal(
    readChoice("", () => {
      throw new Error("blocked");
    }),
    undefined,
  );
});

test("saveChoice() remembers the label under the storage key", () => {
  const written = new Map<string, string>();
  saveChoice("pnpm", (key, value) => written.set(key, value));
  assert.deepEqual([...written], [[STORAGE_KEY, "pnpm"]]);
});

test("saveChoice() ignores storage that throws", () => {
  assert.doesNotThrow(() =>
    saveChoice("pnpm", () => {
      throw new Error("blocked");
    }),
  );
});

test("choose() switches a group to its first tab with the label", () => {
  const { group, tabs, panels } = fakeGroup(["npm", "pnpm", "yarn"]);
  assert.equal(choose(group, "yarn"), true);
  assert.deepEqual(selected(tabs), ["false", "false", "true"]);
  assert.deepEqual(shown(panels), [false, false, true]);
});

test("choose() reports false and changes nothing for a group without the label", () => {
  const { group, tabs, panels } = fakeGroup(["npm", "pnpm"]);
  assert.equal(choose(group, "go"), false);
  assert.deepEqual(selected(tabs), ["true", "false"]);
  assert.deepEqual(shown(panels), [true, false]);
});

test("choose() lands on the first tab with the label", () => {
  const { group, tabs } = fakeGroup(["npm", "npm"]);
  tabs[1]?.setAttribute("aria-selected", "true");
  tabs[0]?.setAttribute("aria-selected", "false");
  assert.equal(choose(group, "npm"), true);
  assert.deepEqual(selected(tabs), ["true", "false"], "the first npm wins");
});

test("choose() leaves a group whose tabs and panels do not pair up alone", () => {
  const { group, tabs, panels } = fakeGroup(["npm", "pnpm"]);
  panels.pop();
  assert.equal(choose(group, "pnpm"), false);
  assert.deepEqual(selected(tabs), ["true", "false"]);
});

test("sync() starts every group with the label remembered from the last page", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const b = fakeGroup(["npm", "pnpm"]);
  const c = fakeGroup(["go", "rust"]);
  const { env } = fakeEnv([a, b, c], { stored: { [STORAGE_KEY]: "pnpm" } });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["false", "true"]);
  assert.deepEqual(selected(b.tabs), ["false", "true"]);
  assert.deepEqual(selected(c.tabs), ["true", "false"], "a group without the label stays on its first tab");
});

test("sync() lets ?lang= in the URL win over what is remembered", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const { env } = fakeEnv([a], { search: `?${LANG_PARAM}=npm`, stored: { [STORAGE_KEY]: "pnpm" } });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["true", "false"]);
});

test("sync() touches only groups the island enhanced", () => {
  const stacked = fakeGroup(["npm", "pnpm"], { enhanced: false });
  const { env } = fakeEnv([stacked], { stored: { [STORAGE_KEY]: "pnpm" } });
  sync(env);
  assert.deepEqual(shown(stacked.panels), [true, true], "stacked blocks all stay visible");
  assert.deepEqual(selected(stacked.tabs), ["true", "false"]);
});

test("sync() applies a click to every other group with that label and keeps the page still", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const b = fakeGroup(["npm", "pnpm"]);
  const c = fakeGroup(["go", "rust"]);
  const { env, written, scrolls, at } = fakeEnv([a, b, c], { scrollY: 340 });
  sync(env);
  a.tabs[1]!.click();
  assert.deepEqual(selected(b.tabs), ["false", "true"], "group b follows the label");
  assert.deepEqual(selected(c.tabs), ["true", "false"], "a group without the label stays put");
  assert.deepEqual([...written], [[STORAGE_KEY, "pnpm"]], "the label is remembered for later pages");
  assert.deepEqual(scrolls, [340], "the scroll offset goes back to where it was");
  assert.equal(at(), 340);
});

test("sync() does not scroll when no other group follows the label", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const { env, scrolls } = fakeEnv([a]);
  sync(env);
  a.tabs[1]!.click();
  assert.deepEqual(scrolls, []);
});

test("sync() remembers a label whose group is alone on the page", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const { env, written } = fakeEnv([a]);
  sync(env);
  a.tabs[1]!.click();
  assert.deepEqual([...written], [[STORAGE_KEY, "pnpm"]]);
});

test("sync() rewires a label after another group has caught up", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const b = fakeGroup(["pnpm", "npm"]);
  const { env } = fakeEnv([a, b]);
  sync(env);
  a.tabs[0]!.click(); // npm: b has no npm tab showing at index 0, but has npm at index 1
  assert.deepEqual(selected(b.tabs), ["false", "true"]);
  b.tabs[0]!.click(); // pnpm: a follows back
  assert.deepEqual(selected(a.tabs), ["false", "true"]);
});

test("sync() wires nothing for a page with no group", () => {
  const { env } = fakeEnv([]);
  assert.doesNotThrow(() => sync(env));
});
