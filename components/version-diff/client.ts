/* Version diff island: previous and next buttons, a change count, and arrow-key movement between
   changes. Without this script the whole diff reads in order. */

/** Attribute on each viewer root (`data-version-diff`); the island finds viewers by it. */
export const GROUP_SELECTOR = "[data-version-diff]";
export const LIST_SELECTOR = "[data-version-diff-list]";
export const CONTROLS_SELECTOR = "[data-version-diff-controls]";
export const PREVIOUS_SELECTOR = "[data-version-diff-previous]";
export const NEXT_SELECTOR = "[data-version-diff-next]";
export const COUNT_SELECTOR = "[data-version-diff-count]";
export const ITEM_SELECTOR = "[data-version-diff-item]";

/** Marks a viewer the island has wired. */
export const ENHANCED_ATTR = "data-enhanced";

/** An element the island touches: a change, a button, or the count. */
export interface DiffElement {
  hidden: boolean;
  textContent: string | null;
  readonly dataset: { readonly template?: string };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  focus(): void;
  addEventListener(type: string, listener: (event: DiffEvent) => void): void;
}

/** A DOM event as the island reads it. */
export interface DiffEvent {
  readonly key?: string;
  readonly target: unknown;
  preventDefault(): void;
}

/** One viewer root as the island touches it. */
export interface DiffGroup {
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): DiffElement | null;
  querySelectorAll(selector: string): Iterable<DiffElement>;
}

/**
 * The change a key moves to, from change `index` of `count`, or undefined for any other key. Arrow
 * keys wrap; in a right-to-left viewer ArrowRight moves back and ArrowLeft forward, since the list
 * runs the other way. ArrowDown and ArrowUp always follow the list's visual order.
 */
export function step(key: string, index: number, count: number, rtl: boolean): number | undefined {
  if (count <= 0) return undefined;
  const forward = rtl ? -1 : 1;
  const wrap = (n: number): number => ((n % count) + count) % count;
  switch (key) {
    case "ArrowRight":
      return wrap(index + forward);
    case "ArrowLeft":
      return wrap(index - forward);
    case "ArrowDown":
      return wrap(index + 1);
    case "ArrowUp":
      return wrap(index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** The count text: the localised template with `{current}` and `{total}` filled in. */
export function countText(template: string, current: number, total: number): string {
  const text = template.trim() === "" ? "{current} / {total}" : template;
  return text.replace(/\{current\}/g, String(current)).replace(/\{total\}/g, String(total));
}

/** Makes change `index` the one in the tab order, focuses it, and updates the count. */
export function select(items: readonly DiffElement[], index: number, count?: DiffElement | null): void {
  items.forEach((item, position) => item.setAttribute("tabindex", position === index ? "0" : "-1"));
  const target = items[index];
  if (target === undefined) return;
  target.focus();
  if (count !== null && count !== undefined) {
    count.textContent = countText(count.dataset.template ?? "", index + 1, items.length);
  }
}

/**
 * Wires one viewer. The controls stay hidden until this runs, so a page without JavaScript shows the
 * whole diff and no dead buttons. From then on Previous and Next step and wrap, the count follows,
 * and arrow keys, Home, and End move through the changes with one change in the tab order at a time.
 */
export function activate(group: DiffGroup, rtl: boolean): void {
  const items = [...group.querySelectorAll(ITEM_SELECTOR)];
  if (items.length === 0) return;

  const list = group.querySelector(LIST_SELECTOR);
  const controls = group.querySelector(CONTROLS_SELECTOR);
  const previous = group.querySelector(PREVIOUS_SELECTOR);
  const next = group.querySelector(NEXT_SELECTOR);
  const count = group.querySelector(COUNT_SELECTOR);

  let at = 0;
  const go = (index: number): void => {
    at = ((index % items.length) + items.length) % items.length;
    select(items, at, count);
  };

  // The first change is in the tab order; the others are reached with the arrow keys.
  items.forEach((item, position) => item.setAttribute("tabindex", position === 0 ? "0" : "-1"));
  if (count !== null) count.textContent = countText(count.dataset.template ?? "", 1, items.length);

  if (previous !== null) previous.addEventListener("click", () => go(at - 1));
  if (next !== null) next.addEventListener("click", () => go(at + 1));

  if (list !== null) {
    list.addEventListener("keydown", (event) => {
      const to = step(event.key ?? "", at, items.length, rtl);
      if (to === undefined) return;
      event.preventDefault();
      go(to);
    });
  }

  if (controls !== null) controls.hidden = false;
  group.setAttribute(ENHANCED_ATTR, "");
}

// The theme's tsconfig has no DOM lib; these are the browser globals the island needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare function getComputedStyle(element: unknown): { direction: string };

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(GROUP_SELECTOR)) {
    activate(element as DiffGroup, getComputedStyle(element).direction === "rtl");
  }
}
