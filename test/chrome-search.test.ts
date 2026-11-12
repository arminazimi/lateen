import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment, h } from "preact";
import type { ChromeProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import { stringsOf } from "../i18n/index.ts";
import search, { SEARCH_INPUT_ID, SEARCH_RESULTS_ID } from "../chrome/search/index.ts";
import {
  groupBySection,
  optionList,
  OTHER_SECTION,
  safeHref,
  sectionOf,
  type OptionList,
  type SearchRecord,
} from "../chrome/search/options.ts";
import {
  activate,
  countMessage,
  emptyMessage,
  indexUrl,
  langFrom,
  MESSAGES,
  messagesFrom,
  PLURAL_CATEGORIES,
  pluralCategory,
  renderOptions,
  trap,
  type MessageSource,
  type PagefindApi,
  type SearchButton,
  type SearchClose,
  type SearchDialog,
  type SearchDocument,
  type SearchElement,
  type SearchEnv,
  type SearchEvent,
  type SearchFocusable,
  type SearchInput,
  type SearchMessages,
  type SearchNode,
  type SearchParts,
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
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  const VOID = new Set(["meta", "link", "input"]);
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

/** One attribute of the rendered markup, from its first match. */
function attribute(out: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(out)?.[1];
}

test("renders a closed, hidden dialog that carries the site base", () => {
  const out = html(search(props({ base: "/example" })));

  assert.match(out, /^<dialog class="search" data-search="" data-base="\/example"/);
  assert.match(out, /aria-label="Search"/);
  assert.match(out, /\bhidden>/);
  assert.doesNotMatch(out, /<dialog[^>]* open/);
  assert.match(out, /<\/dialog>$/);
});

test("holds the query field, a close button, the status region, and the result container", () => {
  const out = html(search(props()));

  assert.match(out, /<label class="search-label" for="search-input">Search<\/label>/);
  assert.match(out, /class="search-input" id="search-input"/);
  assert.match(
    out,
    /<button type="button" class="search-close" aria-label="Close search" data-search-close=""><span aria-hidden="true">×<\/span><\/button>/,
  );
  assert.match(out, /<p class="search-status" role="status" data-search-status=""><\/p>/);
});

test("the field is a combobox that names and controls the result list", () => {
  const out = html(search(props()));

  assert.match(
    out,
    /<input class="search-input" id="search-input" type="search" name="q" placeholder="Search the docs" autocomplete="off" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="search-results-list" aria-autocomplete="list" data-search-input="">/,
  );
  assert.match(
    out,
    /<div class="search-results" id="search-results-list" role="listbox" aria-label="Search" data-search-results=""><\/div>/,
  );
  assert.equal(attribute(out, "aria-controls"), SEARCH_RESULTS_ID);
  assert.equal(out.match(new RegExp(`id="${SEARCH_RESULTS_ID}"`, "g"))?.length, 1, "one list for the field to control");
});

test("the static markup promises no active option, because no row has been drawn yet", () => {
  const out = html(search(props()));

  assert.equal(attribute(out, "aria-activedescendant"), undefined, "a reference to a row that is not there dangles");
  assert.doesNotMatch(out, /role="option"/);
  assert.doesNotMatch(out, /aria-selected/);
});

test("every id the dialog carries statically is unique and every reference resolves", () => {
  const out = html(search(props()));
  const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);

  assert.deepEqual(ids, [...new Set(ids)], "one page, one dialog, one set of ids");
  assert.ok(ids.includes(SEARCH_INPUT_ID) && ids.includes(SEARCH_RESULTS_ID));
  assert.equal(/<label class="search-label" for="([^"]+)"/.exec(out)?.[1], SEARCH_INPUT_ID, "the label names the field");
});

test("the dialog carries every message the island shows, in the page language", () => {
  const out = html(search(props()));

  assert.equal(attribute(out, "data-search-lang"), "en");
  assert.equal(attribute(out, "data-search-loading"), "Loading search…");
  assert.equal(attribute(out, "data-search-searching"), "Searching…");
  assert.equal(attribute(out, "data-search-failed"), "Search is unavailable right now.");
  assert.equal(attribute(out, "data-search-empty"), "No results for “{query}”.");
  assert.equal(attribute(out, "data-search-count-zero"), "{n} results.");
  assert.equal(attribute(out, "data-search-count-one"), "{n} result.");
  assert.equal(attribute(out, "data-search-count-other"), "{n} results.");
  assert.equal(attribute(out, "data-search-other-section"), "Other");
  assert.equal(attribute(out, "data-search-copied"), "Copied");
  assert.equal(attribute(out, "data-search-copy-failed"), "Copy failed.");
  assert.equal(attribute(out, "data-search-actions"), "Actions");
});

