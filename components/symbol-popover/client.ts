/**
 * Symbol popover island: Escape closes the open disclosure and returns focus to its chip, and a
 * click outside closes it without moving focus. The disclosure is a native `<details>`, so it
 * already opens with Enter, Space, or a tap and closes with a tap on its chip without this script;
 * the island never traps focus or changes the tab order.
 */

/** Selector of every symbol disclosure; the island finds them by it. Static chips have no panel. */
export const PANEL_SELECTOR = "details[data-symbol]";

/** Selector of the chip inside a disclosure, which takes focus back when Escape closes it. */
export const SUMMARY_SELECTOR = "summary";

/** The chip as the island touches it. */
export interface SymbolChip {
  focus(): void;
}

/** A keyboard or pointer event as the island reads it. */
export interface SymbolEvent {
  readonly key?: string;
  readonly target?: unknown;
  preventDefault(): void;
}

/** A disclosure as the island touches it: a `<details>` element. */
export interface SymbolNode {
  open: boolean;
  querySelector(selector: string): SymbolChip | null;
  contains(target: unknown): boolean;
  addEventListener(type: string, listener: (event: SymbolEvent) => void): void;
}

/**
 * Closes `panel` and focuses its chip when `event` is Escape and the panel is open. Every other key,
 * and Escape on a closed panel, is left to the browser.
 */
export function closeOnEscape(panel: SymbolNode, event: SymbolEvent): void {
  if (event.key !== "Escape" || !panel.open) return;
  event.preventDefault();
  panel.open = false;
  panel.querySelector(SUMMARY_SELECTOR)?.focus();
}

/**
 * Closes `panel` when a click lands outside it. The chip stays untouched, and a click inside the
 * panel or its chip leaves it open. Focus is not moved: the clicked element keeps it.
 */
export function closeOutside(panel: SymbolNode, target: unknown): void {
  if (!panel.open || panel.contains(target)) return;
  panel.open = false;
}

/** Wires one disclosure: Escape closes it and focus returns to its chip. */
export function activate(panel: SymbolNode): void {
  panel.addEventListener("keydown", (event) => closeOnEscape(panel, event));
}

declare const document:
  | {
      querySelectorAll(selector: string): Iterable<unknown>;
      addEventListener(type: string, listener: (event: SymbolEvent) => void): void;
    }
  | undefined;

// The island runs when the browser loads it; importing it in a build or a test without a document does nothing.
if (typeof document !== "undefined") {
  const panels = [...document.querySelectorAll(PANEL_SELECTOR)] as SymbolNode[];
  for (const panel of panels) activate(panel);
  document.addEventListener("click", (event) => {
    for (const panel of panels) closeOutside(panel, event.target);
  });
}
