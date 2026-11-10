import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, Heading, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import commandPalette, { PALETTE_ATTRIBUTE, paletteJson, payloadFor } from "../chrome/command-palette/index.ts";
import {
  filterActions,
  matchesAction,
  paletteActions,
  pageUrl,
  THEME_CHOICES,
  type PaletteAction,
  type PalettePayload,
} from "../chrome/command-palette/actions.ts";
import searchDialog from "../chrome/search/index.ts";
import {
  ACTIONS_LABEL,
  activate,
  actionNodes,
  filterActions as clientFilterActions,
  isPaletteRun,
  liveHandlers,
  matchesAction as clientMatchesAction,
  MESSAGES,
  parsePalette,
  renderPalette,
  resolveTheme,
  THEME_KEY,
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
  type SearchPaletteSource,
  type SearchParts,
  type SearchRecord,
  type SearchResults,
  type SearchStatus,
} from "../chrome/search/client.ts";
import { languages, stringsOf, t } from "../i18n/index.ts";

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

function heading(depth: Heading["depth"], id: string, text: string): Heading {
  return { depth, id, text, pos };
}

const headings: readonly Heading[] = [
  heading(1, "install", "Install"),
  heading(2, "requirements", "Requirements"),
  heading(2, "cache", "Cache"),
];

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings,
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

