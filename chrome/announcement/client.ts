/** The prefix of the key a dismissal is stored under: `slipway-announcement:<id>`. */
export const STORAGE_PREFIX = "slipway-announcement:";

/** The selector of the dismiss button inside the bar. */
export const DISMISS_SELECTOR = "[data-announcement-dismiss]";

/** The storage key for one announcement id. */
export function storageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

/** The parts of `Storage` the bar uses, so tests can pass plain objects. */
export interface AnnouncementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The dismiss button as the script touches it. */
export interface AnnouncementDismiss {
  hidden: boolean;
  addEventListener(type: string, listener: () => void): void;
}

/** The bar root as the script touches it. */
export interface AnnouncementBar {
  hidden: boolean;
  getAttribute(name: string): string | null;
  querySelector(selector: string): AnnouncementDismiss | null;
}

/** The stored value that means dismissed; anything else, or no value, keeps the bar visible. */
const DISMISSED = "true";

/** Whether this announcement was dismissed on an earlier visit. Storage may throw (private mode), which reads as not dismissed. */
export function isDismissed(storage: AnnouncementStorage, id: string): boolean {
  try {
    return storage.getItem(storageKey(id)) === DISMISSED;
  } catch {
    return false;
  }
}

/** Remember a dismissal for this announcement only. Storage may throw (private mode); the bar still hides for this view. */
export function remember(storage: AnnouncementStorage, id: string): void {
  try {
    storage.setItem(storageKey(id), DISMISSED);
  } catch {
    /* storage is unavailable: hide the bar without remembering it */
  }
}

/**
 * Reveal the dismiss button and wire it. A bar dismissed on an earlier visit is hidden once this runs; the server
 * cannot read storage, so on that visit the bar shows until the island loads (see README.md).
 */
export function activate(bar: AnnouncementBar, storage: AnnouncementStorage, id: string): void {
  if (isDismissed(storage, id)) {
    bar.hidden = true;
    return;
  }

  const button = bar.querySelector(DISMISS_SELECTOR);
  if (button === null) return;
  button.hidden = false;
  button.addEventListener("click", () => {
    bar.hidden = true;
    remember(storage, id);
  });
}

// The theme's tsconfig has no DOM lib; these are the browser globals the bar needs, no more.
declare const document: { querySelector(selector: string): AnnouncementBar | null };
declare const localStorage: AnnouncementStorage;

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const bar = document.querySelector("[data-announcement]");
  if (bar) activate(bar, localStorage, bar.getAttribute("data-announcement-id") ?? "announcement");
}
