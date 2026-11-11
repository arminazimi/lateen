import assert from "node:assert/strict";
import { test } from "node:test";
import scrollspy, {
  type TocDocument,
  type TocElement,
  type TocEntry,
  type TocEnv,
  type TocScroller,
  type TocViewport,
} from "../chrome/toc/client.ts";

const LINK_SELECTOR = ".toc a[href^='#'], .toc-fold a[href^='#']";
const SCROLLER_SELECTOR = ".toc";
const REDUCED = "(prefers-reduced-motion: reduce)";

class FakeElement implements TocElement {
  id: string;
  readonly attrs = new Map<string, string>();
  /** Scrolls the real anchor would cause on its ancestors and the document; the spy must cause none. */
  readonly documentScrolls: { block?: string; behavior?: string }[] = [];
  top: number;
  height: number;

  constructor(id: string, top = 2000, height = 20) {
    this.id = id;
    this.top = top;
    this.height = height;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getBoundingClientRect(): { top: number; bottom: number; height: number } {
    return { top: this.top, bottom: this.top + this.height, height: this.height };
  }

  scrollIntoView(options?: { block?: string; behavior?: string }): void {
    this.documentScrolls.push(options ?? {});
  }
}

/** The sticky TOC column: it has its own scroll offset and never relays a scroll to the document. */
class FakeScroller implements TocScroller {
  readonly links: TocElement[] = [];
  readonly scrolls: { top: number; behavior?: string }[] = [];
  scrollTop = 0;
  top = 0;
  height = 300;

  getBoundingClientRect(): { top: number; bottom: number; height: number } {
    return { top: this.top, bottom: this.top + this.height, height: this.height };
  }

  contains(element: TocElement): boolean {
    return this.links.includes(element);
  }

  scrollTo(options: { top: number; behavior?: string }): void {
    this.scrolls.push(options);
    this.scrollTop = options.top;
  }
}

/** A link to a heading, as the TOC renders one in the aside and again in the fold. */
function linkTo(heading: string): FakeElement {
  const link = new FakeElement(`link-${heading}`);
  link.attrs.set("href", `#${heading}`);
  return link;
}

class FakeDocument implements TocDocument {
  readonly queries: string[] = [];
  readonly scrollerQueries: string[] = [];
  readonly ids: Map<string, FakeElement>;
  links: FakeElement[];
  scroller: FakeScroller | null;
  location: { hash: string };
  documentElement: { scrollHeight: number };

  constructor(
    links: FakeElement[],
    headings: FakeElement[],
    scroller: FakeScroller | null,
    hash = "",
    scrollHeight = 10000,
  ) {
    this.links = links;
    this.ids = new Map(headings.map((heading) => [heading.id, heading]));
    this.scroller = scroller;
    this.location = { hash };
    this.documentElement = { scrollHeight };
  }

  querySelectorAll(selector: string): FakeElement[] {
    this.queries.push(selector);
    return this.links;
  }

  querySelector(selector: string): TocScroller | null {
    this.scrollerQueries.push(selector);
    return this.scroller;
  }

  getElementById(id: string): FakeElement | null {
    return this.ids.get(id) ?? null;
  }
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly observed: TocElement[] = [];
  disconnected = false;
  callback: (entries: readonly TocEntry[]) => void;
  options?: { rootMargin?: string; threshold?: number } | undefined;

  constructor(
    callback: (entries: readonly TocEntry[]) => void,
    options?: { rootMargin?: string; threshold?: number },
  ) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }

  observe(target: TocElement): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  /** The browser reports a heading's position and whether it is inside the band. */
  see(target: FakeElement, top: number, intersecting: boolean): void {
    this.callback([{ isIntersecting: intersecting, target, boundingClientRect: { top } }]);
  }
}

interface SpyOptions {
  reduced?: boolean;
  hash?: string;
  scroller?: FakeScroller | null;
  viewport?: TocViewport;
}

const LONG_PAGE: TocViewport = { scrollY: 0, innerHeight: 800, scrollHeight: 10000 };

