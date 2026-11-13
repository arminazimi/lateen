/*
 * Variables form island: copies what a reader types into the placeholders of the same variable in the
 * examples that belong to the form's group. A form, a terminal, and an output block are connected only by
 * a matching `data-variable-group`; a page with exactly one form that has no authored group keeps the
 * original page-wide behavior, so a single form still drives inline placeholders and ungrouped code
 * blocks. Inline code becomes `<span class="placeholder" data-var="name">` and a code block records its
 * variables in `data-placeholders`, both from the engine's placeholders plugin; the engine has no group
 * identity for inline code, so grouped inline and code-block annotation is not part of this island.
 *
 * The island validates each declared type before a value reaches an example: `url`, `number`, and
 * `boolean` follow the documented contract, `string` (and an unknown type) accepts any text. An invalid
 * input is marked `aria-invalid`, shows its server-rendered message, sets the form's invalid state, and
 * blocks the copy buttons of terminals in the same group; an output block in the group is stale while any
 * input is invalid. A recorded output is never rewritten, because nobody can run the command again here.
 * Freshness is remembered from the values each group was wired with, and reset puts those defaults back,
 * revalidates them, restores the examples, clears the stale state, and announces itself in a live region.
 * Other groups are untouched. Values stay in the browser: no cookie, no storage, no request, and no
 * command is ever executed.
 */

import {
  ERROR_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  GROUP_EXPLICIT_ATTRIBUTE,
  INVALID_ATTRIBUTE,
  INVALID_TEXT_ATTRIBUTE,
  RESET_TEXT_ATTRIBUTE,
  TYPE_ATTRIBUTE,
} from "./group.ts";
import { isValidValue, validationTypeOf } from "./validation.ts";

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

/** An input's visible error message. */
export const ERROR_SELECTOR = "[data-error-for]";

/** The form's live region, which announces a reset. */
export const STATUS_SELECTOR = "[data-variables-status]";

/** A terminal copy button whose group can be blocked while a value is invalid. */
export const TERMINAL_BUTTON_SELECTOR = "[data-terminal-copy]";

/** The live region beside a terminal copy button. */
export const TERMINAL_STATUS_SELECTOR = "[data-terminal-status]";

