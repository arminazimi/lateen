/*
 * Footnote popover island: every GFM footnote reference (`[data-footnote-ref]`) shows its note in a
 * small tooltip on pointer contact (mouse, pen, or touch) or focus, and Escape closes it. The
 * reference stays a plain link, so a visitor without JavaScript (or without this island) still
 * reaches the note, and the definition's back-link is never touched.
 */

/** A footnote definition element, as the island reads it. */
export interface FootnoteTarget {
  cloneNode(deep: boolean): FootnoteTarget;
  querySelectorAll(selector: string): ArrayLike<FootnoteBackref>;
  readonly textContent: string | null;
}

/** A back-link inside a definition; it is dropped from the popover's copy, not from the page. */
export interface FootnoteBackref {
  remove(): void;
}

/** The parts of a keyboard event the island reads. */
export interface FootnoteKeyEvent {
  readonly key?: string | undefined;
}

/** The document the island reads: definitions by id and the Escape key. */
export interface FootnoteDocument {
  getElementById(id: string): FootnoteTarget | null;
  addEventListener(type: "keydown", listener: (event: FootnoteKeyEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: FootnoteKeyEvent) => void): void;
}

/** The parent the popover is placed in, beside the reference it describes. */
export interface FootnoteAnchor {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: FootnotePopover): FootnotePopover;
}

/** The interactions that reveal or dismiss a preview; a pointer covers mouse, pen, and touch alike. */
export type FootnoteEventType = "pointerenter" | "pointerleave" | "pointercancel" | "focus" | "blur";

/** One footnote reference, the `<a data-footnote-ref>` inside GFM's `<sup>`. */
export interface FootnoteRef {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  readonly parentNode: FootnoteAnchor | null;
  addEventListener(type: FootnoteEventType, listener: () => void): void;
  removeEventListener(type: FootnoteEventType, listener: () => void): void;
}

/** The tooltip root the layout renders once, hidden until a reference asks for it. */
export interface FootnotePopover {
  hidden: boolean;
  readonly id: string;
  textContent: string | null;
}

/** The id a same-page link points at, or undefined for an external or empty one. */
export function targetId(href: string): string | undefined {
  if (!href.startsWith("#") || href.length < 2) return undefined;
  const raw = href.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The note's text, ready for `textContent`: the target's text without its back-links, copied so the
 * page's own definition (and its back-link) is left exactly as GFM wrote it. Whitespace is
 * collapsed so a multi-line note reads as one sentence in the tooltip.
 */
export function definitionText(doc: FootnoteDocument, href: string): string | undefined {
  const id = targetId(href);
  if (id === undefined) return undefined;
  const target = doc.getElementById(id);
  if (target === null) return undefined;

  const copy = target.cloneNode(true);
  for (const backref of Array.from(copy.querySelectorAll("[data-footnote-backref]"))) backref.remove();
  const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

/**
 * Wires every reference to one popover and returns a cleanup that removes the listeners and puts
 * the page back as it was. Entering a reference with any pointer (mouse, pen, or touch) or focusing
 * it shows its note; leaving it, cancelling the pointer, or blurring hides the note again, and
 * Escape hides it from anywhere. When focus and the pointer sit on different references, the one
 * engaged last stays shown, so no stale note or `aria-describedby` is left behind. The note is
 * copied beside the reference it describes, and the reference keeps its own description alongside
 * the tooltip's. Without a reference nothing is wired. Nothing here calls `preventDefault`, adds a
 * click handler, or takes focus, so a tap or click still navigates to the note, the back-link still
 * returns, and tab order is unchanged.
 */
export function activate(refs: readonly FootnoteRef[], popover: FootnotePopover, doc: FootnoteDocument): () => void {
  if (refs.length === 0) return () => undefined;

  let pointer: FootnoteRef | undefined;
  let focused: FootnoteRef | undefined;
  let active: FootnoteRef | undefined;
  let shown: FootnoteRef | undefined;
  let previousDescription: string | null = null;

  const hide = (): void => {
    if (shown === undefined) return;
    if (previousDescription === null) shown.removeAttribute("aria-describedby");
    else shown.setAttribute("aria-describedby", previousDescription);
    shown = undefined;
    previousDescription = null;
    popover.hidden = true;
    popover.textContent = "";
  };

  /** The reference to preview: the one engaged last, or whichever is still engaged after it leaves. */
  const current = (): FootnoteRef | undefined => {
    if (active !== undefined && (active === pointer || active === focused)) return active;
    return focused ?? pointer;
  };

  /** Points the popover at the current reference, or puts it away when there is none. */
  const sync = (): void => {
    const ref = current();
    const href = ref?.getAttribute("href");
    const text = href == null ? undefined : definitionText(doc, href);
    if (ref === undefined || text === undefined) {
      hide();
      return;
    }

    if (shown !== ref) {
      hide();
      shown = ref;
      previousDescription = ref.getAttribute("aria-describedby");
      if (popover.id !== "") {
        // Keep the reference's own description and add the tooltip to it, never a duplicate id.
        const ids = (previousDescription ?? "").split(/\s+/).filter((id) => id !== "");
        if (!ids.includes(popover.id)) ids.push(popover.id);
        ref.setAttribute("aria-describedby", ids.join(" "));
      }
    }

    const anchor = ref.parentNode;
    if (anchor === null) {
      hide();
      return;
    }
    popover.textContent = text;
    anchor.setAttribute("data-footnote-anchor", "true");
    anchor.appendChild(popover);
    popover.hidden = false;
  };

  /** A reference stopped being hovered or focused; fall back to the other, if any. */
  const release = (ref: FootnoteRef, reason: "pointer" | "focus"): void => {
    if (reason === "pointer") {
      if (pointer === ref) pointer = undefined;
    } else if (focused === ref) {
      focused = undefined;
    }
    if (active === ref) active = focused ?? pointer;
    sync();
  };

  const escape = (event: FootnoteKeyEvent): void => {
    if (event.key !== "Escape") return;
    // Dismiss until the reader engages a reference again; focus itself is never moved.
    pointer = undefined;
    focused = undefined;
    active = undefined;
    hide();
  };

  const listeners: Array<[FootnoteRef, FootnoteEventType, () => void]> = [];
  const attach = (ref: FootnoteRef, type: FootnoteEventType, listener: () => void): void => {
    ref.addEventListener(type, listener);
    listeners.push([ref, type, listener]);
  };

  for (const ref of refs) {
    attach(ref, "pointerenter", () => {
      pointer = ref;
      active = ref;
      sync();
    });
    attach(ref, "pointerleave", () => release(ref, "pointer"));
    attach(ref, "pointercancel", () => release(ref, "pointer"));
    attach(ref, "focus", () => {
      focused = ref;
      active = ref;
      sync();
    });
    attach(ref, "blur", () => release(ref, "focus"));
  }

  doc.addEventListener("keydown", escape);

  return () => {
    for (const [ref, type, listener] of listeners) ref.removeEventListener(type, listener);
    listeners.length = 0;
    doc.removeEventListener("keydown", escape);
    pointer = undefined;
    focused = undefined;
    active = undefined;
    hide();
  };
}

/** The browser globals the island needs, without pulling DOM types into the theme's typecheck. */
const globals = globalThis as unknown as {
  document?: FootnoteDocument & {
    querySelector(selector: string): FootnotePopover | null;
    querySelectorAll(selector: string): ArrayLike<FootnoteRef>;
  };
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const document = globals.document;
  const popover = document.querySelector("[data-footnote-popover]");
  if (popover !== null) activate(Array.from(document.querySelectorAll("[data-footnote-ref]")), popover, document);
}
