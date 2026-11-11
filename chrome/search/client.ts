/*
 * Search dialog and command palette: loads the Pagefind index on first open, runs the query, groups
 * page results by section, groups the page's actions under "Actions", and keeps keyboard focus inside
 * the dialog. No index is fetched until the reader opens search, so a page that never searches
 * downloads no search JavaScript data.
 *
 * The action list arrives as inert JSON from `chrome/command-palette/`; this module parses it,
 * filters it on the same query as the page results, and runs the chosen action. The module and its
 * client-only helper (`shortcut.ts`) import no server module, so they are safe to serve as an island.
 */

import type { PaletteAction, PalettePayload, PaletteRun, ThemeChoice } from "../command-palette/actions.ts";
import { activateShortcuts, type ShortcutEvent } from "./shortcut.ts";

/** localStorage key for the visitor's theme choice; keep in step with `layouts/base.ts`. */
export const THEME_KEY = "lateen-theme";

/** The group heading when the server sends no label. */
export const ACTIONS_LABEL = "Actions";

/** The filter the engine writes on every indexed page; its first value is the page's section. */
export const SECTION_FILTER = "section";

/** Where a result without a section lands, matching the engine's name for pages outside a group. */
export const OTHER_SECTION = "Other";

/** Most results shown for one query; Pagefind ranks them, and the top of the list is what a reader wants. */
export const RESULT_LIMIT = 20;

/** The CLDR plural categories a count message can have, matching `i18n/*.json`. */
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/**
 * Every message the dialog shows, in the page language. `chrome/search/index.ts` writes them into
 * `data-search-*` attributes; these English values are the fallback when a page carries none. The
 * empty message takes `{query}` and each count takes `{n}`.
 */
export interface SearchMessages {
  readonly loading: string;
  readonly searching: string;
  readonly failed: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly empty: string;
  readonly counts: Readonly<Record<PluralCategory, string>>;
  readonly otherSection: string;
  readonly actions: string;
}

export const MESSAGES: SearchMessages = {
  loading: "Loading search…",
  searching: "Searching…",
  failed: "Search is unavailable right now.",
  copied: "Copied",
  copyFailed: "Copy failed.",
  empty: "No results for “{query}”.",
  counts: {
    zero: "{n} results.",
    one: "{n} result.",
    two: "{n} results.",
    few: "{n} results.",
    many: "{n} results.",
    other: "{n} results.",
  },
  otherSection: "Other",
  actions: "Actions",
};

/** One result Pagefind returns, as `data()` gives it. */
export interface SearchRecord {
  readonly url: string;
  readonly excerpt: string;
  readonly meta?: { readonly title?: string | undefined };
  readonly filters?: Readonly<Record<string, readonly string[]>>;
}

/** One hit in a Pagefind result list. */
export interface SearchHit {
  data(): Promise<SearchRecord>;
}

/** The part of Pagefind's browser API the dialog uses. */
export interface PagefindApi {
  search(term: string): Promise<{ readonly results: readonly SearchHit[] }>;
}

/** Results that share one section, in the order Pagefind ranked them. */
export interface ResultGroup {
  readonly section: string;
  readonly results: readonly SearchRecord[];
}

/** The header's search button: `client.ts` reveals it and returns focus to it when the dialog closes. */
export interface SearchButton {
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
  click(): void;
  focus(): void;
}

/** The dialog's close button; it has the same shape as the search button. */
export type SearchClose = SearchButton;

/** The query field. */
export interface SearchInput {
  value: string;
  focus(): void;
  addEventListener(type: "input", listener: () => void): void;
}

/** A result link the dialog can move focus to. */
export interface SearchLink {
  focus(): void;
  click(): void;
  getAttribute?(name: string): string | null;
}

/** The element that currently has focus, for keeping it across an async redraw. */
export interface SearchActiveElement extends SearchFocusable {
  getAttribute?(name: string): string | null;
}

/** Anything in the dialog that can take keyboard focus, for the focus trap. */
export interface SearchFocusable {
  focus(): void;
}

/** A node in the result list; the browser supplies real nodes, tests a small tree. */
export interface SearchNode {}

/** An element the result renderer builds. */
export interface SearchElement extends SearchNode {
  setAttribute(name: string, value: string): void;
  append(...nodes: SearchNode[]): void;
  /** Only action buttons need a listener; the result renderer never adds one. */
  addEventListener?(type: "click", listener: () => void): void;
}

