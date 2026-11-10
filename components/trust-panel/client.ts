/**
 * Trust panel island: Escape closes the open panel and returns focus to the chip that opened it.
 * The panel is a native `<details>`, so it still opens with Enter, Space, or a click and closes
 * with Escape without this script; the island only adds the focus return.
 */

/** Selector of every trust panel; the island finds them by it. */
export const PANEL_SELECTOR = "[data-trust-panel]";

/** Selector of the chip inside a panel, which takes focus back when Escape closes it. */
export const SUMMARY_SELECTOR = "summary";

/** The chip as the island touches it. */
export interface TrustSummary {
  focus(): void;
}

/** A keyboard event as the island reads it. */
export interface TrustEvent {
  readonly key?: string;
  preventDefault(): void;
}

/** A panel as the island touches it: a `<details>` element. */
export interface TrustPanelNode {
  open: boolean;
  querySelector(selector: string): TrustSummary | null;
  addEventListener(type: string, listener: (event: TrustEvent) => void): void;
}

/**
 * Closes `panel` and focuses its chip when `event` is Escape and the panel is open. Every other key,
 * and Escape on a closed panel, is left to the browser.
 */
export function closeOnEscape(panel: TrustPanelNode, event: TrustEvent): void {
  if (event.key !== "Escape" || !panel.open) return;
  event.preventDefault();
  panel.open = false;
  panel.querySelector(SUMMARY_SELECTOR)?.focus();
}

/** Wires one panel: Escape closes it and focus returns to its chip. */
export function activate(panel: TrustPanelNode): void {
  panel.addEventListener("keydown", (event) => closeOnEscape(panel, event));
}

declare const document: { querySelectorAll(selector: string): Iterable<unknown> } | undefined;

// The island runs when the browser loads it; importing it in a build or a test without a document does nothing.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(PANEL_SELECTOR)) {
    activate(element as TrustPanelNode);
  }
}
