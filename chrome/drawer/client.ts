/* Mobile drawer: opens the sidebar dialog from the header's menu button, traps focus in it, closes it on Escape, a backdrop press, a navigation link, or the viewport reaching the desktop layout. */

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

/** A click on a drawer link as the drawer reads it; a modified or cancelled click is left to the browser. */
export interface DrawerClickEvent extends DrawerEvent {
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly defaultPrevented?: boolean;
  readonly button?: number;
}

/** A navigation link inside the drawer, as the drawer reads it. `href` is the browser-resolved absolute URL. */
export interface DrawerLink extends DrawerFocusable {
  readonly href: string;
  addEventListener(type: "click", listener: (event: DrawerClickEvent) => void): void;
}

/** The page element a same-page drawer link leads to. */
export interface DrawerTarget {
  scrollIntoView(): void;
  focus(): void;
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

/** Everything the drawer reads from the world; the browser passes its viewport and page, tests a fake. */
export interface DrawerEnv {
  readonly viewport?: DrawerViewport | undefined;
  /** The address of the page the drawer is on, used to recognise a link that stays on it. The browser passes `location.href`. */
  readonly location?: { readonly href: string } | undefined;
  /** Finds the element a same-page fragment leads to; the browser looks it up by id. */
  readonly locate?: (fragment: string) => DrawerTarget | undefined;
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

/** The drawer's navigation links, as `activate` wires them. */
const LINK_SELECTOR = "a[href]";

// The island runs in a browser; the theme's tsconfig has no DOM lib, so these are the globals it needs.
declare const document: {
  querySelector(selector: string): unknown;
  getElementById(id: string): unknown;
};
declare const matchMedia: (query: string) => DrawerViewport;
declare const location: { readonly href: string };

/** The link's fragment, without its leading `#`, or null when the link does not address one. */
function fragmentOf(href: string): string | null {
  const at = href.indexOf("#");
  return at === -1 ? null : href.slice(at + 1);
}

/** Whether the resolved URL stays on the current page: the same address once the fragments are set aside. */
function staysOnPage(href: string, currentHref: string): boolean {
  const cut = (url: string): string => {
    const at = url.indexOf("#");
    return at === -1 ? url : url.slice(0, at);
  };
  return cut(href) === cut(currentHref);
}

/** The fake dialogs hand back every focusable, so a link is only a control that carries an `href` it can hear clicks on. */
function asLink(item: DrawerFocusable): DrawerLink | undefined {
  const candidate = item as Partial<DrawerLink>;
  if (typeof candidate.href === "string" && candidate.href !== "" && typeof candidate.addEventListener === "function") {
    return candidate as DrawerLink;
  }
  return undefined;
}

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

/** Reveals the drawer's controls and wires them: the menu button opens, the close button, Escape, a backdrop press, and an ordinary navigation-link click close, and Tab stays inside. */
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

  // Closing by any route (close button, Escape, backdrop, navigation link, viewport change) ends here, so the menu
  // button always reports the state and takes focus back while it is on screen.
  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
    returnFocus = true;
  });

  // A chosen navigation link closes the drawer itself before the destination is revealed; the click is
  // never cancelled, so page, external, download, and modified activations keep the browser's own behavior.
  const closeForNavigation = (link: DrawerLink): void => {
    const fragment = fragmentOf(link.href);
    const destination =
      fragment !== null && env.location !== undefined && staysOnPage(link.href, env.location.href)
        ? env.locate?.(fragment)
        : undefined;
    if (destination !== undefined) returnFocus = false; // the destination takes focus, not the hidden menu button
    dialog.close();
    if (destination !== undefined) {
      destination.scrollIntoView();
      destination.focus();
    }
  };

  for (const item of dialog.querySelectorAll(LINK_SELECTOR)) {
    const link = asLink(item);
    if (link === undefined) continue;
    link.addEventListener("click", (event) => {
      if (event.ctrlKey === true || event.metaKey === true || event.shiftKey === true || event.altKey === true) return;
      if (event.defaultPrevented === true) return;
      if (event.button !== undefined && event.button !== 0) return;
      closeForNavigation(link);
    });
  }

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

    // The element a same-page link leads to; a heading takes focus like a control once the drawer has closed.
    type RawTarget = { scrollIntoView(): void; focus(): void; setAttribute(name: string, value: string): void };
    const locate = (fragment: string): DrawerTarget | undefined => {
      let id = fragment;
      try {
        id = decodeURIComponent(fragment);
      } catch {
        // An unescaped fragment is rare, and the raw id is the best chance of finding its target.
      }
      const element = document.getElementById(id) as RawTarget | null;
      if (element === null) return undefined;
      return {
        scrollIntoView: () => element.scrollIntoView(),
        focus: () => {
          element.setAttribute("tabindex", "-1");
          element.focus();
        },
      };
    };

    activate(
      {
        dialog: dialog as DrawerDialog,
        button: button as DrawerControl,
        ...(closeButton ? { closeButton: closeButton as DrawerControl } : {}),
      },
      { viewport: matchMedia(DESKTOP_QUERY), location, locate },
    );
  }
}
