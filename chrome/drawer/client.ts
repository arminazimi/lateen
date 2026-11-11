/* Mobile drawer: opens the sidebar dialog from the header's menu button, traps focus in it, closes it on Escape or a backdrop press, and closes it when the viewport reaches the desktop layout. */

/** A control the drawer reveals, clicks, or returns focus to. */
export interface DrawerControl {
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void): void;
  focus(): void;
}

/** Anything inside the drawer that can take focus. */
export interface DrawerFocusable {
  focus(): void;
}

/** A keyboard or dialog event as the drawer reads it. */
export interface DrawerEvent {
  key?: string;
  shiftKey?: boolean;
  target: unknown;
  preventDefault(): void;
}

/** The `<dialog>` element as the script touches it. */
export interface DrawerDialog {
  readonly open: boolean;
  setAttribute(name: string, value: string): void;
  showModal(): void;
  close(): void;
  querySelectorAll(selector: string): Iterable<DrawerFocusable>;
  addEventListener(type: string, listener: (event: DrawerEvent) => void): void;
}

/** The elements the drawer wires together. */
export interface DrawerParts {
  dialog: DrawerDialog;
  /** The header's menu button: it opens the drawer, and takes focus back when the drawer closes. */
  button: DrawerControl;
  /** The drawer's own close button, when the drawer renders one. */
  closeButton?: DrawerControl;
}

/** The viewport width at which the header's menu button leaves, matching `chrome/drawer/style.css`. */
export const DESKTOP_QUERY = "(min-width: 768px)";

/** The viewport state the drawer follows: the reader zooming or turning the phone changes it. */
export interface DrawerViewport {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

/** Everything the drawer reads from the world; the browser passes its viewport, tests a fake. */
export interface DrawerEnv {
  readonly viewport?: DrawerViewport | undefined;
}

/** What can take keyboard focus inside the drawer. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

// The island runs in a browser; the theme's tsconfig has no DOM lib, so these are the globals it needs.
declare const document: { querySelector(selector: string): unknown };
declare const matchMedia: (query: string) => DrawerViewport;

/**
 * Keeps Tab and Shift+Tab inside the drawer: past the last control focus wraps to the first, and before the
 * first it wraps to the last. A focus that has left the drawer returns to its first control.
 */
export function trap(dialog: DrawerDialog, event: DrawerEvent): void {
  if (event.key !== "Tab") return;
  const items = [...dialog.querySelectorAll(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const inside = items.includes(event.target as DrawerFocusable);
  if (event.shiftKey && (!inside || event.target === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || event.target === last)) {
    event.preventDefault();
    first.focus();
  }
}

/** Reveals the drawer's controls and wires them: the menu button opens, the close button, Escape, and a backdrop press close, and Tab stays inside. */
export function activate({ dialog, button, closeButton }: DrawerParts, env: DrawerEnv = {}): void {
  dialog.setAttribute("data-enhanced", "");
  button.hidden = false;
  if (closeButton !== undefined) closeButton.hidden = false;

  // The menu button is hidden on wide screens, so a close from a viewport change must not send focus to it.
  let returnFocus = true;

  button.addEventListener("click", () => {
    returnFocus = true;
    if (!dialog.open) dialog.showModal();
    button.setAttribute("aria-expanded", "true");
  });
  closeButton?.addEventListener("click", () => dialog.close());

  // Closing by any route (close button, Escape, backdrop, viewport change) ends here, so the menu
  // button always reports the state and takes focus back while it is on screen.
  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
    returnFocus = true;
  });

  // A press on the modal backdrop lands on the dialog itself; a press on the drawer's content does not.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const viewport = env.viewport;
  viewport?.addEventListener("change", () => {
    if (viewport.matches !== true || !dialog.open) return;
    returnFocus = false;
    dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
      return;
    }
    trap(dialog, event);
  });
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  const dialog = document.querySelector("[data-drawer]");
  const button = document.querySelector("[data-drawer-open]");
  if (dialog && button) {
    const closeButton = document.querySelector("[data-drawer] [data-drawer-close]");
    activate(
      {
        dialog: dialog as DrawerDialog,
        button: button as DrawerControl,
        ...(closeButton ? { closeButton: closeButton as DrawerControl } : {}),
      },
      { viewport: matchMedia(DESKTOP_QUERY) },
    );
  }
}