/** The part of `document` the result renderer uses. */
export interface SearchDocument {
  createElement(tag: string): SearchElement;
  createTextNode(text: string): SearchNode;
  /** The focused element, when the browser reports one; a redraw keeps keyboard focus on it. */
  readonly activeElement?: SearchActiveElement | null;
}

/** The container `client.ts` fills with result nodes. */
export interface SearchResults {
  replaceChildren(...nodes: SearchNode[]): void;
  querySelectorAll(selector: string): Iterable<SearchLink>;
  /** Whether `node` is inside the list, so a redraw knows the reader was navigating it. */
  contains?(node: SearchNode): boolean;
}

/** The status region results and failures are announced on. */
export interface SearchStatus {
  textContent: string | null;
}

/** The inert JSON `chrome/command-palette/` writes into the dialog. */
export interface SearchPaletteSource {
  textContent: string | null;
}

/** What running one action does; the browser supplies working versions, tests inject spies. */
export interface PaletteHandlers {
  theme?(choice: ThemeChoice): void;
  copy?(url: string): void | Promise<void>;
  section?(id: string): void;
}

/** A keyboard or dialog event as the dialog reads it. */
export interface SearchEvent {
  readonly key?: string | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly target?: unknown;
  preventDefault(): void;
}

/** The `<dialog>` element as the script touches it. */
export interface SearchDialog {
  readonly open: boolean;
  hidden: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  showModal(): void;
  close(): void;
  querySelectorAll(selector: string): Iterable<SearchFocusable>;
  addEventListener(type: string, listener: (event: SearchEvent) => void): void;
}

/** The elements the island wires together. */
export interface SearchParts {
  dialog: SearchDialog;
  button: SearchButton;
  close: SearchClose;
  input: SearchInput;
  results: SearchResults;
  status: SearchStatus;
  /** The command palette's JSON script, when the page carries one. */
  palette?: SearchPaletteSource | undefined;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface SearchEnv {
  document: SearchDocument;
  load(url: string): Promise<PagefindApi>;
  /** The action payload; the island parses it from `parts.palette`, tests pass it directly. */
  palette?: PalettePayload | undefined;
  /** How actions run; the island uses `liveHandlers()`, tests inject spies. */
  handlers?: PaletteHandlers | undefined;
  /** The page language, which chooses the count's plural category. */
  lang?: string | undefined;
  /** The page language's messages; the island reads them from the dialog's attributes. */
  messages?: SearchMessages | undefined;
}

/** What can take keyboard focus inside the dialog. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** The five entities Pagefind writes when it escapes page text, plus the apostrophe forms. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#x27": "'",
};

/** Reads one excerpt fragment back to the text a reader should see. */
function textOf(fragment: string): string {
  return fragment.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity);
}

/** One run of an excerpt and whether Pagefind marked it as a match. */
interface Segment {
  readonly text: string;
  readonly marked: boolean;
}

/** Pagefind's own emphasis tags; page content is escaped, so these are the only tags an excerpt carries. */
const MARK_TAG = /<mark\b[^>]*>|<\/mark\s*>/gi;

/** Splits an excerpt at its `<mark>` boundaries, leaving every other character as text. */
function segmentsOf(excerpt: string): readonly Segment[] {
  const segments: Segment[] = [];
  let marked = false;
  let last = 0;
  for (const match of excerpt.matchAll(MARK_TAG)) {
    if (match.index > last) segments.push({ text: excerpt.slice(last, match.index), marked });
    marked = !match[0].startsWith("</");
    last = match.index + match[0].length;
  }
  if (last < excerpt.length) segments.push({ text: excerpt.slice(last), marked });
  return segments;
}

/** The section a result belongs to, from the engine's `section` filter; a missing filter reads as `Other`. */
export function sectionOf(record: SearchRecord): string {
  const value = record.filters?.[SECTION_FILTER]?.[0]?.trim();
  return value === undefined || value === "" ? OTHER_SECTION : value;
}

/** Groups ranked results by section, keeping the order each section first appears in. */
export function groupBySection(records: readonly SearchRecord[]): readonly ResultGroup[] {
  const groups = new Map<string, SearchRecord[]>();
  for (const record of records) {
    const section = sectionOf(record);
    const group = groups.get(section);
    if (group === undefined) groups.set(section, [record]);
    else group.push(record);
  }
  return [...groups].map(([section, results]) => ({ section, results }));
}

