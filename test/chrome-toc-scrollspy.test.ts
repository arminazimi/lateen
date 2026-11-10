import assert from "node:assert/strict";
import { test } from "node:test";
import scrollspy, {
  type TocDocument,
  type TocElement,
  type TocEntry,
  type TocEnv,
} from "../chrome/toc/client.ts";

const LINK_SELECTOR = ".toc a[href^='#'], .toc-fold a[href^='#']";
const REDUCED = "(prefers-reduced-motion: reduce)";

class FakeElement implements TocElement {
  id: string;
  readonly attrs = new Map<string, string>();
  readonly scrolled: { block?: string; behavior?: string }[] = [];
  top: number;

  constructor(id: string, top = 2000) {
    this.id = id;
    this.top = top;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getBoundingClientRect(): { top: number } {
    return { top: this.top };
  }

  scrollIntoView(options?: { block?: string; behavior?: string }): void {
    if (options) this.scrolled.push(options);
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
  readonly ids: Map<string, FakeElement>;
  links: FakeElement[];

  constructor(links: FakeElement[], headings: FakeElement[]) {
    this.links = links;
    this.ids = new Map(headings.map((heading) => [heading.id, heading]));
  }

  querySelectorAll(selector: string): FakeElement[] {
    this.queries.push(selector);
    return this.links;
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

/** A scrollspy over a page with the given headings, each linked from the aside and the fold. */
function spy(ids: string[], options: { reduced?: boolean } = {}) {
  const headings = ids.map((id) => new FakeElement(id));
  const links = [...ids.map(linkTo), ...ids.map(linkTo)];
  const doc = new FakeDocument(links, headings);
  FakeObserver.instances = [];
  const env: TocEnv = {
    document: doc,
    IntersectionObserver: FakeObserver,
    matchMedia: (query) => ({ matches: query === REDUCED && options.reduced === true }),
  };
  return {
    doc,
    env,
    stop: scrollspy(env),
    links,
    observer: FakeObserver.instances.at(-1)!,
    heading: (id: string) => headings.find((heading) => heading.id === id)!,
    link: (id: string) => links.filter((link) => link.getAttribute("href") === `#${id}`),
  };
}

test("asks the document for TOC links in both containers and observes each heading once", () => {
  const { doc, observer } = spy(["pick", "gem", "build"]);
  assert.deepEqual(doc.queries, [LINK_SELECTOR]);
  assert.deepEqual(
    observer.observed.map((heading) => heading.id),
    ["pick", "gem", "build"],
  );
});

test("marks the heading in view in the aside and the fold, and moves the mark as the reader scrolls", () => {
  const { observer, heading, link } = spy(["pick", "gem"]);

  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), null);
  for (const l of link("gem")) assert.equal(l.getAttribute("aria-current"), null);

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

  // Back above the first heading, with no heading in the band: the mark clears.
  observer.see(heading("pick"), 130, false);
  for (const l of link("pick")) assert.equal(l.getAttribute("aria-current"), "false");
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

test("keeps the active link in view with a minimal smooth scroll, once per activation", () => {
  const { observer, heading, link } = spy(["pick", "gem"]);
  observer.see(heading("pick"), 120, true);
  observer.see(heading("gem"), 110, true);
  observer.see(heading("pick"), -40, false);
  // Only the visible column's link (the aside's, which comes first) is scrolled.
  for (const id of ["pick", "gem"]) {
    assert.deepEqual(link(id)[0]!.scrolled, [{ block: "nearest", behavior: "smooth" }]);
    assert.deepEqual(link(id)[1]!.scrolled, []);
  }
});

test("respects prefers-reduced-motion: marks without scrolling", () => {
  const { observer, heading, link } = spy(["pick", "gem"], { reduced: true });
  observer.see(heading("pick"), 120, true);
  observer.see(heading("gem"), 110, true);
  for (const l of link("pick")) assert.deepEqual(l.scrolled, []);
  for (const l of link("gem")) assert.deepEqual(l.scrolled, []);
});

test("assumes reduced motion when the host has no matchMedia", () => {
  const headings = [new FakeElement("pick")];
  const links = [linkTo("pick")];
  const doc = new FakeDocument(links, headings);
  FakeObserver.instances = [];
  scrollspy({ document: doc, IntersectionObserver: FakeObserver });
  FakeObserver.instances.at(-1)!.see(headings[0]!, 120, true);
  assert.deepEqual(links[0]!.scrolled, []);
});

test("stays inert without a TOC, without IntersectionObserver, or without a document", () => {
  FakeObserver.instances = [];
  const alone = scrollspy({ document: new FakeDocument([], []) });
  assert.equal(typeof alone, "function");
  alone();

  const links = [linkTo("pick")];
  const headings = [new FakeElement("pick")];
  const noObserver = scrollspy({ document: new FakeDocument(links, headings) });
  noObserver();
  for (const l of links) assert.equal(l.getAttribute("aria-current"), null);

  const noDocument = scrollspy({ IntersectionObserver: FakeObserver });
  noDocument();
  assert.equal(FakeObserver.instances.length, 0);
});

test("ignores TOC links whose heading is missing from the page", () => {
  const links = [linkTo("ghost")];
  const doc = new FakeDocument(links, []);
  FakeObserver.instances = [];
  scrollspy({ document: doc, IntersectionObserver: FakeObserver });
  assert.equal(FakeObserver.instances.length, 0);
  for (const l of links) assert.equal(l.getAttribute("aria-current"), null);
});

test("stop disconnects the observer", () => {
  const { observer, stop } = spy(["pick"]);
  stop();
  assert.equal(observer.disconnected, true);
});
