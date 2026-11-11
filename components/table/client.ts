/* Table scroll island: keeps a wide table keyboard-scrollable and a table that fits free of an extra
 * tab stop and landmark. The server markup is always focusable, so the page still works without this
 * script; here the region is refreshed whenever the table or its container changes size. */

/** Selector for a table's scroll region. It matches `REGION_ATTRIBUTE` in `index.ts`; this module does
 * not import that file because the island build cannot resolve its `preact` import. */
export const REGION_SELECTOR = "[data-table-scroll]";

/** A difference of at most this many CSS pixels is rounding, not overflow. */
export const OVERFLOW_TOLERANCE = 1;

/** The parts of a scroll region the island reads and writes. */
export interface TableElement {
  scrollWidth: number;
  clientWidth: number;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): TableElement | null;
}

/** Everything the island reads from the page, so tests can pass fakes instead of the browser. */
export interface TableEnv {
  /** All scroll regions on the page. */
  regions(): Iterable<TableElement>;
  /** Calls `update` when `target` or its contents change size. */
  watch(target: TableElement, update: () => void): void;
}

/** True when the table is wider than the region, ignoring a subpixel rounding difference. */
export function isOverflowing(region: TableElement): boolean {
  return region.scrollWidth - region.clientWidth > OVERFLOW_TOLERANCE;
}

/** The region's name: the author's `data-label`, else the table's caption. Empty when it has neither. */
export function regionLabel(region: TableElement): string {
  const author = region.getAttribute("data-label")?.trim() ?? "";
  if (author !== "") return author;
  return region.querySelector("caption")?.textContent?.trim() ?? "";
}

/**
 * Applies the region's current overflow state: a table that fits loses its tab stop and landmark, and
 * a wide table gets both back. A table with no caption or author label gets the tab stop but no
 * unnamed `region` landmark. Returns whether the table overflows.
 */
export function sync(region: TableElement): boolean {
  if (!isOverflowing(region)) {
    region.removeAttribute("tabindex");
    region.removeAttribute("role");
    region.removeAttribute("aria-label");
    return false;
  }

  region.setAttribute("tabindex", "0");
  const label = regionLabel(region);
  if (label === "") {
    region.removeAttribute("role");
    region.removeAttribute("aria-label");
  } else {
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", label);
  }
  return true;
}

/**
 * Syncs every region on the page and re-syncs it on resize. The container and the table are both
 * watched: the first changes with the viewport, the second with zoom or a font that reflows the cells.
 */
export function enhance(env: TableEnv): void {
  for (const region of env.regions()) {
    sync(region);
    env.watch(region, () => {
      sync(region);
    });
    const table = region.querySelector("table");
    if (table !== null) {
      env.watch(table, () => {
        sync(region);
      });
    }
  }
}

/** The part of the document the island uses. */
export interface TableDocument {
  querySelectorAll(selector: string): Iterable<TableElement>;
}

/** A `ResizeObserver` constructor, as the browser supplies one. */
type ResizeObserverConstructor = new (callback: () => void) => { observe(target: TableElement): void };

/** The browser's window, only for the `resize` fallback when `ResizeObserver` is missing. */
const win = globalThis as unknown as { addEventListener?(type: "resize", listener: () => void): void };

/** The window resize event still catches a viewport change in browsers without `ResizeObserver`. */
function watcher(Observer: ResizeObserverConstructor | undefined): TableEnv["watch"] {
  return (target, update) => {
    if (Observer === undefined) {
      win.addEventListener?.("resize", update);
      return;
    }
    new Observer(update).observe(target);
  };
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
const globals = globalThis as unknown as { document?: TableDocument; ResizeObserver?: ResizeObserverConstructor };
const doc = globals.document;
if (doc !== undefined) {
  enhance({ regions: () => doc.querySelectorAll(REGION_SELECTOR), watch: watcher(globals.ResizeObserver) });
}