/** Only links the browser can follow: a `javascript:` or `data:` URL from the index is never a link. */
function safeHref(url: string): string | undefined {
  return url.startsWith("/") || url.startsWith("./") || url.startsWith("../") || /^https?:\/\//i.test(url)
    ? url
    : undefined;
}

/** The excerpt as text nodes, with Pagefind's matches wrapped in plain `<mark>` elements. */
function excerptNode(excerpt: string, doc: SearchDocument): SearchElement {
  const span = doc.createElement("span");
  span.setAttribute("class", "search-result-excerpt");
  for (const segment of segmentsOf(excerpt)) {
    if (!segment.marked) {
      span.append(doc.createTextNode(textOf(segment.text)));
      continue;
    }
    const mark = doc.createElement("mark");
    mark.append(doc.createTextNode(textOf(segment.text)));
    span.append(mark);
  }
  return span;
}

/** One result: a title and excerpt inside a link when the URL is safe, otherwise plain text. */
function resultNode(record: SearchRecord, doc: SearchDocument): SearchNode {
  const href = safeHref(record.url);
  const link = doc.createElement(href === undefined ? "span" : "a");
  link.setAttribute("class", "search-result-link");
  if (href !== undefined) link.setAttribute("href", href);

  const title = record.meta?.title?.trim();
  const titleNode = doc.createElement("span");
  titleNode.setAttribute("class", "search-result-title");
  titleNode.append(doc.createTextNode(title === undefined || title === "" ? record.url : title));

  link.append(titleNode, excerptNode(record.excerpt, doc));

  const item = doc.createElement("li");
  item.setAttribute("class", "search-result");
  item.append(link);
  return item;
}

/** The result list: one section per group, in rank order, built only from elements and text nodes. */
export function resultNodes(
  records: readonly SearchRecord[],
  doc: SearchDocument,
  otherSection: string = OTHER_SECTION,
): readonly SearchNode[] {
  return groupBySection(records).map((group) => {
    const heading = doc.createElement("h2");
    heading.setAttribute("class", "search-group-title");
    heading.append(doc.createTextNode(group.section === OTHER_SECTION ? otherSection : group.section));

    const list = doc.createElement("ul");
    list.setAttribute("class", "search-list");
    for (const record of group.results) list.append(resultNode(record, doc));

    const section = doc.createElement("section");
    section.setAttribute("class", "search-group");
    section.append(heading, list);
    return section;
  });
}

/** Replaces the list's children with nodes for `records`; text never passes through an HTML string. */
export function renderResults(results: SearchResults, records: readonly SearchRecord[], doc: SearchDocument): void {
  results.replaceChildren(...resultNodes(records, doc));
}

/** What the palette renders: the matched actions, the Pagefind records, and how to run an action. */
export interface PaletteRender {
  readonly actions: readonly PaletteAction[];
  readonly label: string;
  readonly records: readonly SearchRecord[];
  readonly doc: SearchDocument;
  /** The page language's name for a result without a section. */
  readonly otherSection?: string | undefined;
  readonly run: (run: PaletteRun) => void;
}

/** One action: a button and its optional hint, both built from text nodes. */
function actionNode(action: PaletteAction, doc: SearchDocument, run: (run: PaletteRun) => void): SearchNode {
  const button = doc.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("class", "search-action-button");
  button.setAttribute("role", "option");
  button.setAttribute("data-palette-action", action.id);
  if (action.run !== undefined) {
    const command = action.run;
    button.addEventListener?.("click", () => run(command));
  }

  const label = doc.createElement("span");
  label.setAttribute("class", "search-action-label");
  label.append(doc.createTextNode(action.label));
  button.append(label);

  if (action.hint !== undefined && action.hint !== "") {
    const hint = doc.createElement("span");
    hint.setAttribute("class", "search-action-hint");
    hint.append(doc.createTextNode(action.hint));
    button.append(hint);
  }

  const item = doc.createElement("li");
  item.setAttribute("class", "search-result search-action");
  item.append(button);
  return item;
}

