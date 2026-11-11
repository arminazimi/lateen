/*
 * Variables form island: copies what a reader types into the placeholders of the same variable elsewhere on
 * the page. Inline code becomes `<span class="placeholder" data-var="name">` and a code block records its
 * variables in `data-placeholders`, both from the engine's placeholders plugin. The terminal island records
 * its session there the same way, and its copy button reads the command text from the page when it is
 * clicked. A recorded output block names its variables in `data-output-deps`; the island never rewrites it,
 * because nobody can run the command again here, and marks it stale instead. The form is complete without
 * this script; the island only makes the examples live. Values stay in the browser: no cookie, no storage,
 * no request, and no command is ever executed.
 */

/** Attribute on the form root; the island finds forms by it. */
export const FORM_SELECTOR = "[data-variables-form]";

/** An input inside a form, keyed by the variable name. */
export const INPUT_SELECTOR = "input[data-var]";

/** The form's reset button, which restores every declared default. */
export const RESET_SELECTOR = "[data-variables-reset]";

/** An inline placeholder the engine wrote into a code span. */
export const INLINE_SELECTOR = ".placeholder[data-var]";

/** A code block whose variables the engine recorded in `data-placeholders`. */
export const BLOCK_SELECTOR = "[data-placeholders]";

/** A recorded output that named the variables it was produced with in `data-output-deps`. */
export const OUTPUT_DEPENDENCY_SELECTOR = "[data-output-deps]";

/** The note inside a recorded output that the island fills in when the output goes stale. */
export const STALE_NOTE_SELECTOR = "[data-output-stale-note]";

/** The part of an input the island reads and wires. */
export interface VariableInput {
  value: string;
  /** The browser's constraint validation; an absent one is treated as valid, so a fake needs only the rest. */
  readonly validity?: { readonly valid: boolean };
  getAttribute(name: string): string | null;
  addEventListener(type: "input", listener: () => void): void;
}

/** The reset button: the island reveals it and restores the declared defaults on click. */
export interface ResetButton {
  hidden: boolean;
  addEventListener(type: "click", listener: () => void): void;
}

/** A form as the island touches it. */
export interface VariableForm {
  querySelectorAll(selector: string): Iterable<VariableInput>;
  /** The reset button inside the form, when it has one. */
  querySelector?(selector: string): ResetButton | null;
}

/** A node the island rewrites: an element, a text node, or the document. */
export interface PlaceholderNode {
  readonly nodeType: number;
  textContent: string | null;
  readonly childNodes?: Iterable<PlaceholderNode> | undefined;
  getAttribute(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  querySelector?(selector: string): PlaceholderNode | null;
}

/** Everything the island reads from the page. Tests pass fakes; the browser supplies its own. */
export interface PlaceholderRoot {
  querySelectorAll(selector: string): Iterable<PlaceholderNode>;
}

/** The `{{name}}` text a placeholder stands for. */
export function tokenOf(name: string): string {
  return `{{${name}}}`;
}

/** The names recorded in a code block's `data-placeholders`, in order; malformed JSON gives none. */
export function namesOf(raw: string | null): string[] {
  if (raw === null || raw.trim() === "") return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item !== "object" || item === null) return "";
        const name = (item as Readonly<Record<string, unknown>>).name;
        return typeof name === "string" ? name : "";
      })
      .filter((name) => name !== "");
  } catch {
    return [];
  }
}

/**
 * Replaces every `from` in a node's text with `to`, visiting text nodes so the surrounding markup keeps its
 * shape. Returns whether anything changed.
 */
export function replaceIn(node: PlaceholderNode, from: string, to: string): boolean {
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    if (!text.includes(from)) return false;
    node.textContent = text.split(from).join(to);
    return true;
  }
  const children = node.childNodes;
  if (children === undefined) return false;
  let changed = false;
  for (const child of children) changed = replaceIn(child, from, to) || changed;
  return changed;
}

/** A placeholder the engine recorded: `{{name}}`, with optional spaces the author may have written. */
const PLACEHOLDER = /\{\{[ \t]*([A-Za-z0-9_.-]+)[ \t]*\}\}/g;

/** A code block as the author wrote it: its text nodes and the joined text they hold. */
interface BlockTemplate {
  readonly nodes: PlaceholderNode[];
  /** Where each text node ends in the joined text, so an edit can be written back span by span. */
  readonly ends: number[];
  readonly text: string;
}

/**
 * The authored text of each block, kept on the first edit. Every later edit starts from this template, so a
 * value that equals another variable's token, or the text the block showed a moment ago, is never replaced.
 */
const templates = new WeakMap<PlaceholderNode, BlockTemplate>();

/** The text nodes inside a block, in document order. */
function textNodesOf(node: PlaceholderNode, found: PlaceholderNode[] = []): PlaceholderNode[] {
  if (node.nodeType === 3) {
    found.push(node);
    return found;
  }
  const children = node.childNodes;
  if (children !== undefined) for (const child of children) textNodesOf(child, found);
  return found;
}

/** The block's authored text, captured before the first edit and reused after it. */
function templateOf(block: PlaceholderNode): BlockTemplate {
  const cached = templates.get(block);
  if (cached !== undefined) return cached;
  const nodes = textNodesOf(block);
  const ends: number[] = [];
  let at = 0;
  for (const node of nodes) {
    at += (node.textContent ?? "").length;
    ends.push(at);
  }
  const template = { nodes, ends, text: nodes.map((node) => node.textContent ?? "").join("") };
  templates.set(block, template);
  return template;
}

