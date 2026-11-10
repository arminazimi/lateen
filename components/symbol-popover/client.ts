/**
 * Symbol popover island: Escape hides the tooltip that `style.css` shows on hover or focus, and
 * leaving the chip lets it show again. It moves no focus, traps no focus, and changes no tab
 * order; without this script the popover still opens on hover and keyboard focus.
 */

/** Attribute set on a chip whose tooltip Escape hid. `style.css` hides the tooltip while it is set. */
export const DISMISSED_ATTRIBUTE = "data-dismissed";

/** Selector of every symbol chip; the island finds chips by it. */
export const SYMBOL_SELECTOR = "[data-symbol]";

/** A chip as the island touches it. */
export interface SymbolNode {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: SymbolEvent) => void): void;
}

/** A DOM event as the island reads it. */
export interface SymbolEvent {
  readonly key?: string;
}

/** Hides the tooltip of `node` when `event` is Escape; every other key is left to the browser. */
export function dismiss(node: SymbolNode, event: SymbolEvent): void {
  if (event.key !== "Escape") return;
  node.setAttribute(DISMISSED_ATTRIBUTE, "");
}

/** Lets the tooltip show again, after focus or the pointer leaves the chip. */
export function reset(node: SymbolNode): void {
  node.removeAttribute(DISMISSED_ATTRIBUTE);
}

/** Wires one chip: Escape dismisses, and leaving the chip resets so the next hover or focus shows it. */
export function enhance(node: SymbolNode): void {
  node.addEventListener("keydown", (event) => dismiss(node, event));
  node.addEventListener("blur", () => reset(node));
  node.addEventListener("mouseleave", () => reset(node));
}

declare const document: { querySelectorAll(selector: string): Iterable<unknown> } | undefined;

// The island runs when the browser loads it; importing it in a build or a test without a document does nothing.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(SYMBOL_SELECTOR)) {
    enhance(element as SymbolNode);
  }
}
