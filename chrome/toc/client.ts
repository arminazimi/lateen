/* TOC scrollspy: marks the heading in view in "On this page". IntersectionObserver only, no scroll listeners. */

/** Smallest DOM surface the island touches, so hosts and tests can substitute their own. */
export interface TocElement {
  id: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getBoundingClientRect(): { top: number };
  scrollIntoView(options?: { block?: string; behavior?: string }): void;
}

export interface TocDocument {
  querySelectorAll(selector: string): TocElement[];
  getElementById(id: string): TocElement | null;
}

export interface TocEntry {
  isIntersecting: boolean;
  target: TocElement;
  boundingClientRect: { top: number };
}

export interface TocObserver {
  observe(target: TocElement): void;
  disconnect(): void;
}

export type TocObserverCtor = new (
  callback: (entries: readonly TocEntry[]) => void,
  options?: { rootMargin?: string; threshold?: number },
) => TocObserver;

export type MediaQuery = (query: string) => { matches: boolean };

/** Everything the island reads from the world; tests pass fakes, browsers resolve to globals. */
export interface TocEnv {
  document?: TocDocument;
  IntersectionObserver?: TocObserverCtor;
  matchMedia?: MediaQuery;
}

const LINK_SELECTOR = ".toc a[href^='#'], .toc-fold a[href^='#']";
const REDUCED = "(prefers-reduced-motion: reduce)";
/* The band the observer watches: the top 15% of the viewport. A heading entering it is the one in view. */
const BAND = "0px 0px -85% 0px";

const globals = globalThis as unknown as {
  document?: TocDocument;
  IntersectionObserver?: TocObserverCtor;
  matchMedia?: MediaQuery;
};

/** Marks the heading in view in the table of contents; returns a stop function. */
export default function scrollspy(env: TocEnv = {}): () => void {
  const off = () => {};
  const document = env.document ?? globals.document;
  const Observer = env.IntersectionObserver ?? globals.IntersectionObserver;
  const matchMedia = env.matchMedia ?? globals.matchMedia;
  if (!document || !Observer) return off;

  const byId = new Map<string, TocElement[]>();
  for (const link of document.querySelectorAll(LINK_SELECTOR)) {
    const id = link.getAttribute("href")?.slice(1);
    if (!id) continue;
    const group = byId.get(id) ?? [];
    group.push(link);
    byId.set(id, group);
  }
  if (byId.size === 0) return off;

  const headings: TocElement[] = [];
  for (const id of byId.keys()) {
    const heading = document.getElementById(id);
    if (heading) headings.push(heading);
  }
  if (headings.length === 0) return off;

  const tops = new Map<TocElement, number>();
  const inBand = new Set<string>();
  let active: string | null = null;

  /** True unless a host or the reader asks for reduced motion; without matchMedia, no motion is assumed. */
  const reduced = () => matchMedia?.(REDUCED)?.matches ?? true;

  /** Keeps the active link visible inside the scrolling column; skipped when motion is reduced. */
  const reveal = (link: TocElement) => {
    if (!reduced()) link.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const mark = (id: string | null) => {
    if (id === active) return;
    if (active !== null) {
      for (const link of byId.get(active) ?? []) link.setAttribute("aria-current", "false");
    }
    active = id;
    if (id === null) return;
    const group = byId.get(id);
    if (!group) return;
    for (const link of group) link.setAttribute("aria-current", "true");
    reveal(group[0]!);
  };

  /** The last heading at or above the band: intersecting now, or already scrolled past the viewport top. */
  const current = () => {
    let id: string | null = null;
    for (const heading of headings) {
      const top = tops.get(heading);
      if (inBand.has(heading.id) || (top !== undefined && top <= 0)) id = heading.id;
    }
    return id;
  };

  const observer = new Observer((entries) => {
    for (const entry of entries) {
      tops.set(entry.target, entry.boundingClientRect.top);
      if (entry.isIntersecting) inBand.add(entry.target.id);
      else inBand.delete(entry.target.id);
    }
    mark(current());
  }, { rootMargin: BAND });

  for (const heading of headings) observer.observe(heading);

  return () => observer.disconnect();
}

/** Runs on import in a real browser; hosts without a document or IntersectionObserver stay inert. */
if (globals.document && globals.IntersectionObserver) scrollspy();
