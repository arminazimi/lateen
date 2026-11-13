import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { JSDOM } from "jsdom";
import { renderToString } from "preact-render-to-string";
import symbolPopover, {
  CHIP_CLASS,
  copyValueOf,
  directive,
  LINK_CLASS,
  PANEL_CLASS,
  referenceHref,
  SIGNATURE_CLASS,
  SYMBOL_CLASS,
  textOf,
  type SymbolPopoverProps,
} from "../components/symbol-popover/index.ts";
import {
  activate,
  closeOnEscape,
  closeOutside,
  handleClick,
  openPanels,
  PANEL_SELECTOR,
  SUMMARY_SELECTOR,
  type SymbolChip,
  type SymbolEvent,
  type SymbolNode,
} from "../components/symbol-popover/client.ts";

/** Render the chip the way the render host calls it: directive props and the page's language. */
function render(props: SymbolPopoverProps, lang = "en"): string | null {
  const input = { props, html: "", page: { lang }, site: {} } as unknown as ComponentProps<SymbolPopoverProps>;
  const node = symbolPopover(input);
  return node === null ? null : renderToString(node as never);
}

/** Parse rendered markup as a browser would, for the semantics assertions. */
function domOf(html: string) {
  return new JSDOM(`<!DOCTYPE html><html lang="en"><body>${html}</body></html>`).window.document;
}

/** A chip as the island touches it: an open flag, its summary, and a way to fire an event. */
class FakeChip implements SymbolChip {
  focused = false;
  focus(): void {
    this.focused = true;
  }
}

class FakeNode implements SymbolNode {
  open: boolean;
  readonly chip = new FakeChip();
  readonly children = new Set<unknown>();
  readonly listeners = new Map<string, Set<(event: SymbolEvent) => void>>();
  containsCalls = 0;

  constructor(open = false) {
    this.open = open;
  }

  querySelector(selector: string): SymbolChip | null {
    assert.equal(selector, SUMMARY_SELECTOR);
    return this.chip;
  }

  contains(target: unknown): boolean {
    this.containsCalls += 1;
    return this.children.has(target);
  }

  addEventListener(type: string, listener: (event: SymbolEvent) => void): void {
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }

  removeEventListener(type: string, listener: (event: SymbolEvent) => void): void {
    const listeners = this.listeners.get(type);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.listeners.delete(type);
  }

