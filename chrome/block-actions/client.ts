/*
 * Block actions: stamps one "Edit with your agent" button into every top-level block on the page.
 * Each button copies a prompt naming the block's source file, its exact span, and its current text,
 * which arrives whole up to MAX_TEXT code points and is explicitly marked when a block is longer.
 * The template's buttons start `hidden`, so nothing is revealed unless the browser has a clipboard
 * to write to; a page without JavaScript keeps no controls at all.
 *
 * The island is type-stripped and shipped on its own, so it imports nothing and echoes the small
 * span grammar the engine writes into `data-src`.
 */

/** One source span: `path:line:column-endLine:endColumn`; the end is inclusive. */
export interface Span {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

const FULL_SPAN = /^(.*):(\d+):(\d+)-(\d+):(\d+)$/;
const POINT_WITH_COLUMN = /^(.*):(\d+):(\d+)$/;
const POINT = /^(.*):(\d+)$/;

/**
 * A stable DOM id for a code block from its source span: `code-docs-a-md-3-1-9-12`. It is the same
 * rule as `blockId` in `components/code/index.ts`, so a block keeps one id whether the server stamped
 * it or this island did.
 */
export function blockId(src: string): string {
  const slug = src
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `code-${slug || "block"}`;
}

/**
 * Longest block text the prompt carries, in code points. Ordinary prose and code blocks fit complete;
 * a block beyond this bound is cut at a code-point boundary and the prompt says how much it left out.
 */
export const MAX_TEXT = 8000;

/** How long the button shows the result before it goes back to its label. */
export const RESET_MS = 2000;

/** Every part of a span is at least 1: lines and columns are 1-based. */
function positive(...values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value) && value >= 1);
}

/** A parsed span, or `undefined` when a part is missing or its end runs before its start. */
function spanOfParts(
  file: string | undefined,
  line: number,
  column: number,
  endLine: number,
  endColumn: number,
): Span | undefined {
  if (!file || !positive(line, column, endLine, endColumn)) return undefined;
  if (endLine < line || (endLine === line && endColumn < column)) return undefined;
  return { file, line, column, endLine, endColumn };
}

/**
 * Parses a `data-src` value: the full span, or one of the two point forms (`path:line` and
 * `path:line:column`), whose end equals the start. Numbers are taken from the right, so a path may
 * contain a colon.
 */
export function parseSpan(value: string): Span | undefined {
  const full = FULL_SPAN.exec(value);
  if (full) {
    return spanOfParts(full[1], Number(full[2]), Number(full[3]), Number(full[4]), Number(full[5]));
  }

  const withColumn = POINT_WITH_COLUMN.exec(value);
  if (withColumn) {
    const line = Number(withColumn[2]);
    const column = Number(withColumn[3]);
    return spanOfParts(withColumn[1], line, column, line, column);
  }

  const point = POINT.exec(value);
  if (point) {
    const line = Number(point[2]);
    return spanOfParts(point[1], line, 1, line, 1);
  }

  return undefined;
}

/**
 * The block text as the prompt carries it. Line structure is kept, so a multiline block arrives
 * whole. Characters that could forge a prompt field are dropped: C0/C1 controls (except tab and
 * newline), bidi overrides, line/paragraph separators, and the byte-order mark.
 */
export function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .trim();
}

/** What the prompt carries for one block: its text, its full code-point length, and any omission. */
export interface PromptText {
  /** The complete text, or a bounded prefix followed by an explicit omission note. */
  readonly text: string;
  /** Code points in the cleaned block text. */
  readonly total: number;
  /** Code points left out of the prompt; 0 when the block arrived whole. */
  readonly omitted: number;
}

/** The prompt's text field, bounded by `max` code points with the omission stated in the text itself. */
export function promptText(value: string, max = MAX_TEXT): PromptText {
  const clean = cleanText(value);
  const points = Array.from(clean);
  const limit = Math.max(0, Math.floor(max));
  if (points.length <= limit) return { text: clean, total: points.length, omitted: 0 };

  const shown = points.slice(0, limit).join("");
  const omitted = points.length - limit;
  return {
    text: `${shown}\n[Lateen: text truncated, ${omitted} of ${points.length} characters omitted]`,
    total: points.length,
    omitted,
  };
}

/** Fills `{source}` and `{text}` in a localized prompt template with one pass, so text cannot add placeholders. */
export function promptFor(template: string, source: string, text: string): string {
  return template
    .replace(/\{(source|text)\}/g, (_placeholder, name: string) => (name === "source" ? source : text))
    .trim();
}

/** The parts of a block the island reads: its span, its text, and the element it appends the button to. */
export interface BlockElement {
  readonly parentElement: BlockElement | null;
  readonly textContent: string | null;
  /** Upper-case tag name, as the DOM gives it. A fake without one is treated as a block that can hold a button. */
  readonly tagName?: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: ActionButton): unknown;
}

/** The part of the button the island reads and writes. */
export interface ActionButton {
  hidden: boolean;
  textContent: string | null;
  readonly dataset: {
    prompt?: string | undefined;
    copied?: string | undefined;
    copyFailed?: string | undefined;
    blockId?: string | undefined;
    lang?: string | undefined;
    version?: string | undefined;
    file?: string | undefined;
    source?: string | undefined;
    text?: string | undefined;
    textTotal?: string | undefined;
    textOmitted?: string | undefined;
  };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
  cloneNode(deep: boolean): ActionButton;
}

/** The server-rendered template: its button, and the localized prompt and result strings. */
export interface ActionTemplate {
  readonly content: { readonly firstElementChild: ActionButton | null };
  readonly dataset: {
    readonly prompt?: string | undefined;
    readonly copied?: string | undefined;
    readonly copyFailed?: string | undefined;
    readonly version?: string | undefined;
  };
}

