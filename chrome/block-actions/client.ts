/*
 * Block actions: stamps one "Edit with your agent" button into every top-level block on the page.
 * Each button copies a one-line prompt naming the block's source file, its exact span, and its
 * current text. The template's buttons start `hidden`, so nothing is revealed unless the browser
 * has a clipboard to write to; a page without JavaScript keeps no controls at all.
 *
 * The island is type-stripped and shipped on its own, so it imports nothing and echoes the small
 * span grammar the engine writes into `data-src` (ADR 0026).
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

/** Longest block text the prompt carries; longer text is cut at a word-safe point with an ellipsis. */
export const MAX_TEXT = 160;

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
 * The block text as the prompt carries it: control characters and line breaks become one space,
 * so the prompt stays one line, and a long block is cut short with an ellipsis.
 */
export function summarizeText(value: string, max = MAX_TEXT): string {
  const oneLine = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Fills `{source}` and `{text}` in a localized prompt template with one pass, so text cannot add placeholders. */
export function promptFor(template: string, source: string, text: string): string {
  return template
    .replace(/\{(source|text)\}/g, (_placeholder, name: string) => (name === "source" ? source : text))
    .replace(/\s+/g, " ")
    .trim();
}

/** The parts of a block the island reads: its span, its text, and the element it appends the button to. */
export interface BlockElement {
  readonly parentElement: BlockElement | null;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  appendChild(child: ActionButton): unknown;
}

/** The part of the button the island reads and writes. */
export interface ActionButton {
  hidden: boolean;
  textContent: string | null;
  readonly dataset: { prompt?: string | undefined; copied?: string | undefined; copyFailed?: string | undefined };
  addEventListener(type: "click", listener: () => void): void;
  cloneNode(deep: boolean): ActionButton;
}

/** The server-rendered template: its button, and the localized prompt and result strings. */
export interface ActionTemplate {
  readonly content: { readonly firstElementChild: ActionButton | null };
  readonly dataset: { readonly prompt?: string | undefined; readonly copied?: string | undefined; readonly copyFailed?: string | undefined };
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
  for (const block of blocks) {
    const source = block.getAttribute("data-src");
    if (source === null || parseSpan(source) === undefined) continue;
    if (isNested(block)) continue;
    out.push(block);
  }
  return out;
}

/** Shows `text` on the button for `RESET_MS`, then restores `label`. */
function say(button: ActionButton, text: string, label: string, env: ActivateEnv): void {
  button.textContent = text;
  env.schedule(() => {
    button.textContent = label;
  }, RESET_MS);
}

/** Writes the button's prompt to the clipboard and reports the result on the button. */
export function copy(button: ActionButton, label: string, env: ActivateEnv): Promise<void> {
  const clipboard = env.clipboard;
  if (clipboard === undefined) return Promise.resolve();
  return clipboard.writeText(button.dataset.prompt ?? "").then(
    () => say(button, button.dataset.copied ?? label, label, env),
    () => say(button, button.dataset.copyFailed ?? label, label, env),
  );
}

/** Clones the template's button into each top-level block, unless there is no clipboard to write to. */
export function activate(env: ActivateEnv): void {
  if (env.clipboard === undefined) return;
  const sample = env.template.content.firstElementChild;
  if (sample === null) return;

  for (const block of topLevel(env.blocks)) {
    const source = block.getAttribute("data-src");
    if (source === null) continue;
    const button = sample.cloneNode(true);
    button.hidden = false;
    button.dataset.prompt = promptFor(env.template.dataset.prompt ?? "", source, summarizeText(block.textContent ?? ""));
    button.dataset.copied = env.template.dataset.copied;
    button.dataset.copyFailed = env.template.dataset.copyFailed;
    const label = button.textContent ?? "";
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
