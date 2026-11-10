/*
 * Variables form island: copies what a reader types into the placeholders of the same variable elsewhere on
 * the page. Inline code becomes `<span class="placeholder" data-var="name">` and a code block records its
 * variables in `data-placeholders`, both from the engine's placeholders plugin. The form is complete without
 * this script; the island only makes the examples live. Values stay in the browser: no cookie, no storage,
 * no request. On load it fills each example with the form's default, so the page starts on the documented
 * value rather than the braces.
 */

/** Attribute on the form root; the island finds forms by it. */
export const FORM_SELECTOR = "[data-variables-form]";

/** An input inside a form, keyed by the variable name. */
export const INPUT_SELECTOR = "input[data-var]";

/** An inline placeholder the engine wrote into a code span. */
export const INLINE_SELECTOR = ".placeholder[data-var]";

/** A code block whose variables the engine recorded in `data-placeholders`. */
export const BLOCK_SELECTOR = "[data-placeholders]";

/** The part of an input the island reads and wires. */
export interface VariableInput {
  readonly value: string;
  getAttribute(name: string): string | null;
  addEventListener(type: "input", listener: () => void): void;
}

/** A form as the island touches it. */
export interface VariableForm {
  querySelectorAll(selector: string): Iterable<VariableInput>;
}

/** A node the island rewrites: an element, a text node, or the document. */
export interface PlaceholderNode {
  readonly nodeType: number;
  textContent: string | null;
  readonly childNodes?: Iterable<PlaceholderNode> | undefined;
  getAttribute(name: string): string | null;
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
function replacePlaceholder(element: PlaceholderNode, name: string, value: string): void {
  const from = tokenOf(name);
  if (replaceIn(element, from, value)) return;
  const text = element.textContent ?? "";
  if (text.includes(from)) element.textContent = text.split(from).join(value);
}

/**
 * Writes `value` into every placeholder for `name` under `root`: inline code spans, and code blocks that
 * recorded the name in `data-placeholders`. Other variables and escaped placeholders are left alone.
 */
export function applyValue(root: PlaceholderRoot, name: string, value: string): void {
  if (name === "") return;
  for (const span of root.querySelectorAll(INLINE_SELECTOR)) {
    if (span.getAttribute("data-var") === name) span.textContent = value;
  }
  for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (!namesOf(block.getAttribute("data-placeholders")).includes(name)) continue;
    replacePlaceholder(block, name, value);
  }
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

/**
 * Wires one form: every input updates its variable's placeholders on `input`, and each default is applied
 * once so the examples show the documented values before the reader types. Returns the names wired.
 */
export function activate(root: PlaceholderRoot, form: VariableForm): string[] {
  const names: string[] = [];
  for (const input of form.querySelectorAll(INPUT_SELECTOR)) {
    const name = input.getAttribute("data-var");
    if (name === null || name === "") continue;
    names.push(name);
    const update = (): void => applyValue(root, name, input.value);
    input.addEventListener("input", update);
    update();
  }
  return names;
}

declare const document: (PlaceholderRoot & { querySelectorAll(selector: string): Iterable<PlaceholderNode> }) | undefined;

// The island runs when the browser loads it; importing it in a build or a test without a document does nothing.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(FORM_SELECTOR)) {
    activate(document, element as unknown as VariableForm);
  }
}