/** The "Actions" group: one heading and one list of action buttons. */
export function actionNodes(
  actions: readonly PaletteAction[],
  label: string,
  doc: SearchDocument,
  run: (run: PaletteRun) => void,
): readonly SearchNode[] {
  if (actions.length === 0) return [];
  const heading = doc.createElement("h2");
  heading.setAttribute("class", "search-group-title");
  heading.append(doc.createTextNode(label));

  const list = doc.createElement("ul");
  list.setAttribute("class", "search-list");
  list.setAttribute("role", "presentation");
  for (const action of actions) list.append(actionNode(action, doc, run));

  const section = doc.createElement("section");
  section.setAttribute("class", "search-group search-actions-group");
  section.append(heading, list);
  return [section];
}

/**
 * Replaces the dialog's list with the page results first, then the matched actions. The empty query
 * has no page results, so the actions stand alone; once a query finds pages they come first, because
 * search is still the dialog's main job. An empty set clears the list.
 */
export function renderPalette(results: SearchResults, render: PaletteRender): void {
  const nodes = [
    ...resultNodes(render.records, render.doc, render.otherSection),
    ...actionNodes(render.actions, render.label, render.doc, render.run),
  ];
  results.replaceChildren(...nodes);
}

/** A whole-word test for a hint, so a single typed letter does not match every hint. */
function containsWord(text: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

/** Whether an action matches `query`; the pure counterpart of `chrome/command-palette/actions.ts`. */
export function matchesAction(action: PaletteAction, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  if (action.label.toLowerCase().includes(needle)) return true;
  return action.hint !== undefined && containsWord(action.hint, needle);
}

/** The actions that match `query`, in their original order. */
export function filterActions(actions: readonly PaletteAction[], query: string): readonly PaletteAction[] {
  return actions.filter((action) => matchesAction(action, query));
}

/** Whether `value` is one of the theme choices the palette can apply. */
function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** Whether `value` is an action descriptor this module knows how to run. */
export function isPaletteRun(value: unknown): value is PaletteRun {
  if (value === null || typeof value !== "object") return false;
  const run = value as { kind?: unknown; choice?: unknown; url?: unknown; id?: unknown };
  if (run.kind === "theme") return isThemeChoice(run.choice);
  if (run.kind === "copy") return typeof run.url === "string" && run.url !== "";
  if (run.kind === "section") return typeof run.id === "string" && run.id !== "";
  return false;
}

/** Whether `value` is an action this module can show and run. */
function isPaletteAction(value: unknown): value is PaletteAction {
  if (value === null || typeof value !== "object") return false;
  const action = value as { id?: unknown; label?: unknown; hint?: unknown; run?: unknown };
  if (typeof action.id !== "string" || action.id === "") return false;
  if (typeof action.label !== "string" || action.label === "") return false;
  if (action.hint !== undefined && typeof action.hint !== "string") return false;
  return action.run === undefined || isPaletteRun(action.run);
}

/**
 * Reads the server's JSON. Anything missing, malformed, or shaped differently yields an empty
 * palette, so a bad build cannot stop search from working.
 */
export function parsePalette(text: string | null, fallbackLabel: string = ACTIONS_LABEL): PalettePayload {
  if (text === null || text.trim() === "") return { label: fallbackLabel, actions: [] };
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object") return { label: fallbackLabel, actions: [] };
    const payload = value as { label?: unknown; actions?: unknown };
    const label = typeof payload.label === "string" && payload.label !== "" ? payload.label : fallbackLabel;
    const actions = Array.isArray(payload.actions) ? payload.actions.filter(isPaletteAction) : [];
    return { label, actions };
  } catch {
    return { label: fallbackLabel, actions: [] };
  }
}