test("the dialog reads right to left and speaks Persian without JavaScript", () => {
  const page = pageWith({ lang: "fa", dir: "rtl", url: "/fa/guide/install/" });
  const input: ChromeProps = {
    site: { config: { ...config, lang: "fa", dir: "rtl" }, pages: [page], nav: { main: [] }, data: {} },
    page,
    trail: [],
    pager: {},
  };
  const out = html(search(input));

  assert.match(out, /aria-label="جست‌وجو"/);
  assert.match(out, /placeholder="جست‌وجو در مستندات"/);
  assert.match(out, /aria-label="بستن جست‌وجو"/);
  assert.match(out, /data-search-lang="fa"/);
  assert.match(out, /data-search-empty="نتیجه‌ای برای «\{query\}» پیدا نشد\."/);
  assert.match(out, /data-search-count-one="\{n\} نتیجه\."/);
  assert.match(out, /\bhidden>/);
  // A right-to-left list keeps the same relationships: the field still controls the same one list.
  assert.match(out, /aria-controls="search-results-list"/);
  assert.match(out, /id="search-results-list" role="listbox"/);
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

/** The action rows the model tests need. */
function actionsOf(...ids: string[]): { readonly id: string; readonly label: string }[] {
  return ids.map((id) => ({ id, label: id }));
}

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

test("only links the browser can follow become an href", () => {
  assert.equal(safeHref("/rules/cache/"), "/rules/cache/");
  assert.equal(safeHref("./cache/"), "./cache/");
  assert.equal(safeHref("../cache/"), "../cache/");
  assert.equal(safeHref("HTTPS://example.com/a"), "HTTPS://example.com/a");
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("data:text/html,<script>alert(1)<\/script>"), undefined);
});

test("the option model gives every row an id, a key, and a group", () => {
  const list = optionList(records, actionsOf("theme-dark"), { actionsLabel: "Actions" });

  assert.deepEqual(
    list.rows.map((row) => row.id),
    ["search-option-1", "search-option-2", "search-option-3"],
  );
  assert.deepEqual(
    list.rows.map((row) => row.key),
    ["result:/rules/cache/#0", "result:/guide/install/#0", "action:theme-dark#0"],
  );
  assert.deepEqual(
    list.groups.map((group) => [group.heading, group.rows.length]),
    [
      ["rules", 1],
      ["guide", 1],
      ["Actions", 1],
    ],
  );
  assert.deepEqual(list.groups.map((group) => group.kind), ["result", "result", "action"]);
  assert.deepEqual(
    list.groups.map((group) => group.id),
    ["search-group-1", "search-group-2", "search-group-3"],
  );
  assert.deepEqual(list.rows, list.groups.flatMap((group) => group.rows));
});

test("a duplicate label or URL is still a distinct option", () => {
  const twice: readonly SearchRecord[] = [
    { url: "/same/", excerpt: "one", meta: { title: "Same" } },
    { url: "/same/", excerpt: "two", meta: { title: "Same" } },
  ];
  const list = optionList(twice, actionsOf("copy-markdown", "copy-markdown"));

  assert.deepEqual(
    list.rows.map((row) => row.id),
    ["search-option-1", "search-option-2", "search-option-3", "search-option-4"],
  );
  assert.equal(new Set(list.rows.map((row) => row.id)).size, 4, "no two rows ever share an id");
  assert.deepEqual(
    list.rows.map((row) => row.key),
    ["result:/same/#0", "result:/same/#1", "action:copy-markdown#0", "action:copy-markdown#1"],
  );
  assert.equal(new Set(list.rows.map((row) => row.key)).size, 4, "and never a key");
});

test("the model keeps each section's own heading and names Other in the page language", () => {
  const list = optionList(
    [{ url: "/a/", excerpt: "" }, { url: "/b/", excerpt: "", filters: { section: ["guide"] } }],
    [],
    { otherSection: "دیگر" },
  );

  assert.deepEqual(
    list.groups.map((group) => group.heading),
    ["دیگر", "guide"],
  );
  assert.deepEqual(
    list.rows.map((row) => row.href),
    ["/a/", "/b/"],
  );
});

test("an unsafe result keeps its row but loses its link, and nothing at all draws nothing", () => {
  assert.equal(optionList([{ url: "javascript:alert(1)", excerpt: "" }], []).rows[0]?.href, undefined);
  const empty = optionList([], []);
  assert.deepEqual(empty.groups, []);
  assert.deepEqual(empty.rows, []);
});

test("result text is built from text nodes: a page title cannot inject an element", () => {
  const nodes = drawnNodes(
    optionList(
      [
        {
          url: "/rules/cache/",
          excerpt: '<img src=x onerror="alert(1)">Clear the <mark onmouseover="alert(1)">cache</mark>.',
          meta: { title: "<script>alert(1)</script>" },
          filters: { section: ["rules"] },
        },
      ],
      [],
    ),
  );

  assert.equal(textOf(findClass(nodes, "search-result-title")!), "<script>alert(1)</script>");
  assert.equal(textOf(findClass(nodes, "search-result-excerpt")!), '<img src=x onerror="alert(1)">Clear the cache.');
  assert.ok(nodes.every((node) => node.tag !== "script" && node.tag !== "img"));
});

test("Pagefind entities are decoded for display and mark elements carry no attributes", () => {
  const nodes = drawnNodes(
    optionList(
      [{ url: "/guide/", excerpt: 'Tom & Jerry &lt;script&gt; <mark class="hit">cache</mark>', meta: { title: "A & B" } }],
      [],
    ),
  );

  assert.equal(textOf(findClass(nodes, "search-result-title")!), "A & B");
  assert.equal(textOf(findClass(nodes, "search-result-excerpt")!), "Tom & Jerry <script> cache");
  assert.deepEqual(nodes.find((node) => node.tag === "mark")?.attrs, {});
});

test("result nodes keep Pagefind's mark emphasis and the group order", () => {
  const nodes = drawnNodes(optionList(records, []));

  assert.deepEqual(sectionTitles(nodes), ["rules", "guide"]);
  assert.deepEqual(marks(nodes).map((mark) => textOf(mark)), ["cache", "cache"]);
});

test("a result whose URL is not a safe link is an option with nothing to follow", () => {
  const nodes = drawnNodes(optionList([{ url: "javascript:alert(1)", excerpt: "No link", meta: { title: "Bad" } }], []));
  const option = optionsOf(nodes)[0]!;

  assert.equal(option.tag, "span");
  assert.equal(option.attrs.href, undefined);
  assert.equal(option.attrs.role, "option", "it is still one choice of the list, and one a reader hears");
  assert.equal(option.attrs.tabindex, "-1", "and never a stop for Tab");
});

test("the list holds one option per row, in a group named by its heading", () => {
  const list = optionList(records, actionsOf("theme-dark", "copy-markdown"));
  const nodes = drawnNodes(list);
  const options = optionsOf(nodes);

  assert.deepEqual(
    options.map((option) => option.attrs.id),
    list.rows.map((row) => row.id),
  );
  assert.deepEqual(
    options.map((option) => option.attrs["data-search-option"]),
    list.rows.map((row) => row.key),
  );
  assert.equal(options.length, list.rows.length, "one option per row, and no more");

  // The row is the list's shape rather than a choice of its own, so nothing is counted twice.
  const rows = nodes.filter((node) => node.tag === "li");
  assert.equal(rows.length, options.length);
  assert.equal(rows.every((row) => row.attrs.role === "presentation"), true, "a row carries no role");
  assert.equal(rows.every((row, index) => row.children[0] === options[index]), true, "and holds exactly its own option");

  // The option is what a pointer uses as well: a real link for a result, a real button for an action.
  assert.deepEqual(
    options.filter((option) => option.tag === "a").map((link) => link.attrs.href),
    records.map((record) => record.url),
  );
  assert.deepEqual(
    options.filter((option) => option.tag === "button").map((button) => button.attrs["data-palette-action"]),
    ["theme-dark", "copy-markdown"],
  );
});

test("a heading is a heading: never an option, and the group is named by it", () => {
  const nodes = drawnNodes(optionList(records, actionsOf("theme-dark")));
  const titles = nodes.filter((node) => node.attrs.class === "search-group-title");
  assert.equal(titles.length, 3, "two sections and the actions");
  assert.equal(titles.every((title) => title.attrs.role === "presentation"), true);
  assert.deepEqual(optionsOf(titles), [], "no heading is ever one of the list's choices");

  for (const group of nodes.filter((node) => node.attrs.role === "group")) {
    const heading = nodes.find((node) => node.attrs.id === group.attrs["aria-labelledby"]);
    assert.equal(heading?.tag, "h2", "a group names itself by its heading");
    assert.ok(optionsOf(walkAll(group.children)).length > 0, "and owns at least one option");
  }
});

test("every option starts unselected and carries the key the dialog tracks it by", () => {
  const nodes = drawnNodes(optionList(records, actionsOf("theme-dark")));
  const options = optionsOf(nodes);

  for (const option of options) {
    assert.equal(option.attrs["aria-selected"], "false");
    assert.match(option.attrs["data-search-option"]!, /^(result|action):/);
  }
  assert.equal(options[2]?.attrs.class, "search-action-button");
  assert.equal(textOf(options[2]!), "theme-dark");
});

test("an action with no run descriptor is still an option a reader can reach", () => {
  const nodes = drawnNodes(optionList([], [{ id: "noop", label: "Nothing to run", hint: "Try later" }]));
  const option = optionsOf(nodes)[0]!;

  assert.equal(option.attrs.role, "option");
  assert.equal(textOf(option), "Nothing to runTry later");
  assert.equal(findClass(nodes, "search-action-button")?.attrs["data-palette-action"], "noop");
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
  assert.equal(countMessage(0), "0 results.");
});

test("the count follows the page language's CLDR plural category", () => {
  assert.deepEqual([...PLURAL_CATEGORIES], ["zero", "one", "two", "few", "many", "other"]);
  assert.equal(pluralCategory("en", 1), "one");
  assert.equal(pluralCategory("en", 0), "other");
  assert.equal(pluralCategory("ar", 0), "zero");
  assert.equal(pluralCategory("ar", 2), "two");
  assert.equal(pluralCategory("ar", 3), "few");
  assert.equal(pluralCategory("ar", 11), "many");
  assert.equal(pluralCategory("ar", 100), "other");

  const arabic: SearchMessages = {
    ...MESSAGES,
    counts: {
      zero: "{n} نتيجة",
      one: "{n} نتيجة",
      two: "{n} نتيجتان",
      few: "{n} نتائج",
      many: "{n} نتيجة",
      other: "{n} نتيجة",
    },
  };
  assert.equal(countMessage(0, "ar", arabic), "0 نتيجة");
  assert.equal(countMessage(1, "ar", arabic), "1 نتيجة");
  assert.equal(countMessage(2, "ar", arabic), "2 نتيجتان");
  assert.equal(countMessage(3, "ar", arabic), "3 نتائج");
  assert.equal(countMessage(11, "ar", arabic), "11 نتيجة");
  assert.equal(countMessage(100, "ar", arabic), "100 نتيجة");

  const persian: SearchMessages = {
    ...MESSAGES,
    counts: { zero: "{n} نتیجه", one: "{n} نتیجه", two: "{n} نتیجه", few: "{n} نتیجه", many: "{n} نتیجه", other: "{n} نتیجه" },
  };
  assert.equal(countMessage(0, "fa", persian), "0 نتیجه");
  assert.equal(countMessage(2, "fa", persian), "2 نتیجه");
});

test("messagesFrom reads the dialog's attributes and keeps the English fallback for missing ones", () => {
  const source: MessageSource = {
    getAttribute(name: string) {
      const attributes: Record<string, string> = {
        "data-search-lang": "ar",
        "data-search-failed": "البحث غير متاح الآن.",
        "data-search-count-zero": "{n} نتيجة",
        "data-search-count-two": "{n} نتيجتان",
      };
      return attributes[name] ?? null;
    },
  };
  const messages = messagesFrom(source);

  assert.equal(langFrom(source), "ar");
  assert.equal(messages.failed, "البحث غير متاح الآن.");
  assert.equal(messages.counts.zero, "{n} نتيجة");
  assert.equal(messages.counts.two, "{n} نتيجتان");
  assert.equal(messages.loading, MESSAGES.loading, "a missing attribute falls back to English");
  assert.equal(messages.counts.other, MESSAGES.counts.other);

  assert.equal(langFrom({ getAttribute: () => "" }), "en");
  assert.deepEqual(messagesFrom({ getAttribute: () => null }), MESSAGES);
});

// ---------------------------------------------------------------------------
// Fakes: a small DOM, and a dialog made of it.

/** Lets every pending promise in `activate` settle before the test asserts. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A node built by `fakeDocument`: an element has a tag and attributes, a text node has `#text` and `text`. */
interface FakeNode {
  tag: string;
  text?: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  listeners: Record<string, Array<() => void>>;
  focused: number;
  clicks: number;
  scrolls: number;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(...nodes: SearchNode[]): void;
  addEventListener(type: string, listener: () => void): void;
  click(): void;
  focus(): void;
  scrollIntoView(options: { readonly block: "nearest" }): void;
  /** Runs every listener of `type`, as a browser dispatching that event would. */
  fire(type: string): void;
}

/** A tiny document for the option renderer, so tests can inspect the tree without a browser. */
function fakeDocument(): SearchDocument {
  const make = (tag: string, text?: string): FakeNode => {
    const node: FakeNode = {
      tag,
      ...(text === undefined ? {} : { text }),
      attrs: {},
      children: [],
      listeners: {},
      focused: 0,
      clicks: 0,
      scrolls: 0,
      setAttribute(name: string, value: string) {
        node.attrs[name] = value;
      },
      getAttribute(name: string) {
        return node.attrs[name] ?? null;
      },
      append(...nodes: SearchNode[]) {
        for (const child of nodes) node.children.push(child as unknown as FakeNode);
      },
      addEventListener(type: string, listener: () => void) {
        (node.listeners[type] ??= []).push(listener);
      },
      click() {
        node.clicks += 1;
        for (const listener of node.listeners["click"] ?? []) listener();
      },
      focus() {
        node.focused += 1;
      },
      scrollIntoView() {
        node.scrolls += 1;
      },
      fire(type: string) {
        for (const listener of node.listeners[type] ?? []) listener();
      },
    };
    return node;
  };
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

/** The options of a drawn list, in the order the arrow keys walk them. */
function optionsOf(nodes: readonly FakeNode[]): FakeNode[] {
  return nodes.filter((node) => node.attrs.role === "option");
}

/** The rows a drawn list holds: the presentational shape around each option. */
function wrappersOf(results: { nodes: readonly SearchNode[] }): FakeNode[] {
  return walkAll(results.nodes).filter((node) => node.tag === "li");
}

/** The group headings, in order, of a node tree already walked. */
function sectionTitles(nodes: readonly FakeNode[]): string[] {
  return nodes.filter((node) => node.attrs.class === "search-group-title").map(textOf);
}

/** Every `<mark>` element of a node tree already walked. */
function marks(nodes: readonly FakeNode[]): FakeNode[] {
  return nodes.filter((node) => node.tag === "mark");
}

function fakeResults() {
  const fake = {
    nodes: [] as SearchNode[],
    replaceChildren(...nodes: SearchNode[]) {
      fake.nodes = nodes;
    },
  };
  return fake;
}

/** The whole DOM a list draws, so the model and the elements can be compared. */
function drawnNodes(list: OptionList): FakeNode[] {
  const results = fakeResults();
  renderOptions(results as unknown as SearchResults, list, { doc: fakeDocument(), run: () => {} });
  return walkAll(results.nodes);
}

/** The options of a dialog that has drawn a query, in the model's order. */
function rowsOf(results: { nodes: readonly SearchNode[] }): FakeNode[] {
  return optionsOf(drawn(results));
}

/** Everything a drawn list holds, in document order. */
function drawn(results: { nodes: readonly SearchNode[] }): FakeNode[] {
  return walkAll(results.nodes);
}

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
    attrs: {} as Record<string, string>,
    focus() {
      fake.focused += 1;
    },
    setAttribute(key: string, value: string) {
      fake.attrs[key] = value;
    },
    removeAttribute(key: string) {
      delete fake.attrs[key];
    },
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "input");
      listeners.push(listener);
    },
    type(value: string) {
      fake.value = value;
      for (const listener of listeners) listener();
    },
    /** The option the field names, or undefined when it names nothing. */
    get active(): string | undefined {
      return fake.attrs["aria-activedescendant"];
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

function partsOf(options: { base?: string; focusables?: SearchFocusable[] } = {}) {
  const dialog = fakeDialog({
    ...(options.base === undefined ? {} : { base: options.base }),
    ...(options.focusables === undefined ? {} : { focusables: options.focusables }),
  });
  const button = fakeButton("search");
  const close = fakeButton("close");
  const input = fakeInput();
  const results = fakeResults();
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

function envWith(
  api: PagefindApi,
  options: { lang?: string; messages?: SearchMessages } = {},
): SearchEnv & { readonly calls: string[] } {
  const env = {
    calls: [] as string[],
    document: fakeDocument(),
    lang: options.lang ?? "en",
    messages: options.messages ?? MESSAGES,
    load(url: string) {
      env.calls.push(url);
      return Promise.resolve(api);
    },
  };
  return env as unknown as SearchEnv & { readonly calls: string[] };
}

/** The dialog's messages for a shipped language, built from the real catalogs. */
function messagesFor(lang: "fa" | "ar"): SearchMessages {
  const text = stringsOf(lang);
  return {
    loading: text.search_loading ?? "",
    searching: text.search_results_loading ?? "",
    failed: text.search_results_failed ?? "",
    copied: text.copied ?? "",
    copyFailed: text.search_copy_failed ?? "",
    empty: text.search_results_empty ?? "",
    otherSection: text.search_other_section ?? "",
    actions: text.command_actions ?? "",
    counts: {
      zero: text.search_count_zero ?? "",
      one: text.search_count_one ?? "",
      two: text.search_count_two ?? "",
      few: text.search_count_few ?? "",
      many: text.search_count_many ?? "",
      other: text.search_count_other ?? "",
    },
  };
}

test("activate reveals the search button and the dialog but loads no index until it opens", () => {
  const { dialog, button, input, parts } = partsOf();
  const env = envWith(apiOf([]));

  activate(parts, env);

  assert.equal(button.hidden, false);
  assert.equal(dialog.hidden, false);
  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(input.attrs["aria-expanded"], "false", "the combobox says its list is closed");
  assert.equal(input.active, undefined);
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
  assert.equal(input.attrs["aria-expanded"], "true");
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
  assert.deepEqual(sectionTitles(drawn(results)), ["rules", "guide"]);
  assert.deepEqual(marks(drawn(results)).map((mark) => textOf(mark)), ["cache", "cache"]);
  assert.equal(status.textContent, "2 results.");
  assert.deepEqual(
    rowsOf(results).map((row) => row.attrs.id),
    ["search-option-1", "search-option-2"],
  );
});

test("every draw renumbers the options, so no two rows ever share an id", async () => {
  const { button, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();

  input.type("cache");
  await tick();
  input.type("cache again");
  await tick();

  assert.deepEqual(
    rowsOf(results).map((row) => row.attrs.id),
    ["search-option-1", "search-option-2"],
  );
});

test("activate announces results and groups in the page language", async () => {
  const { button, input, results, status, parts } = partsOf();
  const messages = messagesFor("ar");
  const api: PagefindApi = {
    search(term: string) {
      const found = term === "nothing" ? [] : [{ url: "/a/", excerpt: "", filters: { section: ["  "] } }];
      return Promise.resolve({ results: found.map((record) => ({ data: () => Promise.resolve(record) })) });
    },
  };
  activate(parts, envWith(api, { lang: "ar", messages }));
  button.click();
  await tick();

  input.type("x");
  await tick();

  assert.equal(status.textContent, "1 نتيجة.");
  assert.deepEqual(sectionTitles(drawn(results)), ["أخرى"]);

  input.type("nothing");
  await tick();

  assert.equal(status.textContent, "لا نتائج لـ «nothing».");
  assert.equal(status.textContent, emptyMessage("nothing", messages));
});

test("the options of a right-to-left page are the same rows in the same order", async () => {
  const messages = messagesFor("fa");
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records), { lang: "fa", messages }));
  button.click();
  await tick();

  input.type("cache");
  await tick();

  assert.deepEqual(sectionTitles(drawn(results)), ["rules", "guide"]);
  // Up and down name the order of a right-to-left list; left and right stay the browser's.
  dialog.fire("keydown", key("ArrowDown", input));
  const options = rowsOf(results);
  assert.equal(input.active, options[0]?.attrs.id);

  const left = key("ArrowLeft", input);
  dialog.fire("keydown", left);
  assert.equal(left.prevented, false, "a right-to-left list is still walked up and down");
  assert.equal(input.active, options[0]?.attrs.id, "and the active option did not move");
});

