/*
 * Skip-link focus: after a reader activates a skip link, the page scrolls to the fragment and moves
 * focus there, so the next Tab continues from the destination instead of the header. The links stay
 * ordinary anchors: nothing calls `preventDefault`, and nothing listens to load or `hashchange`, so a
 * page without this island keeps plain fragment navigation and an unrelated hash change never moves
 * focus.
 *
 * The module is pure: `activate` takes the links and a document-like environment, so tests need no
 * browser. The island wires it to the page's `.skip-link` anchors.
 */

/** A skip link, as the island reads it. */
export interface SkipLink {
  getAttribute(name: string): string | null;
  addEventListener(type: "click", listener: (event: SkipClickEvent) => void): void;
}

/** A click as the island reads it; a handler that already took it leaves it alone. */
export interface SkipClickEvent {
  readonly defaultPrevented?: boolean | undefined;
}

/** One fragment target, as the island touches it. */
export interface SkipTarget {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  focus(): void;
  addEventListener(type: "blur", listener: () => void): void;
  removeEventListener(type: "blur", listener: () => void): void;
}

/** The document the island reads: the element that holds focus, and targets by id. */
export interface SkipDocument {
  readonly activeElement: unknown;
  getElementById(id: string): SkipTarget | null;
}

/** The target made focusable for this visit, and the attributes to put back when focus leaves it. */
let temporary: { readonly target: SkipTarget; readonly previous: string | null; readonly onBlur: () => void } | null = null;

/** Undo any temporary focusability: the target goes back to exactly the attributes it had. */
export function release(): void {
  if (temporary === null) return;
  const { target, previous, onBlur } = temporary;
  temporary = null;
  target.removeEventListener("blur", onBlur);
  if (previous === null) target.removeAttribute("tabindex");
  else target.setAttribute("tabindex", previous);
}

/**
 * Move focus to a fragment target. An element that is already focusable keeps its own attributes and
 * takes focus as it is. Any other element gets `tabindex="-1"` only while focus stays inside it, then
 * the attribute is removed again on blur, so the page's markup returns to what the server sent. A
 * target whose `focus` is missing or throws leaves the link's ordinary navigation alone.
 */
export function focusTarget(target: SkipTarget, doc: SkipDocument): boolean {
  try {
    target.focus();
  } catch {
    return false;
  }

  // Focus left an earlier destination, so its temporary attribute is no longer needed.
  if (temporary !== null && temporary.target !== target) release();
  if (doc.activeElement === target) return true;

  // Repeated activation of the same unfocusable target: it is focusable already, so focus again.
  if (temporary !== null && temporary.target === target) {
    try {
      target.focus();
    } catch {
      return false;
    }
    return doc.activeElement === target;
  }

  const previous = target.getAttribute("tabindex");
  const onBlur = (): void => release();
  temporary = { target, previous, onBlur };
  target.setAttribute("tabindex", previous ?? "-1");
  target.addEventListener("blur", onBlur);
  try {
    target.focus();
  } catch {
    release();
    return false;
  }
  return doc.activeElement === target;
}

/** The id a same-page fragment names, or undefined for an external or empty href. */
export function fragmentId(href: string): string | undefined {
  if (!href.startsWith("#") || href.length < 2) return undefined;
  return href.slice(1);
}

/**
 * Wire every skip link to focus its fragment target on activation. Returns how many links were wired.
 * A link with an external or empty href, a missing target, or a handler that already took the click
 * keeps its ordinary behaviour: the browser still follows the fragment.
 */
export function activate(links: Iterable<SkipLink>, doc: SkipDocument): number {
  let wired = 0;
  for (const link of links) {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented === true) return;
      const href = link.getAttribute("href");
      if (href === null) return;
      const id = fragmentId(href);
      if (id === undefined) return;
      const target = doc.getElementById(id);
      if (target === null) return;
      focusTarget(target, doc);
    });
    wired += 1;
  }
  return wired;
}

/** The browser globals the island needs, without pulling DOM types into the theme's typecheck. */
const globals = globalThis as unknown as {
  document?: SkipDocument & { querySelectorAll(selector: string): ArrayLike<SkipLink> };
};

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const document = globals.document;
  activate(Array.from(document.querySelectorAll(".skip-link")), document);
}
