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

/** A code block whose token straddles highlighted spans still changes as a whole. */
function replacePlaceholder(element: PlaceholderNode, name: string, value: string, previous?: string): void {
  const from = tokenOf(name);
  if (replaceIn(element, from, value)) return;
  // After the first edit the token is gone; the block shows the value it was given, so replace that.
  // shortcut: a block that shows the same text for a reason of its own follows this variable too; give
  // the variables distinct values, or upgrade this when a block can hold its template.
  if (previous !== undefined && previous !== "" && replaceIn(element, previous, value)) return;
  const text = element.textContent ?? "";
  if (text.includes(from)) element.textContent = text.split(from).join(value);
}

/** What each root last put into a block per variable, so a second edit replaces the value on screen. */
const appliedValues = new WeakMap<PlaceholderRoot, Map<string, string>>();

/**
 * Writes `value` into every placeholder for `name` under `root`: inline code spans, and code blocks and
 * terminal sessions that recorded the name in `data-placeholders`. Other variables and escaped placeholders
 * are left alone, and a repeat edit replaces the value the block already shows. A terminal's copy button
 * reads its command text from the page when it is clicked, so the copied commands follow this change too.
 */
export function applyValue(root: PlaceholderRoot, name: string, value: string): void {
  if (name === "") return;
  const applied = appliedValues.get(root) ?? new Map<string, string>();
  const previous = applied.get(name);
  appliedValues.set(root, applied);

  for (const span of root.querySelectorAll(INLINE_SELECTOR)) {
    if (span.getAttribute("data-var") === name) span.textContent = value;
  }
  for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (!namesOf(block.getAttribute("data-placeholders")).includes(name)) continue;
    replacePlaceholder(block, name, value, previous);
  }
  applied.set(name, value);
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