test("an empty field clears the results, the status, and the active option", async () => {
  const { button, dialog, input, results, status, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();
  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(input.active, "search-option-1");

  input.type("   ");
  await tick();

  assert.equal(results.nodes.length, 0);
  assert.equal(status.textContent, "");
  assert.equal(input.active, undefined);
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

test("the arrow keys move the active option and the field names it", async () => {
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  const options = rowsOf(results);
  assert.equal(options.length, 2);
  assert.equal(input.active, undefined, "a new draw starts with nothing selected");

  const down = key("ArrowDown", input);
  dialog.fire("keydown", down);
  assert.equal(down.prevented, true);
  assert.equal(options[0]?.attrs["aria-selected"], "true");
  assert.equal(input.active, options[0]?.attrs.id);

  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(options[1]?.attrs["aria-selected"], "true");
  assert.equal(options[0]?.attrs["aria-selected"], "false", "only one row is ever selected");
  assert.equal(input.active, options[1]?.attrs.id);

  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(input.active, options[0]?.attrs.id, "past the last row the list wraps to the first");

  dialog.fire("keydown", key("ArrowUp", input));
  assert.equal(input.active, options[1]?.attrs.id, "before the first row it wraps to the last");

  assert.equal(input.focused, 5, "focus never left the field: " + input.focused);
});

test("an arrow key while another control has focus moves the active option and returns focus", async () => {
  const close = fakeButton("close");
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  dialog.fire("keydown", key("ArrowDown", close));
  const options = rowsOf(results);

  assert.equal(input.active, options[0]?.attrs.id);
  assert.equal(input.focused, 2, "the field is the only thing that may hold an active option");
  assert.equal(close.focused, 0);
});

test("the active option is brought into view, so a scrolled list still shows it", async () => {
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  dialog.fire("keydown", key("ArrowDown", input));
  dialog.fire("keydown", key("ArrowDown", input));

  const options = rowsOf(results);
  assert.equal(options[1]?.scrolls, 1);
  assert.equal(options[0]?.scrolls, 1);
});

test("a pointer entering a row makes its option the active one", async () => {
  const { button, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  const options = rowsOf(results);
  const rows = wrappersOf(results);
  assert.equal(rows[1]?.attrs.role, "presentation", "the row a pointer enters is not itself a choice");
  rows[1]?.fire("pointerenter");

  assert.equal(options[1]?.attrs["aria-selected"], "true");
  assert.equal(input.active, options[1]?.attrs.id);
  assert.equal(options[0]?.attrs["aria-selected"], "false");
  assert.equal(input.focused, 1, "a pointer does not move keyboard focus");
});

test("Enter presses the active option itself, and the first one when the reader has not moved", async () => {
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  const first = key("Enter", input);
  dialog.fire("keydown", first);
  assert.equal(first.prevented, true);
  assert.equal(rowsOf(results)[0]?.clicks, 1, "a result option is followed, not merely marked");

  dialog.fire("keydown", key("ArrowDown", input));
  dialog.fire("keydown", key("ArrowDown", input));
  const second = key("Enter", input);
  dialog.fire("keydown", second);

  const options = rowsOf(results);
  assert.equal(options[1]?.clicks, 1, "the active option, not always the first");
  assert.equal(options[0]?.clicks, 1, "and only that one");
  assert.equal(options[1]?.scrolls, 2, "the pressed option is kept in view as well");
});

test("Enter on another control is that control's own", async () => {
  const close = fakeButton("close");
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  const event = key("Enter", close);
  dialog.fire("keydown", event);

  assert.equal(event.prevented, false);
  assert.equal(rowsOf(results)[0]?.clicks, 0);
});

test("a row with no safe target presses nothing", () => {
  const runs: unknown[] = [];
  const results = fakeResults();
  const list = optionList([{ url: "javascript:alert(1)", excerpt: "No link", meta: { title: "Bad" } }], [
    { id: "theme-dark", label: "Dark", run: { kind: "theme", choice: "dark" } },
  ]);
  const pressed = renderOptions(results as unknown as SearchResults, list, { doc: fakeDocument(), run: (run) => runs.push(run) });

  assert.equal(pressed.length, 2);
  pressed[0]?.activate();
  assert.deepEqual(runs, [], "the unsafe option has nothing to follow");

  pressed[1]?.activate();
  assert.deepEqual(runs, [{ kind: "theme", choice: "dark" }], "and a safe option still runs its own action");
});

test("a pointer click on an option runs it, and entering its row names it", () => {
  const runs: unknown[] = [];
  let hovered = -1;
  const results = fakeResults();
  const list = optionList([], [{ id: "copy-markdown", label: "Copy", hint: "Markdown", run: { kind: "copy", url: "/x.md" } }]);
  renderOptions(results as unknown as SearchResults, list, {
    doc: fakeDocument(),
    run: (run) => runs.push(run),
    hover: (index) => {
      hovered = index;
    },
  });

  const nodes = walkAll(results.nodes);
  const row = nodes.find((node) => node.tag === "li")!;
  const option = optionsOf(nodes)[0]!;
  row.fire("pointerenter");
  option.click();

  assert.equal(hovered, 0, "the pointer reports the row it entered, wherever in it it was");
  assert.deepEqual(runs, [{ kind: "copy", url: "/x.md" }], "and the option still runs on click");
});

test("keys an option list has nothing to do with are left to the browser", async () => {
  const { button, dialog, input, parts } = partsOf();
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  const down = key("ArrowDown", input);
  dialog.fire("keydown", down);
  assert.equal(down.prevented, false, "an empty list has no active option to move");

  const enter = key("Enter", input);
  dialog.fire("keydown", enter);
  assert.equal(enter.prevented, false, "and Enter opens nothing that is not there");
});

test("a redraw keeps the active option on the same row, and drops it with a row that is gone", async () => {
  const api: PagefindApi = {
    search(term: string) {
      const found = term === "cache" ? records : term === "install" ? [records[1]!] : [];
      return Promise.resolve({ results: found.map((record) => ({ data: () => Promise.resolve(record) })) });
    },
  };
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(api));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  dialog.fire("keydown", key("ArrowDown", input));
  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(input.active, "search-option-2", "the second row of the first query");

  input.type("install");
  await tick();

  assert.equal(input.active, "search-option-1", "the same page is still the active row");
  assert.equal(rowsOf(results)[0]?.attrs["data-search-option"], "result:/guide/install/#0");

  input.type("nothing");
  await tick();

  assert.equal(input.active, undefined, "with no rows the field names no row");
  assert.deepEqual(rowsOf(results), []);
});

test("two results with the same URL and title stay two distinguishable options", async () => {
  const twice: readonly SearchRecord[] = [
    { url: "/same/", excerpt: "First", meta: { title: "Same" } },
    { url: "/same/", excerpt: "Second", meta: { title: "Same" } },
  ];
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(twice)));
  button.click();
  await tick();
  input.type("same");
  await tick();

  const rows = rowsOf(results);
  assert.deepEqual(
    rows.map((row) => row.attrs.id),
    ["search-option-1", "search-option-2"],
  );
  assert.deepEqual(
    rows.map((row) => row.attrs["data-search-option"]),
    ["result:/same/#0", "result:/same/#1"],
    "the same identity, twice, is two rows with two keys",
  );

  dialog.fire("keydown", key("ArrowDown", input));
  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(input.active, "search-option-2");
  assert.equal(rows[1]?.attrs["aria-selected"], "true");
  assert.equal(textOf(rows[1]!), "SameSecond", "and the second row is the one that highlights");
});

test("a late answer cannot redraw the list or move the active option", async () => {
  let release: (data: readonly SearchRecord[]) => void = () => {};
  const hit = (record: SearchRecord) => ({ data: () => Promise.resolve(record) });
  const api: PagefindApi = {
    search(term: string) {
      if (term === "slow") {
        return new Promise<readonly SearchRecord[]>((resolve) => {
          release = resolve;
        }).then((data) => ({ results: data.map(hit) }));
      }
      return Promise.resolve({
        results: [{ url: "/quick/", excerpt: "Quick.", meta: { title: "Quick" } }].map(hit),
      });
    },
  };
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(api));
  button.click();
  await tick();

  input.type("slow");
  await tick();
  input.type("quick");
  await tick();
  dialog.fire("keydown", key("ArrowDown", input));
  assert.equal(input.active, "search-option-1", "the newer query answered first");
  const rows = rowsOf(results);

  release([{ url: "/late/", excerpt: "late", meta: { title: "Late" } }]);
  await tick();

  assert.deepEqual(rowsOf(results), rows, "the late answer never redraws the list");
  assert.equal(input.active, "search-option-1", "and leaves the active option where the reader left it");
});