function props(overrides: Partial<SiteConfig> = {}, page: Page = pageWith()): ChromeProps {
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
  const { children, dangerouslySetInnerHTML, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  const inner = dangerouslySetInnerHTML
    ? String((dangerouslySetInnerHTML as { __html?: string }).__html ?? "")
    : html(children);
  const VOID = new Set(["meta", "link", "input"]);
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function payloadFrom(node: unknown): PalettePayload {
  const out = html(node);
  const match = /<script type="application\/json" data-palette-actions="">([\s\S]*?)<\/script>/.exec(out);
  assert.ok(match, "the palette script is rendered");
  return JSON.parse(match[1] ?? "") as PalettePayload;
}

function actionIds(actions: readonly PaletteAction[]): string[] {
  return actions.map((action) => action.id);
}

test("paletteActions lists the theme choices, copy, and sections in reading order", () => {
  const actions = paletteActions({ page: pageWith(), base: "" });

  assert.deepEqual(actionIds(actions), [
    "theme-light",
    "theme-dark",
    "theme-system",
    "copy-markdown",
    "section-requirements",
    "section-cache",
  ]);
  assert.deepEqual(
    actions.slice(0, 3).map((action) => action.run),
    [
      { kind: "theme", choice: "light" },
      { kind: "theme", choice: "dark" },
      { kind: "theme", choice: "system" },
    ],
  );
  assert.deepEqual(actions[3]?.run, { kind: "copy", url: "/guide/install/index.md" });
  assert.deepEqual(actions[4]?.run, { kind: "section", id: "requirements" });
  assert.deepEqual(THEME_CHOICES, ["light", "dark", "system"]);
});

test("the page title is not offered as a section, and a page without a twin gets no copy action", () => {
  const page = pageWith({ kind: "app", url: "/app/" });
  const actions = paletteActions({ page, base: "" });

  assert.deepEqual(actionIds(actions), [
    "theme-light",
    "theme-dark",
    "theme-system",
    "section-requirements",
    "section-cache",
  ]);
  assert.equal(actions.some((action) => action.run?.kind === "copy"), false);
});

test("an HTML page's Markdown twin is named by the same rule as the copy control", () => {
  const actions = paletteActions({ page: pageWith({ url: "/404.html" }), base: "" });
  const copy = actions.find((action) => action.id === "copy-markdown");

  assert.deepEqual(copy?.run, { kind: "copy", url: "/404.md" });
});

test("base is added only when the page URL does not already carry it", () => {
  assert.equal(pageUrl("/guide/", "/example"), "/example/guide/");
  assert.equal(pageUrl("/example/guide/", "/example"), "/example/guide/");
  assert.equal(pageUrl("/guide/", "/example/"), "/example/guide/");
  assert.equal(pageUrl("/guide/", ""), "/guide/");

  const actions = paletteActions({ page: pageWith({ url: "/guide/install/" }), base: "/example" });
  assert.deepEqual(actions.find((action) => action.id === "copy-markdown")?.run, {
    kind: "copy",
    url: "/example/guide/install/index.md",
  });
});

test("labels and hints are localised in English, Persian, and Arabic", () => {
  const en = paletteActions({ page: pageWith({ lang: "en" }), base: "" });
  const fa = paletteActions({ page: pageWith({ lang: "fa" }), base: "" });
  const ar = paletteActions({ page: pageWith({ lang: "ar" }), base: "" });

  assert.equal(en[0]?.label, "Light");
  assert.equal(en[1]?.label, "Dark");
  assert.equal(en[2]?.label, "System");
  assert.equal(en[3]?.label, "Copy page as Markdown");
  assert.equal(en[4]?.label, "Requirements");
  assert.equal(en[4]?.hint, "Go to section");

  for (const actions of [fa, ar]) {
    assert.notEqual(actions[0]?.label, en[0]?.label);
    assert.notEqual(actions[3]?.label, en[3]?.label);
    assert.notEqual(actions[4]?.hint, en[4]?.hint);
  }
  assert.equal(fa[0]?.label, t("fa", "mode_light"));
  assert.equal(fa[2]?.label, t("fa", "mode_system"));
  assert.equal(ar[3]?.label, t("ar", "copy_page_md"));
  assert.equal(ar[4]?.hint, t("ar", "command_go_to_section"));

  assert.equal(stringsOf("fa").command_actions, "فرمان‌ها");
  assert.equal(stringsOf("ar").command_actions, "الإجراءات");
  for (const lang of languages) {
    assert.equal(t(lang, "command_actions"), stringsOf(lang).command_actions);
    assert.equal(t(lang, "mode_system"), stringsOf(lang).mode_system);
  }
});

test("every action id is unique and names its kind", () => {
  const actions = paletteActions({ page: pageWith(), base: "" });
  assert.equal(new Set(actionIds(actions)).size, actions.length);
  for (const action of actions) {
    assert.match(action.id, /^(theme|copy|section)-/);
  }
});

test("filterActions matches labels, hints, and ids on one case-insensitive query", () => {
  const actions = paletteActions({ page: pageWith(), base: "" });

  assert.deepEqual(actionIds(filterActions(actions, "")), actionIds(actions));
  assert.deepEqual(actionIds(filterActions(actions, "DARK")), ["theme-dark"]);
  assert.deepEqual(actionIds(filterActions(actions, "go to section")), ["section-requirements", "section-cache"]);
  assert.deepEqual(actionIds(filterActions(actions, "copy")), ["copy-markdown"]);
  assert.deepEqual(actionIds(filterActions(actions, "  ")), actionIds(actions));
  assert.deepEqual(actionIds(filterActions(actions, "nothing")), []);
  assert.deepEqual(actionIds(filterActions(actions, "theme")), ["theme-light", "theme-dark", "theme-system"]);
  assert.deepEqual(actionIds(filterActions(actions, "z")), []);
  assert.equal(
    matchesAction({ id: "custom", label: "Alpha", hint: "Switch theme" }, "t"),
    false,
    "one letter does not match a hint word",
  );
  assert.equal(matchesAction(actions[0]!, "light"), true);
  assert.equal(matchesAction(actions[0]!, "dark"), false);
});

test("the command palette unit publishes one inert JSON script and no second dialog", () => {
  const out = html(commandPalette(props({}, pageWith({ headings }))));
  assert.match(out, /^<script type="application\/json" data-palette-actions="">/);
  assert.match(out, /<\/script>$/);
  assert.doesNotMatch(out, /<dialog\b/);
  assert.match(out, new RegExp(` ${PALETTE_ATTRIBUTE}=""`));

  const payload = payloadFrom(commandPalette(props()));
  assert.equal(payload.label, "Actions");
  assert.deepEqual(actionIds(payload.actions), actionIds(paletteActions({ page: pageWith(), base: "" })));
  assert.deepEqual(payloadFor(pageWith(), ""), payload);
});

test("the script JSON cannot close its own tag", () => {
  const page = pageWith({ headings: [heading(2, "less", "A < B")] });
  const json = paletteJson(payloadFor(page, ""));

  assert.doesNotMatch(json, /</);
  assert.match(json, /\\u003c B/);
  assert.equal((JSON.parse(json) as PalettePayload).actions.at(-1)?.label, "A < B");
});

test("the search dialog keeps one dialog and unique ids, and carries the palette payload", () => {
  const out = html(searchDialog(props()));
  const payload = payloadFrom(searchDialog(props()));

  assert.equal(out.match(/<dialog\b/g)?.length, 1);
  const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, [...new Set(ids)]);
  assert.equal(out.match(/id="search-input"/g)?.length, 1);
  assert.equal(new Set(actionIds(payload.actions)).size, payload.actions.length);
  assert.match(out, /<div class="search-results" role="listbox" aria-label="Search" data-search-results="">/);
});

test("the palette groups page results before the matched actions", () => {
  const actions = paletteActions({ page: pageWith(), base: "" });
  const records: readonly SearchRecord[] = [
    { url: "/guide/cache/", excerpt: "About <mark>cache</mark>.", meta: { title: "Cache" }, filters: { section: ["guide"] } },
  ];
  const results = fakeResults();

  renderPalette(results, {
    actions: filterActions(actions, "cache"),
    label: "Actions",
    records,
    doc: fakeDocument(),
    run() {},
  });

  assert.deepEqual(groupTitles(results.nodes), ["guide", "Actions"]);
  const all = walkAll(results.nodes);
  assert.equal(findClass(all, "search-result-excerpt") !== undefined, true);
  const button = all.find((node) => node.attrs["data-palette-action"] === "section-cache");
  assert.ok(button);
  assert.equal(button.attrs.role, "option");
  assert.equal(button.attrs.class, "search-action-button");
  assert.equal(textOf(button), "CacheGo to section");
});

test("action labels and hints are text nodes, never markup", () => {
  const nodes = actionNodes(
    [{ id: "copy", label: "<img src=x>", hint: "<b>Copy</b>", run: { kind: "copy", url: "/x.md" } }],
    "Actions",
    fakeDocument(),
    () => {},
  );
  const all = walkAll(nodes);

  assert.equal(all.some((node) => node.tag === "img" || node.tag === "b"), false);
  assert.equal(textOf(findClass(all, "search-action-label")!), "<img src=x>");
  assert.equal(textOf(findClass(all, "search-action-hint")!), "<b>Copy</b>");
});

test("an empty action list draws no Actions group", () => {
  assert.deepEqual(actionNodes([], "Actions", fakeDocument(), () => {}), []);
});

test("parsePalette keeps valid actions and drops malformed or unknown ones", () => {
  const payload = {
    label: "Actions",
    actions: [
      { id: "theme-dark", label: "Dark", run: { kind: "theme", choice: "dark" } },
      { id: "copy", label: "Copy", hint: "Markdown", run: { kind: "copy", url: "/x.md" } },
      { id: "section", label: "Heading", run: { kind: "section", id: "heading" } },
      { id: "missing-label", run: { kind: "section", id: "x" } },
      { id: "bad-run", label: "Bad", run: { kind: "run-script", url: "javascript:alert(1)" } },
      { id: "bad-theme", label: "Bad", run: { kind: "theme", choice: "sepia" } },
      { id: "copy-empty", label: "Bad", run: { kind: "copy", url: "" } },
    ],
  };

  assert.deepEqual(actionIds(parsePalette(JSON.stringify(payload)).actions), ["theme-dark", "copy", "section"]);
  assert.equal(parsePalette("not json").label, ACTIONS_LABEL);
  assert.deepEqual(parsePalette("not json").actions, []);
  assert.deepEqual(parsePalette(null).actions, []);
  assert.deepEqual(parsePalette("{}").actions, []);
  assert.equal(parsePalette(JSON.stringify({ label: "", actions: [] })).label, ACTIONS_LABEL);
  assert.equal(isPaletteRun({ kind: "theme", choice: "light" }), true);
  assert.equal(isPaletteRun({ kind: "theme", choice: "sepia" }), false);
  assert.equal(isPaletteRun({ kind: "copy", url: "" }), false);
  assert.equal(isPaletteRun({ kind: "section" }), false);
  assert.equal(isPaletteRun(null), false);
});

test("the client's filter keeps step with the pure one", () => {
  const actions = paletteActions({ page: pageWith(), base: "" });
  for (const query of ["", "dark", "section", "copy", "zzz"]) {
    assert.deepEqual(actionIds(clientFilterActions(actions, query)), actionIds(filterActions(actions, query)));
    for (const action of actions) {
      assert.equal(clientMatchesAction(action, query), matchesAction(action, query));
    }
  }
});

test("opening the dialog with an empty query shows the actions and clears the status", async () => {
  const { button, results, status, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  assert.deepEqual(groupTitles(results.nodes), ["Actions"]);
  assert.equal(results.nodes.length > 0, true);
  assert.equal(status.textContent, "");
});

test("one query filters the Actions group and the page results together", async () => {
  const records: readonly SearchRecord[] = [
    { url: "/guide/cache/", excerpt: "About <mark>cache</mark>.", meta: { title: "Cache" }, filters: { section: ["guide"] } },
  ];
  const { button, input, results, status, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();

  input.type("cache");
  await tick();

  assert.deepEqual(groupTitles(results.nodes), ["guide", "Actions"]);
  const action = walkAll(results.nodes).find((node) => node.attrs["data-palette-action"] === "section-cache");
  assert.ok(action);
  assert.equal(status.textContent, "1 result.");
});

test("an action-only match keeps the empty-result message out of the status", async () => {
  const { button, input, results, status, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  input.type("dark");
  await tick();

  assert.deepEqual(groupTitles(results.nodes), ["Actions"]);
  assert.equal(status.textContent, "");
});

test("a query with no action and no result announces it", async () => {
  const { button, input, status, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  input.type("zzz");
  await tick();

  assert.equal(status.textContent, "No results for “zzz”.");
});

test("clicking a theme action writes the theme key and applies data-theme", async () => {
  const calls: unknown[] = [];
  const { button, results, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([]), { theme: (choice) => calls.push(choice) }));
  button.click();
  await tick();

  clickAction(results.nodes, "theme-dark");

  assert.deepEqual(calls, ["dark"]);
});

test("clicking copy fetches and announces success or failure", async () => {
  const copied: string[] = [];
  let fail = false;
  const { button, results, status, parts } = partsOf(payloadOf(pageWith()));
  activate(
    parts,
    envWith(apiOf([]), {
      copy: (url) => {
        copied.push(url);
        return fail ? Promise.reject(new Error("offline")) : Promise.resolve();
      },
    }),
  );
  button.click();
  await tick();

  clickAction(results.nodes, "copy-markdown");
  await tick();
  assert.deepEqual(copied, ["/guide/install/index.md"]);
  assert.equal(status.textContent, MESSAGES.copied);

  fail = true;
  clickAction(results.nodes, "copy-markdown");
  await tick();
  assert.equal(status.textContent, MESSAGES.copyFailed);
});

test("clicking a section action jumps to the heading and closes the dialog", async () => {
  const jumped: string[] = [];
  const { button, dialog, results, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([]), { section: (id) => jumped.push(id) }));
  button.click();
  await tick();

  clickAction(results.nodes, "section-requirements");

  assert.deepEqual(jumped, ["requirements"]);
  assert.equal(dialog.open, false);
  assert.equal(dialog.closes, 1);
});

test("Enter in the field runs the first item, even when it is an action", async () => {
  const calls: unknown[] = [];
  const { button, dialog, input, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([]), { theme: (choice) => calls.push(choice) }));
  button.click();
  await tick();

  const event = key("Enter", input);
  dialog.fire("keydown", event);

  assert.equal(event.prevented, true);
  assert.deepEqual(calls, ["light"]);
});

test("arrow keys move from page results to actions as one list", async () => {
  const records: readonly SearchRecord[] = [
    { url: "/guide/cache/", excerpt: "About <mark>cache</mark>.", meta: { title: "Cache" }, filters: { section: ["guide"] } },
  ];
  const { button, dialog, input, results, parts } = partsOf(payloadOf(pageWith({ headings: [heading(2, "cache", "Cache")] })));
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  const items = walkAll(results.nodes).filter(
    (node) => node.attrs["data-palette-action"] !== undefined || node.tag === "a",
  );
  assert.equal(items.length, 2, "one page result and one action");

  const down = key("ArrowDown", input);
  dialog.fire("keydown", down);
  assert.equal(down.prevented, true);
  assert.equal(items[0]?.focused, 1);

  dialog.fire("keydown", key("ArrowDown", items[0]));
  assert.equal(items[1]?.focused, 1, "past the last result, focus moves into the actions");

  dialog.fire("keydown", key("ArrowDown", items[1]));
  assert.equal(items[0]?.focused, 2, "past the last action, focus wraps to the first result");
});

test("a redraw keeps keyboard focus on the same action", async () => {
  const { button, input, results, parts } = partsOf(payloadOf(pageWith()));
  const env = envWith(apiOf([]));
  activate(parts, env);
  button.click();
  await tick();

  const before = walkAll(results.nodes).find((node) => node.attrs["data-palette-action"] === "section-cache");
  assert.ok(before, "the section action is rendered for the empty query");
  (env.document as unknown as { activeElement?: unknown }).activeElement = before;
  assert.equal(results.contains(before as unknown as SearchNode), true);

  input.type("cache");
  await tick();

  const after = walkAll(results.nodes).find((node) => node.attrs["data-palette-action"] === "section-cache");
  assert.ok(after);
  assert.equal(after.focused, 1, "the matching action keeps focus after the redraw");
});

test("the dialog's listbox is built with action buttons and result links only", async () => {
  const { button, results, parts } = partsOf(payloadOf(pageWith()));
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  const all = walkAll(results.nodes);
  assert.equal(all.some((node) => node.tag === "script"), false);
  assert.equal(all.some((node) => node.tag === "img"), false);
  assert.equal(all.filter((node) => node.attrs["data-palette-action"] !== undefined).length, 6);
});

test("liveHandlers writes the theme key, applies data-theme, and resolves system", () => {
  const written: Array<[string, string]> = [];
  const attrs: Record<string, string> = {};
  let prefersLight = false;
  const handlers = liveHandlers({
    localStorage: { setItem: (key, value) => written.push([key, value]) },
    document: { documentElement: { setAttribute: (key, value) => (attrs[key] = value) } },
    matchMedia: () => ({ matches: prefersLight }),
  });

  handlers.theme?.("light");
  assert.deepEqual(written, [[THEME_KEY, "light"]]);
  assert.equal(attrs["data-theme"], "light");

  handlers.theme?.("system");
  assert.equal(attrs["data-theme"], "dark");
  prefersLight = true;
  handlers.theme?.("system");
  assert.equal(attrs["data-theme"], "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("system", false), "dark");
  assert.equal(THEME_KEY, "slipway-theme");
});

test("liveHandlers copies the Markdown twin and jumps to a heading", async () => {
  let fetched = "";
  let copied = "";
  const headingTarget = {
    attrs: {} as Record<string, string>,
    scrolled: 0,
    focused: 0,
    setAttribute(name: string, value: string) {
      headingTarget.attrs[name] = value;
    },
    scrollIntoView() {
      headingTarget.scrolled += 1;
    },
    focus() {
      headingTarget.focused += 1;
    },
  };
  const handlers = liveHandlers({
    navigator: { clipboard: { writeText: (text) => ((copied = text), Promise.resolve()) } },
    fetch: (url) => {
      fetched = url;
      return Promise.resolve({ ok: true, text: () => Promise.resolve("# Install\n") });
    },
    document: { getElementById: (id) => (id === "install" ? headingTarget : null) },
  });

  await handlers.copy?.("/guide/install/index.md");
  assert.equal(fetched, "/guide/install/index.md");
  assert.equal(copied, "# Install\n");

  handlers.section?.("install");
  assert.equal(headingTarget.attrs.tabindex, "-1");
  assert.equal(headingTarget.scrolled, 1);
  assert.equal(headingTarget.focused, 1);
});

test("a failed twin fetch rejects so the palette can announce it", async () => {
  const handlers = liveHandlers({
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve("missing") }),
  });

  await assert.rejects(handlers.copy?.("/missing.md") ?? Promise.resolve());
});

test("search style.css keeps token-only values, logical properties, and visible action focus", () => {
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
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);

  const declarations = css.replace(/@media[^{]*\{/g, "");
  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.search-action-button:focus-visible \{/);
  assert.match(css, /outline: 2px solid var\(--state-focus-ring\);/);
});

// ---------------------------------------------------------------------------
// Fakes shared by the activation tests.

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function payloadOf(page: Page): PalettePayload {
  return payloadFor(page, "");
}

function fakeButton() {
  const fake = {
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

function fakeInput() {
  const listeners: Array<() => void> = [];
  const fake = {
    value: "",
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

interface FakeNode {
  tag: string;
  text?: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  listeners: Array<() => void>;
  focused: number;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(...nodes: SearchNode[]): void;
  addEventListener?(type: string, listener: () => void): void;
  click?(): void;
  focus?(): void;
}

/** A tiny document for the palette renderer: elements hold attributes, text nodes hold text. */
function fakeDocument(): SearchDocument {
  const make = (tag: string, text?: string): FakeNode => {
    const node: FakeNode = {
      tag,
      ...(text === undefined ? {} : { text }),
      attrs: {},
      children: [],
      listeners: [],
      focused: 0,
      setAttribute(name: string, value: string) {
        node.attrs[name] = value;
      },
      getAttribute(name: string) {
        return node.attrs[name] ?? null;
      },
      append(...nodes: SearchNode[]) {
        for (const child of nodes) node.children.push(child as unknown as FakeNode);
      },
      click() {
        for (const listener of node.listeners) listener();
      },
      focus() {
        node.focused += 1;
      },
    };
    if (tag === "button" || tag === "a") {
      node.addEventListener = (type, listener) => {
        if (type === "click") node.listeners.push(listener);
      };
    }
    return node;
  };
  return {
    createElement: (tag: string) => make(tag) as unknown as SearchElement,
    createTextNode: (text: string) => make("#text", text) as unknown as SearchNode,
  };
}

function walkAll(nodes: readonly SearchNode[]): FakeNode[] {
  return nodes.flatMap((node) => {
    const fake = node as unknown as FakeNode;
    return [fake, ...walkAll(fake.children)];
  });
}

function findClass(nodes: readonly FakeNode[], name: string): FakeNode | undefined {
  return nodes.find((node) => node.attrs.class === name);
}

function textOf(node: FakeNode): string {
  return node.tag === "#text" ? node.text ?? "" : node.children.map(textOf).join("");
}

function groupTitles(nodes: readonly SearchNode[]): string[] {
  return walkAll(nodes)
    .filter((node) => node.attrs.class === "search-group-title")
    .map(textOf);
}

function clickAction(nodes: readonly SearchNode[], id: string): void {
  const button = walkAll(nodes).find((node) => node.attrs["data-palette-action"] === id);
  assert.ok(button, `an action button for ${id}`);
  button.click?.();
}

function fakeResults() {
  const fake = {
    nodes: [] as SearchNode[],
    replaceChildren(...nodes: SearchNode[]) {
      fake.nodes = nodes;
    },
    querySelectorAll(selector: string): Iterable<SearchLink> {
      assert.match(selector, /a\[href\]/);
      return walkAll(fake.nodes).filter(
        (node) => node.attrs["data-palette-action"] !== undefined || (node.tag === "a" && node.attrs.href !== undefined),
      ) as unknown as SearchLink[];
    },
    contains(node: SearchNode) {
      return walkAll(fake.nodes).includes(node as unknown as FakeNode);
    },
  };
  return fake;
}

function fakeStatus(): SearchStatus {
  return { textContent: "" };
}

function fakeDialog(options: { focusables?: SearchFocusable[] } = {}) {
  const listeners: Record<string, Array<(event: SearchEvent) => void>> = {};
  const fake = {
    open: false,
    hidden: true,
    shows: 0,
    closes: 0,
    base: "",
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

function partsOf(palette: PalettePayload) {
  const dialog = fakeDialog();
  const button = fakeButton();
  const close = fakeButton();
  const input = fakeInput();
  const results = fakeResults();
  const status = fakeStatus();
  const source: SearchPaletteSource = { textContent: JSON.stringify(palette) };
  const parts: SearchParts = {
    dialog: dialog as unknown as SearchDialog,
    button: button as unknown as SearchButton,
    close: close as unknown as SearchClose,
    input: input as unknown as SearchInput,
    results: results as unknown as SearchResults,
    status,
    palette: source,
  };
  return { dialog, button, close, input, results, status, parts };
}

function apiOf(data: readonly SearchRecord[]): PagefindApi {
  return {
    search: () => Promise.resolve({ results: data.map((record) => ({ data: () => Promise.resolve(record) })) }),
  };
}

function envWith(
  api: PagefindApi,
  handlers?: {
    theme?(choice: "light" | "dark" | "system"): void;
    copy?(url: string): void | Promise<void>;
    section?(id: string): void;
  },
) {
  return {
    document: fakeDocument(),
    load: () => Promise.resolve(api),
    ...(handlers === undefined ? {} : { handlers }),
  };
}
