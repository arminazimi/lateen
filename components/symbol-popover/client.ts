/**
 * Symbol popover island: Escape closes the open disclosure and returns focus to its chip, and a
 * click outside closes it without moving focus. Only open disclosures are tracked, so a click or a
 * key costs work proportional to what is open, not to every symbol on the page. The disclosure is a
 * native `<details>`, so it already opens with Enter, Space, or a tap and closes with a tap on its
 * chip without this script; the island never traps focus or changes the tab order.
 */

/** Selector of every symbol disclosure; the island finds them by it. Static chips have no panel. */
export const PANEL_SELECTOR = "details[data-symbol]";

/** Selector of the chip inside a disclosure, which takes focus back when Escape closes it. */
export const SUMMARY_SELECTOR = "summary";

/** The chip as the island touches it. */
export interface SymbolChip {
  focus(): void;
}

/** A keyboard, toggle, or pointer event as the island reads it. */
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
  removeEventListener(type: string, listener: (event: SymbolEvent) => void): void;
}

/** What `activate` wires to one disclosure, so it can be unwired again. */
interface Wiring {
  readonly panel: SymbolNode;
  readonly keydown: (event: SymbolEvent) => void;
  readonly toggle: (event: SymbolEvent) => void;
  /** Whether the keydown listener is attached; it is only needed while the panel is open. */
  keys: boolean;
}

/** The disclosures that are open right now. Every document event walks only this set. */
const open = new Set<SymbolNode>();

/** The wiring of each activated disclosure, looked up without keeping closed panels alive. */
const wired = new WeakMap<SymbolNode, Wiring>();

/** The disclosures open right now, in the order they were activated. */
export function openPanels(): SymbolNode[] {
  return [...open];
}

/**
 * Brings a panel's open set entry and its Escape listener in line with its `open` flag. The keydown
 * listener is attached only while the panel is open, so a page of closed disclosures carries none.
 */
function sync(wiring: Wiring): void {
  const opened = wiring.panel.open;
  if (opened) open.add(wiring.panel);
  else open.delete(wiring.panel);
  if (wiring.keys === opened) return;
  wiring.keys = opened;
  if (opened) wiring.panel.addEventListener("keydown", wiring.keydown);
  else wiring.panel.removeEventListener("keydown", wiring.keydown);
}

/**
 * Closes an open `panel`, forgets it, and focuses its chip when `focusChip` is set. A closed panel is
 * left alone. Focus is never trapped: outside clicks pass `false`, so the clicked element keeps it.
 */
export function closePanel(panel: SymbolNode, focusChip: boolean): void {
  if (!panel.open) return;
  panel.open = false;
  const wiring = wired.get(panel);
  if (wiring === undefined) open.delete(panel);
  else sync(wiring);
  if (focusChip) panel.querySelector(SUMMARY_SELECTOR)?.focus();
}

/**
 * Closes `panel` and focuses its chip when `event` is Escape and the panel is open. Every other key,
 * and Escape on a closed panel, is left to the browser.
 */
export function closeOnEscape(panel: SymbolNode, event: SymbolEvent): void {
  if (event.key !== "Escape" || !panel.open) return;
  event.preventDefault();
  closePanel(panel, true);
}

/**
 * Closes `panel` when a click lands outside it. The chip stays untouched, and a click inside the
 * panel or its chip leaves it open. Focus is not moved: the clicked element keeps it.
 */
export function closeOutside(panel: SymbolNode, target: unknown): void {
  if (!panel.open || panel.contains(target)) return;
  closePanel(panel, false);
}

/**
 * Handles a document click against the open disclosures only: a page with none does no `contains`
 * checks, and one open panel costs one check. Exported so the island's cost is testable without a
 * browser.
 */
export function handleClick(target: unknown): void {
  for (const panel of open) closeOutside(panel, target);
}

/**
 * Wires one disclosure. The native `toggle` event tracks its open state; Escape is heard only while
 * it is open. Returns a cleanup that unwires the panel, for a page that removes it.
 */
export function activate(panel: SymbolNode): () => void {
  const wiring: Wiring = {
    panel,
    keys: false,
    keydown: (event) => closeOnEscape(panel, event),
    toggle: () => sync(wiring),
  };
  wired.set(panel, wiring);
  panel.addEventListener("toggle", wiring.toggle);
  sync(wiring);

  return () => {
    open.delete(panel);
    panel.removeEventListener("toggle", wiring.toggle);
    if (wiring.keys) panel.removeEventListener("keydown", wiring.keydown);
    wiring.keys = false;
    wired.delete(panel);
  };
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
  document.addEventListener("click", (event) => handleClick(event.target));
}