test("closing clears the active option and restores focus to the search button", async () => {
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();
  dialog.fire("keydown", key("ArrowDown", input));
  const option = rowsOf(results)[0]!;
  assert.equal(option.attrs["aria-selected"], "true");

  dialog.fire("keydown", key("Escape", input));

  assert.equal(dialog.open, false);
  assert.equal(button.attrs["aria-expanded"], "false");
  assert.equal(input.attrs["aria-expanded"], "false");
  assert.equal(input.active, undefined);
  assert.equal(option.attrs["aria-selected"], "false", "no row stays selected behind a closed dialog");
  assert.equal(button.focused, 1);
  assert.equal(input.focused, 2, "the field held focus throughout, so closing had one place to go: " + input.focused);
});

test("reopening starts at the field, not on the row the last query left selected", async () => {
  const { button, dialog, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();
  dialog.fire("keydown", key("ArrowDown", input));
  const options = rowsOf(results);
  assert.equal(options[0]?.attrs["aria-selected"], "true");

  dialog.fire("keydown", key("Escape", input));
  button.click();
  await tick();

  assert.equal(input.active, undefined);
  assert.equal(options[0]?.attrs["aria-selected"], "false");
  assert.equal(input.attrs["aria-expanded"], "true");
});

test("a press on the modal backdrop closes the dialog and returns focus to the search button", async () => {
  const { dialog, button, parts } = partsOf();
  activate(parts, envWith(apiOf([])));
  button.click();
  await tick();

  dialog.fire("click", { target: dialog, preventDefault() {} });

  assert.equal(dialog.open, false);
  assert.equal(button.focused, 1);
});

test("a press on the panel or a row is left to the control under it", async () => {
  const { dialog, button, input, results, parts } = partsOf();
  activate(parts, envWith(apiOf(records)));
  button.click();
  await tick();
  input.type("cache");
  await tick();

  dialog.fire("click", { target: input, preventDefault() {} });
  dialog.fire("click", { target: rowsOf(results)[0], preventDefault() {} });

  assert.equal(dialog.open, true);
  assert.equal(button.focused, 0);
});

test("Tab past the last control wraps to the first; Shift+Tab before the first wraps to the last", () => {
  const close = fakeButton("close");
  const first = fakeButton("first");
  const last = fakeButton("last");
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
  const close = fakeButton("close");
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
  const first = fakeButton("first");
  const dialog = fakeDialog({ focusables: [first] });
  const event = key("a", first);

  trap(dialog as unknown as SearchDialog, event);

  assert.equal(event.prevented, false);
});

test("the trap's selector skips the rows, which a combobox never tabs through", () => {
  const seen: string[] = [];
  const dialog = {
    querySelectorAll(selector: string): Iterable<SearchFocusable> {
      seen.push(selector);
      return [];
    },
  };

  trap(dialog as unknown as SearchDialog, key("Tab", {}));

  assert.equal(seen.length, 1);
  assert.match(seen[0]!, /a\[href\]:not\(\[tabindex='-1'\]\)/);
  assert.match(seen[0]!, /button:not\(\[disabled\]\):not\(\[tabindex='-1'\]\)/);
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

test("style.css shows the active option as the element the combobox names", () => {
  const css = readFileSync(new URL("../chrome/search/style.css", import.meta.url), "utf8");

  assert.match(css, /\.search-result-link\[aria-selected="true"\],/);
  assert.match(css, /\.search-action-button\[aria-selected="true"\] \{/);
  assert.match(css, /outline: 2px solid var\(--state-focus-ring\);/);
  assert.match(css, /border-inline-start-color: var\(--color-accent\);/);
  assert.doesNotMatch(css, /\.search-result\[aria-selected/, "the row carries no selection state of its own");
});

/** The WCAG 2 contrast ratio of two `#rrggbb` colours, as axe measures small text. */
function contrastRatio(foreground: string, background: string): number {
  const channel = (byte: number): number => {
    const scaled = byte / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string): number => {
    const [red, green, blue] = [1, 3, 5].map((at) => channel(parseInt(hex.slice(at, at + 2), 16)));
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [first, second] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (first! + 0.05) / (second! + 0.05);
}

test("the dark dialog's secondary text clears 4.5:1 on the raised surface it sits on", () => {
  const css = readFileSync(new URL("../chrome/search/style.css", import.meta.url), "utf8");
  const dark = JSON.parse(readFileSync(new URL("../tokens/color.json", import.meta.url), "utf8")) as Record<
    string,
    { $extensions?: { lateen?: { dark?: string } } }
  >;
  const surface = dark["surface-raised"]?.$extensions?.lateen?.dark;
  const muted = dark.muted?.$extensions?.lateen?.dark;
  const text = dark.text?.$extensions?.lateen?.dark;
  assert.ok(surface !== undefined && muted !== undefined && text !== undefined, "the dark tokens are present");

  // The reason the override exists: muted on the dialog's own surface is not enough for small text.
  assert.ok(contrastRatio(muted!, surface!) < 4.5, `muted on raised measures ${contrastRatio(muted!, surface!).toFixed(2)}`);
  assert.ok(contrastRatio(text!, surface!) >= 4.5, `text on raised measures ${contrastRatio(text!, surface!).toFixed(2)}`);

  // Every rule that paints muted small text on that surface gives way in dark, or the gate only
  // catches the two rows an empty query happens to draw.
  const override = css.slice(css.indexOf(':root[data-theme="dark"] .search-status'));
  for (const selector of [".search-status", ".search-group-title", ".search-result-excerpt", ".search-action-hint"]) {
    const rule = css.slice(css.indexOf(`\n${selector} {`), css.indexOf("}", css.indexOf(`\n${selector} {`)));
    if (rule.includes("var(--color-muted)")) {
      assert.ok(override.includes(selector), `${selector} paints muted text and dark has no override`);
    }
  }
  assert.match(override, /color: var\(--color-text\);/);
});