/** A scrollspy over a page with the given headings, each linked from the aside and the fold. */
function spy(ids: string[], options: SpyOptions = {}) {
  const headings = ids.map((id) => new FakeElement(id));
  const aside = ids.map((id, index) => {
    const link = linkTo(id);
    // Visible inside the column by default; tests move one link to force a reveal.
    link.top = 10 + index * 30;
    return link;
  });
  const fold = ids.map(linkTo);
  const links = [...aside, ...fold];
  const scroller = options.scroller === undefined ? new FakeScroller() : options.scroller;
  scroller?.links.push(...aside);
  const viewport = options.viewport ?? LONG_PAGE;
  const doc = new FakeDocument(links, headings, scroller, options.hash ?? "", viewport.scrollHeight);
  FakeObserver.instances = [];
  const env: TocEnv = {
    document: doc,
    IntersectionObserver: FakeObserver,
    matchMedia: (query) => ({ matches: query === REDUCED && options.reduced === true }),
    viewport: () => viewport,
  };
  return {
    doc,
    env,
    scroller,
    stop: scrollspy(env),
    links,
    aside,
    fold,
    observer: FakeObserver.instances.at(-1)!,
    heading: (id: string) => headings.find((heading) => heading.id === id)!,
    link: (id: string) => links.filter((link) => link.getAttribute("href") === `#${id}`),
  };
}

/** The scrollspy must reveal links by scrolling the column, never by scrolling their ancestors. */
function assertDocumentUnscrolled(links: readonly FakeElement[]): void {
  for (const link of links) assert.deepEqual(link.documentScrolls, [], `document scrolled for ${link.getAttribute("href")}`);
}

test("asks the document for both TOC link sets and the scrolling column, then observes each heading once", () => {
  const { doc, observer } = spy(["pick", "gem", "build"]);
  assert.deepEqual(doc.queries, [LINK_SELECTOR]);
  assert.deepEqual(doc.scrollerQueries, [SCROLLER_SELECTOR]);
  assert.deepEqual(
    observer.observed.map((heading) => heading.id),
    ["pick", "gem", "build"],
  );
});

test("selects the first heading on arrival and marks every copy of its link", () => {
  const { link } = spy(["pick", "gem"]);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);
});

test("moves the mark as the reader scrolls, keeping the aside and fold copies synchronized", () => {
  const { observer, heading, link } = spy(["pick", "gem"]);

  // "pick" reaches the band under the viewport top: marked in both containers.
  observer.see(heading("pick"), 120, true);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);

  // "gem" enters the band while "pick" is still visible: the later heading wins.
  observer.see(heading("gem"), 110, true);
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "false");

  // Scrolling back up, "pick" comes back and "gem" leaves the band.
  observer.see(heading("gem"), -50, true);
  observer.see(heading("pick"), -45, true);
  observer.see(heading("gem"), 130, false);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "false");

  // Above the first heading after an update, the first heading stays the deterministic mark.
  observer.see(heading("pick"), 130, false);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "false");
});

test("keeps the last heading marked across a gap between long sections", () => {
  const { observer, heading, link } = spy(["pick", "gem"]);
  observer.see(heading("pick"), 120, true);
  observer.see(heading("pick"), -300, false);
  observer.see(heading("gem"), 900, false);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);
});

test("resolves a deep link before the first observation and decodes its fragment", () => {
  const { link, observer, heading } = spy(["pick", "gem"], { hash: "#gem" });
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), null);

  // The observer still takes over afterwards.
  observer.see(heading("pick"), 120, true);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "false");

  const encoded = spy(["café", "tea"], { hash: "#caf%C3%A9" });
  for (const l of encoded.link("café")) assert.equal(l.getAttribute("aria-current"), "true");
});

test("ignores a fragment that names no TOC entry and falls back to the first heading", () => {
  const { link } = spy(["pick", "gem"], { hash: "#ghost" });
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);
});

test("a short page selects the first heading even when every heading is below the band", () => {
  const { observer, heading, link } = spy(["pick", "gem"], {
    viewport: { scrollY: 0, innerHeight: 800, scrollHeight: 600 },
  });
  observer.see(heading("pick"), 200, false);
  observer.see(heading("gem"), 400, false);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);
});

test("the page bottom selects the final heading even when it never reaches the band", () => {
  const viewport: TocViewport = { scrollY: 0, innerHeight: 800, scrollHeight: 1700 };
  const { observer, heading, link } = spy(["pick", "gem", "build"], { viewport });
  observer.see(heading("pick"), 120, true);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");

  viewport.scrollY = 900; // the page cannot scroll further
  observer.see(heading("build"), 350, false);
  for (const l of link("build")) assert.equal(l.getAttribute("aria-current"), "true");
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "false");
});

