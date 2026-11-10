import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import symbolPopover, {
  directive,
  LINK_CLASS,
  referenceHref,
  SIGNATURE_CLASS,
  SYMBOL_CLASS,
  textOf,
  TOOLTIP_CLASS,
  type SymbolPopoverProps,
} from "../components/symbol-popover/index.ts";
import {
  DISMISSED_ATTRIBUTE,
  dismiss,
  enhance,
  reset,
  SYMBOL_SELECTOR,
  type SymbolEvent,
  type SymbolNode,
} from "../components/symbol-popover/client.ts";

/** Render the chip the way the render host calls it: directive props and the page's language. */
function render(props: SymbolPopoverProps, lang = "en"): string | null {
  const input = { props, html: "", page: { lang }, site: {} } as unknown as ComponentProps<SymbolPopoverProps>;
  const node = symbolPopover(input);
  return node === null ? null : renderToString(node as never);
}

/** A chip as the island touches it: attributes, listeners, and a way to fire an event. */
class FakeNode implements SymbolNode {
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: SymbolEvent) => void>>();

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  addEventListener(type: string, listener: (event: SymbolEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  fire(type: string, event: SymbolEvent = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
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
  assert.equal(TOOLTIP_CLASS, "symbol-popover-tooltip");
});

test("renders an inline focusable chip with the name and a tooltip", () => {
  const out = render({ name: "runExample", signature: "runExample(input: Input): Promise<Result>" });
  assert.ok(out);
  assert.match(out, /<span class="symbol-popover" tabindex="0" data-symbol="runExample">runExample/);
  assert.match(out, new RegExp(`<span class="${TOOLTIP_CLASS}" role="tooltip">`));
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

test("renders no tooltip when there is neither a signature nor a link", () => {
  const out = render({ name: "runExample" });
  assert.ok(out);
  assert.doesNotMatch(out, /role="tooltip"/);
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

test("style.css hides the tooltip by default and shows it on hover and focus-within", () => {
  assert.match(css, new RegExp(`\\.${TOOLTIP_CLASS}\\s*\\{[^}]*display:\\s*none`, "s"));
  assert.match(
    css,
    new RegExp(
      `\\.${SYMBOL_CLASS}:hover \\.${TOOLTIP_CLASS},\\s*\\.${SYMBOL_CLASS}:focus-within \\.${TOOLTIP_CLASS}\\s*\\{[^}]*display:\\s*block`,
      "s",
    ),
  );
  assert.ok(css.indexOf("[data-dismissed]") > css.indexOf(":focus-within"), "the dismissed rule comes after the open rules");
  assert.match(css, /\.symbol-popover\[data-dismissed\] \.symbol-popover-tooltip\s*\{[^}]*display:\s*none/s);
});

test("style.css keeps a visible focus ring and left-to-right signatures", () => {
  assert.match(css, /\.symbol-popover:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.symbol-popover-link:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.symbol-popover-signature\s*\{[^}]*direction:\s*ltr/s);
  assert.match(css, /\.symbol-popover-signature\s*\{[^}]*unicode-bidi:\s*isolate/s);
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

test("the island finds chips by data-symbol", () => {
  assert.equal(SYMBOL_SELECTOR, "[data-symbol]");
});

test("Escape dismisses the tooltip and leaves other keys alone", () => {
  const node = new FakeNode();
  let prevented = false;
  enhance(node);
  node.fire("keydown", { key: "Tab", preventDefault: () => (prevented = true) } as SymbolEvent);
  node.fire("keydown", { key: "Enter" });
  assert.equal(node.attrs.has(DISMISSED_ATTRIBUTE), false);
  assert.equal(prevented, false);

  node.fire("keydown", { key: "Escape" });
  assert.equal(node.attrs.get(DISMISSED_ATTRIBUTE), "");
});

test("leaving the chip resets the dismissal so the next focus shows the tooltip", () => {
  const node = new FakeNode();
  enhance(node);
  node.fire("keydown", { key: "Escape" });
  assert.equal(node.attrs.has(DISMISSED_ATTRIBUTE), true);

  node.fire("blur");
  assert.equal(node.attrs.has(DISMISSED_ATTRIBUTE), false);

  node.fire("keydown", { key: "Escape" });
  node.fire("mouseleave");
  assert.equal(node.attrs.has(DISMISSED_ATTRIBUTE), false);
});

test("the island never traps focus or changes the tab order", () => {
  const node = new FakeNode();
  enhance(node);
  for (const key of ["Tab", "Shift", "ArrowDown", "Escape"]) node.fire("keydown", { key });
  assert.deepEqual([...node.attrs.keys()], [DISMISSED_ATTRIBUTE]);
  assert.deepEqual([...node.listeners.keys()].sort(), ["blur", "keydown", "mouseleave"]);
  reset(node);
  assert.equal(node.attrs.size, 0);
});

test("dismiss is a no-op for a non-Escape key even without enhance", () => {
  const node = new FakeNode();
  dismiss(node, { key: "Tab" });
  assert.equal(node.attrs.size, 0);
  dismiss(node, { key: "Escape" });
  assert.equal(node.attrs.get(DISMISSED_ATTRIBUTE), "");
  reset(node);
  assert.equal(node.attrs.size, 0);
});