/** The part of `navigator.clipboard` the island uses. */
export interface Clipboard {
  writeText(text: string): Promise<void>;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface ActivateEnv {
  readonly template: ActionTemplate;
  readonly blocks: Iterable<BlockElement>;
  readonly clipboard?: Clipboard | undefined;
  schedule(callback: () => void, ms: number): unknown;
}

/**
 * Blocks whose content model allows only list items, rows, or the like: a button appended to one is invalid HTML and
 * fails the list and table checks of screen readers and axe. They get no action of their own.
 */
const NO_BUTTON = new Set(["UL", "OL", "DL", "TABLE", "THEAD", "TBODY", "TR"]);

/** True when the block already sits inside another sourced block, so only the outermost gets an action. */
export function isNested(block: BlockElement): boolean {
  for (let parent = block.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent.getAttribute("data-src") !== null) return true;
  }
  return false;
}

/** Every block that should carry an action: those with a valid span and no sourced ancestor. */
export function topLevel(blocks: Iterable<BlockElement>): BlockElement[] {
  const out: BlockElement[] = [];
  const seen = new Set<BlockElement>();
  for (const block of blocks) {
    const source = block.getAttribute("data-src");
    if (source === null || parseSpan(source) === undefined) continue;
    if (isNested(block)) continue;
    if (block.tagName !== undefined && NO_BUTTON.has(block.tagName)) continue;
    if (seen.has(block)) continue;
    seen.add(block);
    out.push(block);
  }
  return out;
}

/** The tail of the clipboard write chain, so writes land in click order and a race cannot reorder them. */
let writes: Promise<void> = Promise.resolve();

/** Writes one prompt after every earlier write settles; a failed write does not stall the chain. */
function writeText(clipboard: Clipboard, text: string): Promise<void> {
  const next = writes.then(() => clipboard.writeText(text));
  writes = next.catch(() => undefined);
  return next;
}

/** The latest click on each button, so a slow earlier copy cannot overwrite a later result. */
const latest = new WeakMap<ActionButton, number>();

/** Shows `text` on the button for `RESET_MS`, then restores `label` if no newer click has taken over. */
function say(button: ActionButton, text: string, label: string, env: ActivateEnv, current: () => boolean): void {
  button.textContent = text;
  env.schedule(() => {
    if (current()) button.textContent = label;
  }, RESET_MS);
}

/** Writes the button's prompt to the clipboard and reports the result on the button. */
export function copy(button: ActionButton, label: string, env: ActivateEnv): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  const run = (latest.get(button) ?? 0) + 1;
  latest.set(button, run);
  const current = (): boolean => latest.get(button) === run;
  return writeText(clipboard, button.dataset.prompt ?? "").then(
    () => {
      if (current()) say(button, button.dataset.copied ?? label, label, env, current);
    },
    () => {
      if (current()) say(button, button.dataset.copyFailed ?? label, label, env, current);
    },
  );
}

/** The span with its language beside it, so a prompt keeps both when it leaves the page. */
function sourceWithContext(source: string, lang: string, version: string): string {
  const context = [lang, version].filter((value) => value !== "");
  return context.length === 0 ? source : `${source} (${context.join(", ")})`;
}

/** Clones the template's button into each top-level block, unless there is no clipboard to write to. */
export function activate(env: ActivateEnv): void {
  if (env.clipboard === undefined) return;
  const sample = env.template.content.firstElementChild;
  if (sample === null) return;

  const ids = new Set<string>();
  for (const block of topLevel(env.blocks)) {
    const source = block.getAttribute("data-src");
    if (source === null) continue;
    const span = parseSpan(source);
    const lang = block.getAttribute("data-lang")?.trim() ?? "";
    const text = block.textContent ?? "";
    const carried = promptText(text);
    const existing = block.getAttribute("id");
    const candidate = existing ?? (lang === "" ? undefined : blockId(source));
    const id = candidate !== undefined && !ids.has(candidate) ? candidate : undefined;
    if (existing === null && id !== undefined) block.setAttribute("id", id);
    if (candidate !== undefined) ids.add(candidate);

    const button = sample.cloneNode(true);
    button.hidden = false;
    const label = button.textContent ?? "";
    button.setAttribute("aria-label", `${label} (${source})`);
    button.dataset.prompt = promptFor(env.template.dataset.prompt ?? "", sourceWithContext(source, lang, env.template.dataset.version ?? ""), carried.text);
    button.dataset.copied = env.template.dataset.copied;
    button.dataset.copyFailed = env.template.dataset.copyFailed;
    button.dataset.blockId = id ?? source;
    button.dataset.lang = lang;
    button.dataset.file = span?.file ?? "";
    button.dataset.source = source;
    button.dataset.text = text;
    button.dataset.textTotal = String(carried.total);
    button.dataset.textOmitted = String(carried.omitted);
    button.addEventListener("click", () => {
      void copy(button, label, env);
    });
    block.appendChild(button);
  }
}

/** The browser environment: the page's template, its blocks, the clipboard, and a timer. */
const globals = globalThis as unknown as {
  document?: {
    querySelector(selector: string): unknown;
    querySelectorAll(selector: string): Iterable<BlockElement>;
  };
  navigator?: { clipboard?: Clipboard };
  setTimeout(callback: () => void, ms: number): unknown;
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const template = globals.document.querySelector("[data-block-actions]");
  if (template !== null) {
    activate({
      template: template as ActionTemplate,
      blocks: globals.document.querySelectorAll("[data-src]"),
      clipboard: globals.navigator?.clipboard,
      schedule: (callback, ms) => globals.setTimeout(callback, ms),
    });
  }
}
