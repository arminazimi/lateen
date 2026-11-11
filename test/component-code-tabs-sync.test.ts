import assert from "node:assert/strict";
import { test } from "node:test";
import type { TabsEvent } from "../components/code-tabs/client.ts";
import {
  ENHANCED_ATTR,
  LANG_PARAM,
  STORAGE_KEY,
  choose,
  hashId,
  readChoice,
  revealHash,
  saveChoice,
  share,
  sync,
  targetOf,
  urlFor,
  withLang,
  type SyncGroup,
  type SyncTab,
} from "../components/code-tabs/sync.ts";

/** A tab or panel element the sync part can touch. */
class FakeTab implements SyncTab {
  hidden = false;
  focused = false;
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
  focus(): void {
    this.focused = true;
  }
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

/** Finds the fake panel that owns a fragment id: a panel's own id, or a heading mapped into one. */
function fakePanelOf(groups: Group[], inside: Record<string, FakeTab> = {}) {
  return (id: string): FakeTab | undefined => {
    const mapped = inside[id];
    if (mapped) return mapped;
    for (const { panels } of groups) {
      const panel = panels.find((candidate) => candidate.id === id);
      if (panel) return panel;
    }
    return undefined;
  };
}

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

test("an unknown ?lang= leaves every group on its first tab and remembers nothing", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  const { env, written } = fakeEnv([a], { search: `?${LANG_PARAM}=Ghost` });
  sync(env);
  assert.deepEqual(selected(a.tabs), ["true", "false"]);
  assert.deepEqual([...written], []);
});

test("hashId() strips the # and decodes, rejecting empty or malformed fragments", () => {
  assert.equal(hashId("#install-panel-2"), "install-panel-2");
  assert.equal(hashId("#%D9%86%D8%B5%D8%A8"), "نصب");
  assert.equal(hashId("#"), undefined);
  assert.equal(hashId(""), undefined);
  assert.equal(hashId("#   "), undefined);
  assert.equal(hashId("#%E0%A4%A"), undefined, "a broken escape fails soft");
});

test("withLang() sets the language and keeps every other parameter where it was", () => {
  assert.equal(withLang("?q=beacon&page=2", "pnpm"), "?q=beacon&page=2&lang=pnpm");
  assert.equal(withLang("?lang=npm&q=beacon", "pnpm"), "?lang=pnpm&q=beacon");
  assert.equal(withLang("", "npm"), "?lang=npm");
  assert.equal(withLang("?q=1", "جدید"), "?q=1&lang=%D8%AC%D8%AF%DB%8C%D8%AF");
});

test("targetOf() resolves a panel id and a heading inside a panel to its group", () => {
  const a = fakeGroup(["npm", "pnpm", "yarn"]);
  const b = fakeGroup(["npm", "pnpm"]);
  const panelOf = fakePanelOf([a, b], { "install-heading": a.panels[2]! });

  assert.equal(targetOf([a.group, b.group], panelOf, "#p3")?.group, a.group);
  assert.equal(targetOf([a.group, b.group], panelOf, "#p3")?.index, 2);
  assert.equal(targetOf([a.group, b.group], panelOf, "#install-heading")?.index, 2);
  assert.equal(targetOf([a.group, b.group], panelOf, "#nope"), undefined);
  assert.equal(targetOf([a.group, b.group], panelOf, "#"), undefined);
});

test("targetOf() ignores a group whose tabs and panels do not pair up", () => {
  const broken = fakeGroup(["npm", "pnpm"]);
  broken.panels.pop();
  assert.equal(targetOf([broken.group], fakePanelOf([broken]), "#p1"), undefined);
});

test("revealHash() shows the hidden panel a fragment names, without moving focus", () => {
  const a = fakeGroup(["npm", "pnpm", "yarn"]);
  const panelOf = fakePanelOf([a]);
  assert.equal(revealHash([a.group], panelOf, "#p3"), true);
  assert.deepEqual(selected(a.tabs), ["false", "false", "true"]);
  assert.deepEqual(shown(a.panels), [false, false, true]);
  assert.deepEqual(
    a.tabs.map((tab) => tab.focused),
    [false, false, false],
    "revealing a panel leaves the reader's focus alone",
  );
});

test("revealHash() reports nothing when the panel is already shown", () => {
  const a = fakeGroup(["npm", "pnpm"]);
  assert.equal(revealHash([a.group], fakePanelOf([a]), "#p1"), false);
  assert.deepEqual(shown(a.panels), [true, false]);
});

test("revealHash() leaves a stacked group fully visible and a stale fragment alone", () => {
  const stacked = fakeGroup(["npm", "pnpm"], { enhanced: false });
  assert.equal(revealHash([stacked.group], fakePanelOf([stacked]), "#p2"), false);
  assert.deepEqual(shown(stacked.panels), [true, true], "no panel is hidden when the island did not run");

  const a = fakeGroup(["npm", "pnpm"]);
  choose(a.group, "pnpm");
  assert.equal(revealHash([a.group], fakePanelOf([a]), "#removed"), false);
  assert.deepEqual(shown(a.panels), [false, true], "the current panel stays up");
});

test("a fragment inside a closed panel opens its group after ?lang= and leaves other groups alone", () => {
  const a = fakeGroup(["npm", "pnpm", "yarn"]);
  const b = fakeGroup(["npm", "pnpm"]);
  const panelOf = fakePanelOf([a, b], { "yarn-heading": a.panels[2]! });
  const { env, written } = fakeEnv([a, b], { search: `?${LANG_PARAM}=pnpm` });

  sync(env);
  assert.deepEqual(shown(b.panels), [false, true], "the shared label applies to the other group");
  assert.equal(revealHash([a.group, b.group], panelOf, "#yarn-heading"), true);
  assert.deepEqual(shown(a.panels), [false, false, true], "the fragment picks the panel in its own group");
  assert.deepEqual(shown(b.panels), [false, true], "and leaves the other group alone");
  assert.deepEqual([...written], [], "opening a shared fragment is not a choice to remember");
});

test("urlFor() keeps unrelated parameters and an unrelated fragment", () => {
  assert.equal(urlFor("?q=beacon&lang=npm", "#install", "pnpm", false), "?q=beacon&lang=pnpm#install");
  assert.equal(urlFor("?q=beacon", "", "pnpm", false), "?q=beacon&lang=pnpm");
});

test("urlFor() drops a fragment that points into the group being switched", () => {
  assert.equal(urlFor("?lang=npm", "#install-panel-2", "pnpm", true), "?lang=pnpm");
});

test("share() replaces the current entry, so choosing the same label again adds no history", () => {
  const replaced: string[] = [];
  const replace = (url: string): void => {
    replaced.push(url);
  };
  share({ search: () => "?q=beacon&lang=npm", hash: () => "#install", replace }, "pnpm", false);
  share({ search: () => "?q=beacon&lang=pnpm", hash: () => "#install", replace }, "pnpm", false);
  assert.deepEqual(replaced, ["?q=beacon&lang=pnpm#install", "?q=beacon&lang=pnpm#install"]);
});

test("share() ignores a browser that refuses the new URL", () => {
  assert.doesNotThrow(() =>
    share(
      {
        search: () => "",
        hash: () => "",
        replace: () => {
          throw new Error("refused");
        },
      },
      "npm",
      false,
    ),
  );
});