test("reveals the active link by scrolling the TOC column only, and only once per activation", () => {
  const { observer, heading, link, fold, scroller } = spy(["pick", "gem", "build"]);
  const gem = link("gem")[0]!;
  gem.top = 400; // below the 300px column viewport

  observer.see(heading("gem"), 120, true);
  assert.deepEqual(scroller!.scrolls, [{ top: 120, behavior: "smooth" }]);
  assert.equal(scroller!.scrollTop, 120);
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), "true");

  // Re-observing the active heading does not scroll the column again.
  observer.see(heading("gem"), 125, true);
  assert.equal(scroller!.scrolls.length, 1);

  // Scrolling back up to a link above the column scrolls the column up, still inside it.
  observer.see(heading("build"), 110, true);
  const pick = link("pick")[0]!;
  pick.top = -20;
  observer.see(heading("gem"), 500, false);
  observer.see(heading("build"), 400, false);
  const pick2 = link("pick")[0]!;
  assert.equal(pick2.getAttribute("aria-current"), "true");
  assert.deepEqual(fold[0]!.documentScrolls, []);
  assert.deepEqual(scroller!.scrolls.at(-1), { top: 100, behavior: "smooth" });
  assertDocumentUnscrolled([...link("pick"), ...link("gem"), ...link("build")]);
});

test("reduced motion jumps the TOC column instead of smooth scrolling", () => {
  const { observer, heading, link, scroller } = spy(["pick", "gem"], { reduced: true });
  link("gem")[0]!.top = 400;

  observer.see(heading("gem"), 120, true);
  assert.deepEqual(scroller!.scrolls, [{ top: 120, behavior: "auto" }]);
  assertDocumentUnscrolled([...link("pick"), ...link("gem")]);
});

test("assumes reduced motion when the host has no matchMedia", () => {
  const headings = [new FakeElement("pick"), new FakeElement("gem")];
  const aside = [linkTo("pick"), linkTo("gem")];
  aside[0]!.top = 10;
  aside[1]!.top = 400;
  const fold = [linkTo("pick"), linkTo("gem")];
  const scroller = new FakeScroller();
  scroller.links.push(...aside);
  const doc = new FakeDocument([...aside, ...fold], headings, scroller);
  FakeObserver.instances = [];
  scrollspy({
    document: doc,
    IntersectionObserver: FakeObserver,
    viewport: () => LONG_PAGE,
  });
  FakeObserver.instances.at(-1)!.see(headings[1]!, 120, true);
  assert.deepEqual(scroller.scrolls, [{ top: 120, behavior: "auto" }]);
});

test("marks without scrolling when the TOC column is hidden or absent", () => {
  const hidden = new FakeScroller();
  hidden.height = 0;
  const hiddenSpy = spy(["pick", "gem"], { scroller: hidden });
  hiddenSpy.link("gem")[0]!.top = 400;
  hiddenSpy.observer.see(hiddenSpy.heading("gem"), 120, true);
  for (const l of hiddenSpy.link("gem")) assert.equal(l.getAttribute("aria-current"), "true");
  assert.deepEqual(hidden.scrolls, []);

  const absent = spy(["pick", "gem"], { scroller: null });
  assert.equal(absent.scroller, null);
  absent.observer.see(absent.heading("gem"), 120, true);
  for (const l of absent.link("gem")) assert.equal(l.getAttribute("aria-current"), "true");
  assertDocumentUnscrolled(absent.links);
});

test("stays inert without IntersectionObserver and leaves the anchors usable", () => {
  const links = [linkTo("pick")];
  const scroller = new FakeScroller();
  scroller.links.push(links[0]!);
  const doc = new FakeDocument(links, [new FakeElement("pick")], scroller);
  FakeObserver.instances = [];

  const noObserver = scrollspy({ document: doc });
  assert.equal(typeof noObserver, "function");
  noObserver();

  assert.equal(FakeObserver.instances.length, 0);
  assert.deepEqual(scroller.scrolls, []);
  for (const link of links) {
    assert.equal(link.getAttribute("href"), "#pick");
    assert.equal(link.getAttribute("aria-current"), null);
  }
  assertDocumentUnscrolled(links);
});

test("stays inert without a document or without TOC links", () => {
  FakeObserver.instances = [];
  scrollspy({ IntersectionObserver: FakeObserver })();
  assert.equal(FakeObserver.instances.length, 0);

  const empty = scrollspy({
    document: new FakeDocument([], [], new FakeScroller()),
    IntersectionObserver: FakeObserver,
  });
  empty();
  assert.equal(FakeObserver.instances.length, 0);
});

test("ignores TOC links whose heading is missing from the page", () => {
  const links = [linkTo("ghost")];
  const doc = new FakeDocument(links, [], new FakeScroller());
  FakeObserver.instances = [];
  scrollspy({ document: doc, IntersectionObserver: FakeObserver });
  assert.equal(FakeObserver.instances.length, 0);
  for (const l of links) assert.equal(l.getAttribute("aria-current"), null);
});

test("stop disconnects the observer and ignores queued entries", () => {
  const { observer, heading, link, stop } = spy(["pick", "gem"]);
  stop();
  assert.equal(observer.disconnected, true);

  observer.see(heading("gem"), 120, true);
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "true");
});
