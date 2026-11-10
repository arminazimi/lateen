/*
 * Footnote popover island: every GFM footnote reference (`[data-footnote-ref]`) shows its note in a
 * small tooltip on hover or focus, and Escape closes it. The reference stays a plain link, so a
 * visitor without JavaScript (or without this island) still reaches the note, and the definition's
 * back-link is never touched.
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
}

/** The parent the popover is placed in, beside the reference it describes. */
export interface FootnoteAnchor {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  appendChild(child: FootnotePopover): FootnotePopover;
}

/** One footnote reference, the `<a data-footnote-ref>` inside GFM's `<sup>`. */
export interface FootnoteRef {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  readonly parentNode: FootnoteAnchor | null;
  addEventListener(type: "mouseenter" | "mouseleave" | "focus" | "blur", listener: () => void): void;
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
 * Wires every reference to the popover and returns whether anything was wired. With no reference it
 * does nothing, so a page without footnotes loads no listeners. Hover and focus both show the note,
 * leaving the reference hides it, and Escape hides it from anywhere in the document. Nothing here
 * calls `preventDefault`: a click still follows the reference to the definition, and the caller can
 * keep tabbing, since the popover takes no focus and traps none.
 */
export function activate(refs: readonly FootnoteRef[], popover: FootnotePopover, doc: FootnoteDocument): boolean {
  if (refs.length === 0) return false;

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

  const show = (ref: FootnoteRef): void => {
    const href = ref.getAttribute("href");
    if (href === null) return;
    const text = definitionText(doc, href);
    if (text === undefined) return;
    const anchor = ref.parentNode;
    if (anchor === null) return;

    if (shown !== ref) {
      hide();
      previousDescription = ref.getAttribute("aria-describedby");
      if (popover.id !== "") ref.setAttribute("aria-describedby", popover.id);
    }
    popover.textContent = text;
    anchor.setAttribute("data-footnote-anchor", "true");
    anchor.appendChild(popover);
    popover.hidden = false;
    shown = ref;
  };

  for (const ref of refs) {
    ref.addEventListener("mouseenter", () => show(ref));
    ref.addEventListener("mouseleave", hide);
    ref.addEventListener("focus", () => show(ref));
    ref.addEventListener("blur", hide);
  }

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  return true;
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