/** One token to replace in the template and the text that takes its place. */
interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The edits for the values this block knows, skipping an escaped `\{{name}}` the author meant literally. */
function editsIn(template: string, values: ReadonlyMap<string, string>): Edit[] {
  const edits: Edit[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0;
    let backslashes = 0;
    for (let i = start - 1; i >= 0 && template.charAt(i) === "\\"; i -= 1) backslashes += 1;
    if (backslashes % 2 === 1) continue;
    const value = values.get(match[1] ?? "");
    if (value === undefined) continue;
    edits.push({ start, end: start + match[0].length, text: value });
  }
  return edits;
}

/** Where template offset `at` lands once the edits are applied, so each text node keeps its own slice. */
function offsetAfter(at: number, edits: readonly Edit[]): number {
  let out = at;
  for (const edit of edits) {
    if (edit.start >= at) break;
    const before = Math.min(at, edit.end) - edit.start;
    out += Math.min(before, edit.text.length) - before;
  }
  return out;
}

/**
 * Writes every known variable's value into the block it was authored with. A token split across highlighted
 * spans is found in the joined text and its replacement is spread back over the same nodes, so the rest of the
 * markup keeps its shape. Tokens are matched once against the template, so a value never cascades into another.
 */
function fillTemplate(block: PlaceholderNode, values: ReadonlyMap<string, string>): void {
  const template = templateOf(block);
  const edits = editsIn(template.text, values);
  if (edits.length === 0) return;
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += template.text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  out += template.text.slice(cursor);
  for (const [index, node] of template.nodes.entries()) {
    const from = index === 0 ? 0 : offsetAfter(template.ends[index - 1] ?? 0, edits);
    const to = index === template.nodes.length - 1 ? out.length : offsetAfter(template.ends[index] ?? 0, edits);
    node.textContent = out.slice(from, to);
  }
}

/** What each root last put into its blocks per variable, so a later edit can be rendered from the template. */
const appliedValues = new WeakMap<PlaceholderRoot, Map<string, string>>();

/**
 * Writes `value` into every placeholder for `name` under `root`: inline code spans, and code blocks and
 * terminal sessions that recorded the name in `data-placeholders`. Other variables and escaped placeholders
 * are left alone, and each block is rendered from the text the author wrote, so a second edit replaces only
 * the tokens and never a value it showed before. A terminal's copy button reads its command text from the
 * page when it is clicked, so the copied commands follow this change too.
 */
export function applyValue(root: PlaceholderRoot, name: string, value: string): void {
  if (name === "") return;
  const applied = appliedValues.get(root) ?? new Map<string, string>();
  applied.set(name, value);
  appliedValues.set(root, applied);

  for (const span of root.querySelectorAll(INLINE_SELECTOR)) {
    if (span.getAttribute("data-var") === name) span.textContent = value;
  }
  for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (!namesOf(block.getAttribute("data-placeholders")).includes(name)) continue;
    fillTemplate(block, applied);
  }
}

/**
 * Marks every recorded output that names `name` as out of date, and shows its note. The output text is never
 * rewritten: it is what a command printed once, and only re-running the command can change it. Returns how
 * many outputs were marked.
 */
export function markStale(root: PlaceholderRoot, name: string): number {
  let marked = 0;
  for (const block of root.querySelectorAll(OUTPUT_DEPENDENCY_SELECTOR)) {
    if (!namesOf(block.getAttribute("data-output-deps")).includes(name)) continue;
    block.setAttribute?.("data-output-stale", "true");
    const note = block.querySelector?.(STALE_NOTE_SELECTOR) ?? null;
    if (note !== null) note.textContent = block.getAttribute("data-stale-text") ?? "";
    marked += 1;
  }
  return marked;
}

/** Reads a form's current values, keyed by variable name. */
export function valuesOf(form: VariableForm): Map<string, string> {
  const values = new Map<string, string>();
  for (const input of form.querySelectorAll(INPUT_SELECTOR)) {
    const name = input.getAttribute("data-var");
    if (name !== null && name !== "") values.set(name, input.value);
  }
  return values;
}

/** Whether an input passes the type the declaration set; a value the browser rejects never reaches an example. */
function valid(input: VariableInput): boolean {
  return input.validity?.valid !== false;
}

/**
 * Wires one form: every input updates its variable's placeholders on `input`, each default is applied once so
 * the examples show the documented values before the reader types, changing a value marks the recorded output
 * that depends on it stale, and the reset button puts every declared default back. Returns the names wired.
 */
export function activate(root: PlaceholderRoot, form: VariableForm): string[] {
  const names: string[] = [];
  for (const input of form.querySelectorAll(INPUT_SELECTOR)) {
    const name = input.getAttribute("data-var");
    if (name === null || name === "") continue;
    names.push(name);
    applyValue(root, name, input.value);
    input.addEventListener("input", () => {
      if (!valid(input)) return;
      applyValue(root, name, input.value);
      markStale(root, name);
    });
  }
  const reset = form.querySelector?.(RESET_SELECTOR) ?? null;
  if (reset !== null) {
    reset.hidden = false;
    reset.addEventListener("click", () => {
      for (const input of form.querySelectorAll(INPUT_SELECTOR)) {
        const name = input.getAttribute("data-var");
        if (name === null || name === "") continue;
        input.value = input.getAttribute("data-default") ?? "";
        applyValue(root, name, input.value);
      }
    });
  }
  return names;
}

declare const document:
  | (PlaceholderRoot & { querySelectorAll(selector: string): Iterable<PlaceholderNode> })
  | undefined;

// The island runs when the browser loads it; importing it in a build or a test without a document does nothing.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(FORM_SELECTOR)) {
    activate(document, element as unknown as VariableForm);
  }
}