  fire(type: string, event: SymbolEvent = { preventDefault: () => {} }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** What the browser does natively: flips `open` and dispatches the `toggle` event. */
  setOpen(open: boolean): void {
    this.open = open;
    this.fire("toggle");
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/symbol-popover/style.css", import.meta.url), "utf8");

test("default export is the component and the directive is symbol-popover", () => {
  assert.equal(typeof symbolPopover, "function");
  assert.equal(directive, "symbol-popover");
  assert.equal(SYMBOL_CLASS, "symbol-popover");
  assert.equal(CHIP_CLASS, "symbol-popover-chip");
  assert.equal(PANEL_CLASS, "symbol-popover-panel");
});

test("renders a native disclosure with the summary as its first child", () => {
  const out = render({ name: "runExample", signature: "runExample(input: Input): Promise<Result>" });
  assert.ok(out);
  assert.match(out, /^<details class="symbol-popover" data-symbol="runExample">/);
  assert.match(out, /^<details[^>]*><summary class="symbol-popover-chip"/);
  assert.match(out, /<\/summary><div class="symbol-popover-panel">/);
  assert.match(out, /runExample<\/summary>/);
});

test("the tooltip role and its aria relationship are gone", () => {
  const out = render({ name: "runExample", signature: "runExample(): void", href: "/reference/runner/" });
  assert.ok(out);
  assert.doesNotMatch(out, /role="tooltip"/);
  assert.doesNotMatch(out, /aria-describedby/);
  assert.doesNotMatch(out, /aria-controls/);
  assert.doesNotMatch(out, /tabindex/);
});

test("shows the signature as code text and links to the reference", () => {
  const out = render({
    name: "runExample",
    signature: "runExample(input: Input): Promise<Result>",
    href: "/reference/runner/",
  });
  assert.ok(out);
  assert.match(out, new RegExp(`<code class="${SIGNATURE_CLASS}">runExample\\(input: Input\\): Promise&lt;Result></code>`));
  assert.match(out, new RegExp(`<a class="${LINK_CLASS}" href="/reference/runner/">Reference</a>`));
});

test("the link text follows the page language", () => {
  const out = render({ name: "runExample", signature: "runExample()", href: "/reference/" }, "fa");
  assert.ok(out);
  assert.match(out, />مرجع<\/a>/);
});

test("a chip with neither signature nor link stays a static, non-interactive label", () => {
  const out = render({ name: "runExample" });
  assert.ok(out);
  assert.equal(out, '<span class="symbol-popover symbol-popover-chip" data-symbol="runExample" data-copy-value="runExample">runExample</span>');
  assert.doesNotMatch(out, /<details|<summary|aria-/);
});

test("the copy value is the signature, or the name when there is no signature", () => {
  assert.equal(copyValueOf("run", "run(input: Input): Result"), "run(input: Input): Result");
  assert.equal(copyValueOf("run", ""), "run");
  const out = render({ name: "runExample", signature: "runExample(): void", href: "/reference/" });
  assert.ok(out);
  assert.match(out, /^<details[^>]*><summary class="symbol-popover-chip" data-copy-value="runExample\(\): void">/);
  assert.doesNotMatch(out, /data-copy-value="[^"]*Reference/);
});

test("a missing or blank name renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ name: "   " }), null);
  assert.equal(render({ name: 42 as unknown as string }), null);
});

test("renders no link when the href is missing or unsafe", () => {
  assert.doesNotMatch(render({ name: "x", signature: "x()" }) ?? "", /<a\b/);
  assert.doesNotMatch(render({ name: "x", signature: "x()", href: "javascript:alert(1)" }) ?? "", /<a\b/);
  assert.doesNotMatch(render({ name: "x", signature: "x()", href: "//example.com/" }) ?? "", /<a\b/);
  assert.equal(referenceHref("https://example.com/run"), "https://example.com/run");
  assert.equal(referenceHref("/reference/run/"), "/reference/run/");
  assert.equal(referenceHref("relative/run"), undefined);
});

test("escapes the name and the signature", () => {
  const out = render({
    name: 'run"Example',
    signature: '<img src=x onerror="alert(1)">',
    href: "/reference/",
  });
  assert.ok(out);
  assert.doesNotMatch(out, /<img\b/);
  assert.match(out, /data-symbol="run&quot;Example"/);
  assert.match(out, /&lt;img src=x onerror=&quot;alert\(1\)&quot;>/);
});

test("textOf trims strings and ignores every other value", () => {
  assert.equal(textOf("  run  "), "run");
  assert.equal(textOf(1), "");
  assert.equal(textOf(undefined), "");
});

test("repeated names and explicit ids cannot duplicate ids or relationships", () => {
  const props = { name: "Result", signature: "type Result = string", href: "/reference/", id: "result" };
  const out = [render(props as SymbolPopoverProps), render(props as SymbolPopoverProps)].join("");
  assert.equal(out.match(/<details\b/g)?.length, 2);
  assert.doesNotMatch(out, /\bid="/);
  assert.doesNotMatch(out, /aria-describedby|aria-controls|role="tooltip"/);
});

test("the disclosure is closed and complete before any JavaScript runs", () => {
  const doc = domOf(render({ name: "runExample", signature: "runExample(): void", href: "/reference/runner/" })!);
  const details = doc.querySelector("details.symbol-popover");
  assert.ok(details);
  assert.equal(details.hasAttribute("open"), false);
  assert.equal(details.firstElementChild?.tagName, "SUMMARY");
  assert.equal(doc.querySelectorAll('[role="tooltip"]').length, 0);
  assert.equal(doc.querySelectorAll("[aria-describedby], [aria-controls]").length, 0);

  const panel = details.querySelector(".symbol-popover-panel");
  assert.ok(panel);
  assert.equal(panel.hasAttribute("hidden"), false);
  assert.ok(details.querySelector("a[href='/reference/runner/']"), "the link is ordinary content inside the details");
});

test("the native summary is the only control, so tap, click, Enter, and Space need no island", () => {
  const doc = domOf(render({ name: "runExample", signature: "runExample(): void", href: "/reference/" })!);
  const details = doc.querySelector("details.symbol-popover");
  assert.ok(details);
  assert.equal(details.querySelectorAll("summary").length, 1);
  assert.equal(details.hasAttribute("tabindex"), false);
  assert.equal(details.querySelector("summary")?.hasAttribute("tabindex"), false);

  const node = new FakeNode();
  const off = activate(node);
  assert.deepEqual([...node.listeners.keys()], ["toggle"], "the island adds no pointer, touch, or key handler while closed");
  assert.equal(node.listenerCount("keydown"), 0, "a closed disclosure carries no Escape listener");
  assert.equal(node.open, false, "the island does not open the disclosure itself");
  assert.equal(node.chip.focused, false);
  off();
});

test("Escape closes an open disclosure and returns focus to its summarised chip", () => {
  const node = new FakeNode();
  const off = activate(node);
  node.setOpen(true);
  let prevented = false;
  node.fire("keydown", { key: "Escape", preventDefault: () => (prevented = true) });

  assert.equal(node.open, false);
  assert.equal(node.chip.focused, true);
  assert.equal(prevented, true);
  assert.equal(node.listenerCount("keydown"), 0, "the Escape listener is gone once the panel closes");
  assert.deepEqual(openPanels(), []);
  off();
});

test("Escape on a closed disclosure is left to the browser and does not move focus", () => {
  const node = new FakeNode();
  const off = activate(node);
  let prevented = false;
  node.fire("keydown", { key: "Escape", preventDefault: () => (prevented = true) });
  closeOnEscape(node, { key: "Escape", preventDefault: () => (prevented = true) });

  assert.equal(node.open, false);
  assert.equal(node.chip.focused, false);
  assert.equal(prevented, false);
  off();
});

test("keys other than Escape are left alone", () => {
  const node = new FakeNode();
  const off = activate(node);
  node.setOpen(true);
  for (const key of ["Tab", "Enter", " ", "ArrowDown", "Shift"]) {
    let prevented = false;
    node.fire("keydown", { key, preventDefault: () => (prevented = true) });
    assert.equal(node.open, true, key);
    assert.equal(prevented, false, key);
  }
  assert.equal(node.chip.focused, false);
  off();
});

test("a click outside closes the disclosure without moving focus", () => {
  const node = new FakeNode(true);
  const outside = {};
  const inside = {};
  node.children.add(inside);

  closeOutside(node, outside);
  assert.equal(node.open, false);
  assert.equal(node.chip.focused, false, "the clicked element keeps focus");

  const open = new FakeNode(true);
  open.children.add(inside);
  closeOutside(open, inside);
  assert.equal(open.open, true, "a click inside the panel leaves it open");

  const closed = new FakeNode();
  closeOutside(closed, outside);
  assert.equal(closed.open, false);
});

test("a click examines only the open disclosures, never the closed ones", () => {
  // A reference page's worth of closed symbols: a click must not touch any of them.
  const closed = Array.from({ length: 300 }, () => new FakeNode());
  const offClosed = closed.map((node) => activate(node));
  for (const node of closed) node.containsCalls = 0;

  handleClick({});
  assert.deepEqual(
    closed.map((node) => node.containsCalls),
    closed.map(() => 0),
    "no open disclosure means no per-panel contains checks",
  );
  assert.deepEqual(openPanels(), []);

  const first = new FakeNode();
  const second = new FakeNode();
  const offOpen = [activate(first), activate(second)];
  first.setOpen(true);
  second.setOpen(true);
  for (const node of closed) node.containsCalls = 0;
  first.containsCalls = 0;
  second.containsCalls = 0;

  handleClick({});
  assert.equal(first.containsCalls, 1, "one open panel costs one contains check");
  assert.equal(second.containsCalls, 1, "the other open panel costs one more");
  assert.equal(first.open, false);
  assert.equal(second.open, false);
  assert.equal(
    closed.reduce((total, node) => total + node.containsCalls, 0),
    0,
    "work follows the open set, not the total symbol count",
  );

  offOpen.forEach((off) => off());
  offClosed.forEach((off) => off());
});

test("a click inside one open panel closes the others and leaves it open", () => {
  const first = new FakeNode();
  const second = new FakeNode();
  const off = [activate(first), activate(second)];
  first.setOpen(true);
  second.setOpen(true);
  const insideSecond = {};
  second.children.add(insideSecond);

  handleClick(insideSecond);
  assert.equal(first.open, false, "the other open panel closes");
  assert.equal(second.open, true, "the clicked panel stays open");
  assert.equal(first.chip.focused, false, "focus is not moved by an outside click");
  assert.equal(second.chip.focused, false);

  off.forEach((offOne) => offOne());
});

test("Escape closes only the open disclosure it belongs to", () => {
  const first = new FakeNode();
  const second = new FakeNode();
  const off = [activate(first), activate(second)];
  first.setOpen(true);
  second.setOpen(true);
  assert.deepEqual(openPanels(), [first, second]);

  first.fire("keydown", { key: "Escape", preventDefault: () => {} });
  assert.equal(first.open, false);
  assert.equal(first.chip.focused, true);
  assert.equal(second.open, true, "the other discovery is untouched");
  assert.equal(second.chip.focused, false);
  assert.deepEqual(openPanels(), [second]);

  second.fire("keydown", { key: "Escape", preventDefault: () => {} });
  assert.deepEqual(openPanels(), []);
  off.forEach((offOne) => offOne());
});

test("the native toggle keeps the open set in step with the disclosure", () => {
  const node = new FakeNode();
  const off = activate(node);
  assert.deepEqual(openPanels(), []);

  node.setOpen(true);
  assert.deepEqual(openPanels(), [node]);
  assert.equal(node.listenerCount("keydown"), 1);

  node.setOpen(false);
  assert.deepEqual(openPanels(), []);
  assert.equal(node.listenerCount("keydown"), 0);

  node.setOpen(true);
  off();
  assert.deepEqual(openPanels(), [], "cleanup forgets an open disclosure");
  assert.deepEqual([...node.listeners.keys()], [], "cleanup removes every listener it added");
  node.setOpen(false);
  node.setOpen(true);
  assert.deepEqual(openPanels(), [], "an unwired disclosure is no longer tracked");
  assert.equal(node.listenerCount("keydown"), 0, "an unwired disclosure gets no Escape listener back");
});

test("the island never traps focus or changes the tab order", () => {
  const node = new FakeNode();
  const off = activate(node);
  node.setOpen(true);
  for (const key of ["Tab", "Shift", "ArrowLeft", "ArrowRight", "Enter", " "]) {
    node.fire("keydown", { key, preventDefault: () => {} });
  }
  assert.equal(node.open, true);
  assert.equal(node.chip.focused, false);
  assert.deepEqual([...node.listeners.keys()], ["toggle", "keydown"]);
  assert.equal(PANEL_SELECTOR, "details[data-symbol]");
  off();
});

test("closeOnEscape is the same behaviour without activate", () => {
  const node = new FakeNode(true);
  closeOnEscape(node, { key: "Tab", preventDefault: () => {} });
  assert.equal(node.open, true);

  closeOnEscape(node, { key: "Escape", preventDefault: () => {} });
  assert.equal(node.open, false);
  assert.equal(node.chip.focused, true);
});

test("a static chip has no disclosure, no island wiring, and no tab stop", () => {
  const doc = domOf(render({ name: "runExample" })!);
  assert.ok(doc.querySelector("span.symbol-popover-chip"));
  assert.equal(doc.querySelectorAll(PANEL_SELECTOR).length, 0, "the island finds only details disclosures");
  assert.equal(doc.querySelectorAll("summary, [tabindex]").length, 0);
});

test("style.css leaves the panel to the native details instead of hiding it", () => {
  assert.doesNotMatch(css, new RegExp(`\\.${PANEL_CLASS}\\s*\\{[^}]*display:\\s*none`, "s"));
  assert.doesNotMatch(css, new RegExp(`:hover\\s+\\.${PANEL_CLASS}|\\[data-dismissed\\]`));
  assert.match(css, new RegExp(`\\.${PANEL_CLASS}\\s*\\{[^}]*position:\\s*absolute`, "s"));
  assert.match(css, /\.symbol-popover-chip::-webkit-details-marker\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.symbol-popover-chip::marker\s*\{[^}]*content:\s*""/s);
});

test("style.css keeps visible focus rings and left-to-right signatures", () => {
  assert.match(css, /\.symbol-popover-chip:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.symbol-popover-link:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.symbol-popover-signature\s*\{[^}]*direction:\s*ltr/s);
  assert.match(css, /\.symbol-popover-signature\s*\{[^}]*unicode-bidi:\s*isolate/s);
});

test("style.css gives touch screens an in-flow panel", () => {
  assert.match(css, /@media \(max-width: 40rem\)/);
  assert.match(css, /details\.symbol-popover\s*\{[^}]*display:\s*block/s);
  assert.match(css, new RegExp(`\\.${PANEL_CLASS}\\s*\\{[^}]*position:\\s*static`, "s"));
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border|inset)-(left|right|top|bottom)\b/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/m);
  assert.match(css, /inset-inline-start:/);
  assert.match(css, /margin-block-start:/);
});