/** The part of an input the island reads and wires. */
export interface VariableInput {
  value: string;
  /** The browser's constraint validation; an absent one is treated as valid, so a fake needs only the rest. */
  readonly validity?: { readonly valid: boolean };
  getAttribute(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
  addEventListener(type: "input", listener: () => void): void;
}

/** The reset button: the island reveals it and restores the declared defaults on click. */
export interface ResetButton {
  hidden: boolean;
  addEventListener(type: "click", listener: () => void): void;
}

/** A form as the island touches it. The node methods are optional so a small fake needs only what it uses. */
export interface VariableForm {
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
  querySelectorAll(selector: string): Iterable<unknown>;
  querySelector?(selector: string): unknown;
}

/** A node the island rewrites: an element, a text node, or the document. */
export interface PlaceholderNode {
  readonly nodeType: number;
  textContent: string | null;
  readonly childNodes?: Iterable<PlaceholderNode> | undefined;
  getAttribute(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  /** Removes the stale marker when the recorded output is fresh again; an absent one is treated as read-only. */
  removeAttribute?(name: string): void;
  querySelector?(selector: string): PlaceholderNode | null;
}

/** Everything the island reads from the page. Tests pass fakes; the browser supplies its own. */
export interface PlaceholderRoot {
  querySelectorAll(selector: string): Iterable<PlaceholderNode>;
}

/** The group a form drives, and whether the page is in the single-form legacy mode. */
export interface GroupScope {
  /** The form's group; empty only for a fake or a form that predates the attribute. */
  readonly group: string;
  /** True for the one-form page with no authored group: ungrouped examples still follow it. */
  readonly legacy: boolean;
}

/** The selection a direct `applyValue` call uses: the original page-wide behavior. */
const PAGE_SCOPE: GroupScope = { group: "", legacy: true };

/** The form group an example node belongs to, if it declares one. */
export function groupOf(node: { getAttribute(name: string): string | null }): string | undefined {
  const raw = node.getAttribute(GROUP_ATTRIBUTE);
  return raw === null || raw === "" ? undefined : raw;
}

/**
 * True when an example in `scope`'s group follows the form: a node in the same group always does; an
 * ungrouped node does only in the single-form legacy mode.
 */
export function appliesTo(node: { getAttribute(name: string): string | null }, scope: GroupScope): boolean {
  const own = groupOf(node);
  return own === undefined ? scope.legacy : own === scope.group;
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
  let delta = 0;
  for (const edit of edits) {
    if (edit.start >= at) break;
    const original = Math.min(at, edit.end) - edit.start;
    // Past the edit the whole replacement counts; inside it only the part before `at`.
    const replacement = at >= edit.end ? edit.text.length : Math.min(original, edit.text.length);
    delta += replacement - original;
  }
  return at + delta;
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

/** What each block last received per variable, so a later edit can be rendered from the template. */
const appliedValues = new WeakMap<PlaceholderNode, Map<string, string>>();

/**
 * Writes `value` into every placeholder for `name` that belongs to `scope`: inline code spans only in the
 * single-form legacy mode, and code blocks and terminal sessions that recorded the name in
 * `data-placeholders`. Other variables and escaped placeholders are left alone, and each block is rendered
 * from the text the author wrote, so a second edit replaces only the tokens and never a value it showed
 * before. A terminal's copy button reads its command text from the page when it is clicked, so the copied
 * commands follow this change too.
 */
export function applyValue(root: PlaceholderRoot, name: string, value: string, scope: GroupScope = PAGE_SCOPE): void {
  if (name === "") return;

  if (scope.legacy) {
    for (const span of root.querySelectorAll(INLINE_SELECTOR)) {
      if (span.getAttribute("data-var") === name) span.textContent = value;
    }
  }
  for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (!appliesTo(block, scope)) continue;
    if (!namesOf(block.getAttribute("data-placeholders")).includes(name)) continue;
    const applied = appliedValues.get(block) ?? new Map<string, string>();
    applied.set(name, value);
    appliedValues.set(block, applied);
    fillTemplate(block, applied);
  }
}

/** The attribute that marks a recorded output as older than its inputs. */
export const STALE_ATTRIBUTE = "data-output-stale";

/** Marks one recorded output stale and shows its note. The output text itself is never rewritten. */
function markBlock(block: PlaceholderNode): void {
  block.setAttribute?.(STALE_ATTRIBUTE, "true");
  const note = block.querySelector?.(STALE_NOTE_SELECTOR) ?? null;
  if (note !== null) note.textContent = block.getAttribute("data-stale-text") ?? "";
}

/** Clears one recorded output's stale marker and its note, because every value it was produced with is back. */
function clearBlock(block: PlaceholderNode): void {
  block.removeAttribute?.(STALE_ATTRIBUTE);
  const note = block.querySelector?.(STALE_NOTE_SELECTOR) ?? null;
  if (note !== null) note.textContent = "";
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
    markBlock(block);
    marked += 1;
  }
  return marked;
}

/** What one group remembers about its variables' recorded values, current values, and rejected inputs. */
interface GroupState {
  /** Each variable's server-rendered default, i.e. the value the documented output was produced with. */
  readonly baselines: Map<string, string>;
  /** Each variable's last value a form applied, after validation. */
  readonly currents: Map<string, string>;
  /** Names whose current input the declared type rejects. */
  readonly invalid: Set<string>;
  /** Whether the group's terminals were blocked last time, so a live region is written only on a change. */
  blocked: boolean;
}

const freshness = new WeakMap<PlaceholderRoot, Map<string, GroupState>>();

/** The state for one form's group, created empty on first sight. */
function stateOf(root: PlaceholderRoot, group: string): GroupState {
  const states = freshness.get(root) ?? new Map<string, GroupState>();
  freshness.set(root, states);
  const existing = states.get(group);
  if (existing !== undefined) return existing;
  const created: GroupState = { baselines: new Map(), currents: new Map(), invalid: new Set(), blocked: false };
  states.set(group, created);
  return created;
}

/** Every state on the page, for the legacy `recomputeStaleness(root)` call that predates groups. */
function statesOf(root: PlaceholderRoot): GroupState[] {
  const states = freshness.get(root);
  return states === undefined ? [] : [...states.values()];
}

/**
 * Re-derives every recorded output's stale state from the current values against the recorded ones. An
 * output is fresh, and its marker cleared, only when every one of its declared and inferred dependencies
 * has both a recorded value and a current one and they are equal; any dependency that differs, and any
 * input the group rejects, marks the output stale. With a scope only that group's outputs are touched; the
 * legacy call without one considers every group. A dependency no wired form has ever held gives no
 * trustworthy baseline, so such an output keeps the state it already has: the island never infers freshness
 * it cannot check. Outputs without dependencies are not touched.
 */
export function recomputeStaleness(root: PlaceholderRoot, scope?: GroupScope): void {
  const states = scope === undefined ? statesOf(root) : [stateOf(root, scope.group)];
  if (states.length === 0) return;

  const baselines = new Map<string, string>();
  const currents = new Map<string, string>();
  let invalid = false;
  for (const state of states) {
    for (const [name, value] of state.baselines) if (!baselines.has(name)) baselines.set(name, value);
    for (const [name, value] of state.currents) currents.set(name, value);
    invalid = invalid || state.invalid.size > 0;
  }

  for (const block of root.querySelectorAll(OUTPUT_DEPENDENCY_SELECTOR)) {
    if (scope !== undefined && !appliesTo(block, scope)) continue;
    const names = namesOf(block.getAttribute("data-output-deps"));
    if (names.length === 0) continue;
    if (invalid) {
      markBlock(block);
      continue;
    }
    let differs = false;
    let untrustworthy = false;
    for (const name of names) {
      const baseline = baselines.get(name);
      const current = currents.get(name);
      if (baseline === undefined || current === undefined) {
        untrustworthy = true;
        continue;
      }
      if (baseline !== current) {
        differs = true;
        break;
      }
    }
    if (differs) markBlock(block);
    else if (!untrustworthy) clearBlock(block);
  }
}

/** Reads a form's current values, keyed by variable name. */
export function valuesOf(form: VariableForm): Map<string, string> {
  const values = new Map<string, string>();
  for (const node of form.querySelectorAll(INPUT_SELECTOR)) {
    const input = node as VariableInput;
    const name = input.getAttribute("data-var");
    if (name !== null && name !== "") values.set(name, input.value);
  }
  return values;
}

/** Whether an input passes its declared type; a value the island rejects never reaches an example. */
export function isValid(input: VariableInput): boolean {
  const type = validationTypeOf(input.getAttribute(TYPE_ATTRIBUTE));
  if (type === "string") return input.validity?.valid !== false;
  return isValidValue(type, input.value);
}

/** Shows or hides the server-rendered message for one variable and sets its input's invalid state. */
function showValidity(form: VariableForm, input: VariableInput, name: string, valid: boolean): void {
  if (valid) input.removeAttribute?.("aria-invalid");
  else input.setAttribute?.("aria-invalid", "true");
  for (const node of form.querySelectorAll(ERROR_SELECTOR)) {
    if (node === null || typeof node !== "object") continue;
    const error = node as { getAttribute(name: string): string | null; hidden?: boolean };
    if (error.getAttribute(ERROR_ATTRIBUTE) !== name) continue;
    error.hidden = valid;
  }
}

/** A copy button the island can disable while its group is invalid. */
interface CopyButton {
  disabled?: boolean;
}

/**
 * Applies the group's invalid state to its terminals: their copy buttons are disabled and their live region
 * says why, or both are cleared. Writes only when the state changes, so typing does not re-announce the same
 * sentence. The output block keeps its copy button: its text is the author's, not derived from the inputs.
 */
function syncTerminals(root: PlaceholderRoot, form: VariableForm, scope: GroupScope, state: GroupState): void {
  const blocked = state.invalid.size > 0;
  if (blocked) form.setAttribute?.(INVALID_ATTRIBUTE, "true");
  else form.removeAttribute?.(INVALID_ATTRIBUTE);
  if (state.blocked === blocked) return;
  state.blocked = blocked;
  for (const node of root.querySelectorAll(TERMINAL_BUTTON_SELECTOR)) {
    if (!appliesTo(node, scope)) continue;
    (node as unknown as CopyButton).disabled = blocked;
  }
  for (const node of root.querySelectorAll(TERMINAL_STATUS_SELECTOR)) {
    if (!appliesTo(node, scope)) continue;
    node.textContent = blocked ? node.getAttribute(INVALID_TEXT_ATTRIBUTE) ?? "" : "";
  }
}

/** Announces the reset in the form's live region. */
function announce(form: VariableForm): void {
  const status = form.querySelector?.(STATUS_SELECTOR) as { textContent: string | null } | null | undefined;
  if (status === null || status === undefined) return;
  status.textContent = form.getAttribute?.(RESET_TEXT_ATTRIBUTE) ?? "";
}

/**
 * Wires one form: every input is validated and applies its default to the examples in the form's group, and
 * every change revalidates, updates the examples, blocks or unblocks the group's terminal copy buttons, and
 * recomputes whether the group's recorded outputs are stale. The reset button puts every declared default
 * back, revalidates them, clears the stale state, and announces itself; other groups are untouched. Returns
 * the names wired.
 */
export function activate(root: PlaceholderRoot, form: VariableForm): string[] {
  const group = form.getAttribute?.(GROUP_ATTRIBUTE) ?? "";
  const explicit = form.getAttribute?.(GROUP_EXPLICIT_ATTRIBUTE) === "true";
  const forms = [...root.querySelectorAll(FORM_SELECTOR)];
  const scope: GroupScope = { group, legacy: forms.length <= 1 && !explicit };
  const state = stateOf(root, group);
  const names: string[] = [];

  for (const node of form.querySelectorAll(INPUT_SELECTOR)) {
    const input = node as VariableInput;
    const name = input.getAttribute("data-var");
    if (name === null || name === "") continue;
    names.push(name);
    const baseline = input.getAttribute("data-default") ?? input.value;
    if (!state.baselines.has(name)) state.baselines.set(name, baseline);
    state.currents.set(name, input.value);

    const valid = isValid(input);
    if (valid) state.invalid.delete(name);
    else state.invalid.add(name);
    showValidity(form, input, name, valid);
    if (valid) applyValue(root, name, input.value, scope);

    input.addEventListener("input", () => {
      state.currents.set(name, input.value);
      const valid = isValid(input);
      if (valid) state.invalid.delete(name);
      else state.invalid.add(name);
      showValidity(form, input, name, valid);
      if (valid) applyValue(root, name, input.value, scope);
      syncTerminals(root, form, scope, state);
      recomputeStaleness(root, scope);
    });
  }

  syncTerminals(root, form, scope, state);
  recomputeStaleness(root, scope);

  const reset = form.querySelector?.(RESET_SELECTOR) as ResetButton | null | undefined;
  if (reset !== null && reset !== undefined) {
    reset.hidden = false;
    reset.addEventListener("click", () => {
      for (const node of form.querySelectorAll(INPUT_SELECTOR)) {
        const input = node as VariableInput;
        const name = input.getAttribute("data-var");
        if (name === null || name === "") continue;
        input.value = input.getAttribute("data-default") ?? "";
        state.currents.set(name, input.value);
        const valid = isValid(input);
        if (valid) state.invalid.delete(name);
        else state.invalid.add(name);
        showValidity(form, input, name, valid);
        if (valid) applyValue(root, name, input.value, scope);
      }
      syncTerminals(root, form, scope, state);
      recomputeStaleness(root, scope);
      announce(form);
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