/** The index URL for a site `base`: `/pagefind/pagefind.js` at the root, `<base>/pagefind/pagefind.js` below it. */
export function indexUrl(base: string): string {
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${root}/pagefind/pagefind.js`;
}

/** Fills one message's placeholders from already-escaped text values. */
function fill(pattern: string, values: Readonly<Record<string, string | number>>): string {
  return pattern.replace(/\{(\w+)\}/g, (_placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : "",
  );
}

/**
 * The plural category of `count` in `lang`, chosen by the browser's CLDR rules. A language tag the
 * runtime does not know reads as English, and an unknown category falls back to `other`.
 *
 * shortcut: this repeats `components/reading-time`'s rules because that module imports the
 * server-only catalog; move both into a client-safe module when a third caller needs them.
 */
export function pluralCategory(lang: string, count: number): PluralCategory {
  let category: string;
  try {
    category = new Intl.PluralRules(lang).select(Math.abs(Math.trunc(count)));
  } catch {
    return "other";
  }
  return (PLURAL_CATEGORIES as readonly string[]).includes(category) ? (category as PluralCategory) : "other";
}

/** The text announced when a query finds nothing. */
export function emptyMessage(query: string, messages: SearchMessages = MESSAGES): string {
  return fill(messages.empty, { query });
}

/** The text announced for a result count, in the page language's plural form. */
export function countMessage(count: number, lang = "en", messages: SearchMessages = MESSAGES): string {
  const pattern = messages.counts[pluralCategory(lang, count)] ?? messages.counts.other;
  return fill(pattern, { n: count });
}

/**
 * Keeps Tab and Shift+Tab inside the dialog: past the last control focus wraps to the first, and before
 * the first it wraps to the last. A focus that has left the dialog returns to its first control.
 */
export function trap(dialog: SearchDialog, event: SearchEvent): void {
  if (event.key !== "Tab") return;
  const items = [...dialog.querySelectorAll(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const inside = items.includes(event.target as SearchFocusable);
  if (event.shiftKey === true && (!inside || event.target === first)) {
    event.preventDefault();
    last.focus();
  } else if (event.shiftKey !== true && (!inside || event.target === last)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Reveals the search button and wires the dialog: the button opens it, the index loads on that first
 * open only, typing filters both groups, arrows move through actions and results as one list, Enter
 * runs or opens the first item, Escape closes, and Tab stays inside. The DOM is touched only through
 * the small interfaces above, so tests need no browser.
 */
export function activate(parts: SearchParts, env: SearchEnv): void {
  const { dialog, button, close, input, results, status } = parts;
  const messages = env.messages ?? MESSAGES;
  const lang = env.lang ?? "en";
  const palette = env.palette ?? parsePalette(parts.palette?.textContent ?? null, messages.actions);
  const actions = palette.actions;
  const handlers = env.handlers ?? liveHandlers();
  let api: PagefindApi | undefined;
  let loading = false;
  let sequence = 0;
  // A section jump is a move inside the page: the close must not pull focus back to the search button.
  let returnFocus = true;

  dialog.hidden = false;
  button.hidden = false;
  button.setAttribute("aria-expanded", "false");

  /** Runs one action in the browser; a copy result is announced on the status region. */
  const execute = (command: PaletteRun): void => {
    if (command.kind === "theme") {
      handlers.theme?.(command.choice);
      return;
    }
    if (command.kind === "copy") {
      const copied = handlers.copy?.(command.url);
      if (copied !== undefined && typeof copied.then === "function") {
        copied.then(
          () => {
            status.textContent = messages.copied;
          },
          () => {
            status.textContent = messages.copyFailed;
          },
        );
      }
      return;
    }
    // The heading is where the reader is going, so it keeps focus: the close handler must not take it
    // back to the search button, whether the browser fires `close` during `close()` or after it.
    returnFocus = false;
    dialog.close();
    handlers.section?.(command.id);
  };

  /** The key that identifies a focused row, so a redraw can put focus back on the same row. */
  const focusKey = (element: SearchActiveElement): string | undefined => {
    const action = element.getAttribute?.("data-palette-action");
    if (action !== undefined && action !== null && action !== "") return `action:${action}`;
    const href = element.getAttribute?.("href");
    return href === undefined || href === null || href === "" ? undefined : `href:${href}`;
  };

  /** Keeps keyboard focus inside the list when a new result set replaces the focused row; false when the list is empty. */
  const restoreFocus = (key: string | undefined): boolean => {
    if (key === undefined) return false;
    const items = [...results.querySelectorAll("a[href], [data-palette-action]")];
    const match = items.find((item) => {
      const action = item.getAttribute?.("data-palette-action");
      if (action !== undefined && action !== null && action !== "") return `action:${action}` === key;
      const href = item.getAttribute?.("href");
      return href !== undefined && href !== null && href !== "" && `href:${href}` === key;
    });
    const target = match ?? items[0];
    if (target === undefined) return false;
    target.focus();
    return true;
  };

  /** Draws both groups for `query`: matched actions always, page results when they are known. */
  const draw = (query: string, records: readonly SearchRecord[], matched: readonly PaletteAction[]): void => {
    const active = env.document.activeElement ?? null;
    const key = active === null ? undefined : focusKey(active);
    const inside = key !== undefined && results.contains?.(active as unknown as SearchNode) === true;
    if (actions.length === 0 && matched.length === 0 && records.length === 0) {
      results.replaceChildren();
    } else {
      renderPalette(results, {
        actions: matched,
        label: palette.label,
        records,
        doc: env.document,
        otherSection: messages.otherSection,
        run: execute,
      });
    }
    // Removing the row that had focus would drop focus on the page; the field is the next step.
    if (inside && !restoreFocus(key)) input.focus();
  };

  /** Runs the field's current query: an empty field shows the actions and clears the status. */
  const run = (): void => {
    const query = input.value.trim();
    const matched = filterActions(actions, query);
    const current = ++sequence;
    if (query === "") {
      draw(query, [], matched);
      status.textContent = "";
      return;
    }
    if (api === undefined) {
      draw(query, [], matched);
      return;
    }
    status.textContent = matched.length === 0 ? messages.searching : "";
    api
      .search(query)
      .then((page) => Promise.all(page.results.slice(0, RESULT_LIMIT).map((hit) => hit.data())))
      .then(
        (records) => {
          if (current !== sequence) return;
          draw(query, records, matched);
          status.textContent =
            records.length === 0
              ? matched.length === 0
                ? emptyMessage(query, messages)
                : ""
              : countMessage(records.length, lang, messages);
        },
        () => {
          if (current === sequence) status.textContent = messages.failed;
        },
      );
  };

  /** Opens the dialog and, on the first open, loads the index; later opens reuse it. */
  const show = (): void => {
    returnFocus = true;
    if (!dialog.open) dialog.showModal();
    button.setAttribute("aria-expanded", "true");
    input.focus();
    if (input.value.trim() === "") run();
    if (api !== undefined || loading) {
      if (input.value.trim() !== "") run();
      return;
    }
    loading = true;
    if (input.value.trim() !== "") status.textContent = messages.loading;
    env.load(indexUrl(dialog.getAttribute("data-base") ?? "")).then(
      (loaded) => {
        api = loaded;
        loading = false;
        if (input.value.trim() === "") status.textContent = "";
        run();
      },
      () => {
        loading = false;
        status.textContent = messages.failed;
      },
    );
  };

  button.addEventListener("click", show);
  close.addEventListener("click", () => dialog.close());
  input.addEventListener("input", run);
  // A press on the modal backdrop lands on the dialog itself; a press on the panel or a row does not.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
    returnFocus = true;
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }

    const links = [...results.querySelectorAll("a[href], [data-palette-action]")];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (links.length === 0) return;
      event.preventDefault();
      const index = links.indexOf(event.target as SearchLink);
      const next =
        event.key === "ArrowDown"
          ? index + 1 >= links.length
            ? 0
            : index + 1
          : index <= 0
            ? links.length - 1
            : index - 1;
      links[next]?.focus();
      return;
    }

    if (event.key === "Enter" && event.target === (input as unknown)) {
      const first = links[0];
      if (first !== undefined) {
        event.preventDefault();
        first.click();
      }
      return;
    }

    trap(dialog, event);
  });
}

/** What the page's `<html>` needs for a theme change. */
interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

/** The heading a section action scrolls to and focuses. */
interface SectionTarget {
  setAttribute?(name: string, value: string): void;
  scrollIntoView?(options: { readonly block: "start" }): void;
  focus?(): void;
}

/** The browser globals the action handlers use; tests never call these. */
interface PaletteGlobals {
  readonly document?: {
    readonly documentElement?: ThemeRoot;
    getElementById?(id: string): SectionTarget | null;
  };
  readonly localStorage?: { setItem(key: string, value: string): void };
  readonly navigator?: { readonly clipboard?: { writeText(text: string): Promise<void> } };
  readonly fetch?: (url: string) => Promise<{ readonly ok: boolean; text(): Promise<string> }>;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

/** The theme a choice puts on the page; `system` follows the OS preference. */
export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): "light" | "dark" {
  return choice === "system" ? (prefersLight ? "light" : "dark") : choice;
}

/** The browser's handlers: the theme key, the clipboard and twin fetch, and the heading jump. */
export function liveHandlers(globals: PaletteGlobals = globalThis as unknown as PaletteGlobals): PaletteHandlers {
  return {
    theme(choice) {
      try {
        globals.localStorage?.setItem(THEME_KEY, choice);
      } catch {
        /* storage is unavailable: apply the choice to this page view only */
      }
      const prefersLight = globals.matchMedia?.("(prefers-color-scheme: light)").matches === true;
      globals.document?.documentElement?.setAttribute("data-theme", resolveTheme(choice, prefersLight));
    },
    copy(url) {
      const clipboard = globals.navigator?.clipboard;
      const fetchText = globals.fetch;
      if (clipboard === undefined || fetchText === undefined) return Promise.resolve();
      return fetchText(url).then((response) =>
        response.ok ? response.text() : Promise.reject(new Error("The page's Markdown is unavailable.")),
      ).then((markdown) => clipboard.writeText(markdown));
    },
    section(id) {
      const heading = globals.document?.getElementById?.(id);
      if (heading === null || heading === undefined) return;
      heading.setAttribute?.("tabindex", "-1");
      heading.scrollIntoView?.({ block: "start" });
      heading.focus?.();
    },
  };
}

// The island runs in a browser; the theme's tsconfig has no DOM lib, so these are the globals it needs.
declare const document: {
  querySelector(selector: string): unknown;
  createElement(tag: string): SearchElement;
  createTextNode(text: string): SearchNode;
  addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
};
declare const navigator: { readonly platform: string };

/** The dialog as the island reads its translated messages from. */
export interface MessageSource {
  getAttribute(name: string): string | null;
}

/** One data attribute's non-empty value, or undefined when the page does not carry it. */
function attributeOf(element: MessageSource, name: string): string | undefined {
  const value = element.getAttribute(name);
  return value === null || value === "" ? undefined : value;
}

/** The dialog's messages in the page language, with the English defaults for anything missing. */
export function messagesFrom(element: MessageSource): SearchMessages {
  return {
    loading: attributeOf(element, "data-search-loading") ?? MESSAGES.loading,
    searching: attributeOf(element, "data-search-searching") ?? MESSAGES.searching,
    failed: attributeOf(element, "data-search-failed") ?? MESSAGES.failed,
    copied: attributeOf(element, "data-search-copied") ?? MESSAGES.copied,
    copyFailed: attributeOf(element, "data-search-copy-failed") ?? MESSAGES.copyFailed,
    empty: attributeOf(element, "data-search-empty") ?? MESSAGES.empty,
    otherSection: attributeOf(element, "data-search-other-section") ?? MESSAGES.otherSection,
    actions: attributeOf(element, "data-search-actions") ?? MESSAGES.actions,
    counts: {
      zero: attributeOf(element, "data-search-count-zero") ?? MESSAGES.counts.zero,
      one: attributeOf(element, "data-search-count-one") ?? MESSAGES.counts.one,
      two: attributeOf(element, "data-search-count-two") ?? MESSAGES.counts.two,
      few: attributeOf(element, "data-search-count-few") ?? MESSAGES.counts.few,
      many: attributeOf(element, "data-search-count-many") ?? MESSAGES.counts.many,
      other: attributeOf(element, "data-search-count-other") ?? MESSAGES.counts.other,
    },
  };
}

/** The page language the dialog carries, which picks the plural rules. */
export function langFrom(element: MessageSource): string {
  return attributeOf(element, "data-search-lang") ?? "en";
}

/** Imports the Pagefind module from the built index. */
function loadIndex(url: string): Promise<PagefindApi> {
  return import(url) as Promise<PagefindApi>;
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const dialog = document.querySelector("[data-search]");
  const button = document.querySelector("[data-search-open]");
  const close = document.querySelector("[data-search-close]");
  const input = document.querySelector("[data-search-input]");
  const results = document.querySelector("[data-search-results]");
  const status = document.querySelector("[data-search-status]");
  const palette = document.querySelector("[data-palette-actions]") as SearchPaletteSource | null;
  if (dialog && button && close && input && results && status) {
    const source = dialog as unknown as MessageSource;
    const messages = messagesFrom(source);
    activate(
      {
        dialog: dialog as SearchDialog,
        button: button as SearchButton,
        close: close as SearchClose,
        input: input as SearchInput,
        results: results as SearchResults,
        status: status as SearchStatus,
        ...(palette === null ? {} : { palette }),
      },
      {
        document,
        load: loadIndex,
        palette: parsePalette(palette?.textContent ?? null, messages.actions),
        lang: langFrom(source),
        messages,
      },
    );
    // ⌘K/Ctrl+K and `/` press this button from anywhere, exactly as a pointer would.
    activateShortcuts(
      { button: button as unknown as SearchButton },
      { platform: navigator.platform, addEventListener: (type, listener) => document.addEventListener(type, listener) },
    );
  }
}
