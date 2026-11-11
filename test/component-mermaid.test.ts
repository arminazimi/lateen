import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import mermaid, {
  altFromSource,
  clearDiagramCache,
  diagramKey,
  diagramRenderCount,
  normalizeSource,
  RENDER_OPTIONS,
  renderDiagram,
  type MermaidProps,
} from "../components/mermaid/index.ts";

function render(props: MermaidProps, lang = "en"): string {
  const input = {
    props,
    html: "",
    page: { lang } as ComponentProps["page"],
    site: {} as ComponentProps["site"],
  } as ComponentProps<MermaidProps>;
  const node = mermaid(input);
  return node === null ? "" : renderToString(node as never);
}

const css = readFileSync(new URL("../components/mermaid/style.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;
const tokenNames = new Set(Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)));

const FLOWCHART = "flowchart TD\n  A[Start] --> B[End]";

test("a small flowchart renders inline SVG at build time, with its source kept", () => {
  const out = render({ source: FLOWCHART, alt: "Start goes to end" });
  assert.match(out, /<figure class="mermaid"/);
  assert.match(out, /<svg[^>]*role="img"/);
  assert.match(out, /<text[^>]*>/);
  assert.match(out, /Start/);
  assert.match(out, /<title>Start goes to end<\/title>/);
  assert.match(out, /aria-label="Start goes to end"/);
  assert.match(out, /<details class="mermaid-source">/);
  assert.match(out, /<code class="language-mermaid">flowchart TD/);
  assert.doesNotMatch(out, /<script/i);
});

test("alt text may start as a Mermaid comment", () => {
  const source = `%% alt: A tiny flow\n${FLOWCHART}`;
  assert.equal(altFromSource(source), "A tiny flow");
  const out = render({ source });
  assert.match(out, /<title>A tiny flow<\/title>/);
  assert.match(out, /aria-label="A tiny flow"/);
});

test("normalization gives equivalent sources one cache key", () => {
  assert.equal(normalizeSource("\r\nflowchart TD  \r\n  A --> B\t\r\n\r\n"), "flowchart TD\n  A --> B");
  assert.equal(diagramKey(FLOWCHART), diagramKey("\r\nflowchart TD \r\n  A[Start] --> B[End]\r\n"));
  assert.notEqual(diagramKey(FLOWCHART), diagramKey("flowchart TD\n  A[Start] --> B[Done]"));
  assert.notEqual(diagramKey(FLOWCHART), diagramKey(FLOWCHART, { ...RENDER_OPTIONS, theme: "dark" }));
});

test("an unchanged diagram is not rendered twice", () => {
  const first = render({ source: FLOWCHART, alt: "Start goes to end" });
  const renders = diagramRenderCount();
  const variant = render({ source: "flowchart TD\r\n  A[Start] --> B[End]  \r\n\r\n", alt: "Start goes to end" });
  assert.equal(diagramRenderCount(), renders);
  assert.equal(variant, first);
});

test("a changed source or render option renders a new diagram", () => {
  renderDiagram(FLOWCHART);
  const afterBase = diagramRenderCount();

  const changed = renderDiagram("flowchart TD\n  A[Start] --> B[Done]");
  assert.equal(diagramRenderCount(), afterBase + 1);
  assert.ok(changed.ok);
  assert.match(changed.svg, /Done/);

  const dark = renderDiagram(FLOWCHART, { ...RENDER_OPTIONS, theme: "dark" });
  assert.equal(diagramRenderCount(), afterBase + 2);
  assert.ok(dark.ok);
  const base = renderDiagram(FLOWCHART);
  assert.ok(base.ok);
  assert.notEqual(dark.svg, base.svg);
});

test("the figure can keep a source position", () => {
  const out = render({ source: FLOWCHART, src: "docs/flow.md:3:1-6:3" });
  assert.match(out, /data-src="docs\/flow.md:3:1-6:3"/);
});

test("an invalid diagram falls back without throwing and keeps the source", () => {
  const props: MermaidProps = { source: "flowchart TD\n  A -->", alt: "Broken" };
  const renders = diagramRenderCount();
  const node = mermaid({ props, html: "", page: { lang: "en" }, site: {} } as unknown as ComponentProps<MermaidProps>);
  const out = renderToString(node as never);
  assert.equal(diagramRenderCount(), renders + 1);
  assert.match(out, /class="mermaid-fallback"/);
  assert.match(out, /role="note"/);
  assert.match(out, /<code class="language-mermaid">flowchart TD/);
  assert.doesNotMatch(out, /<svg/);

  // The page around a failed diagram still renders, and the failure is cached instead of retried.
  const page = renderToString(h("div", null, node, h("p", null, "after")) as never);
  assert.match(page, /<\/figure><p>after<\/p>/);
  assert.equal(render(props), out);
  assert.equal(diagramRenderCount(), renders + 1);
});

test("the same diagram has the same output in a fresh cache", () => {
  const first = render({ source: FLOWCHART, alt: "Start goes to end" });
  clearDiagramCache();
  assert.equal(render({ source: FLOWCHART, alt: "Start goes to end" }), first);
});

test("an empty source renders nothing", () => {
  assert.equal(render({}), "");
  assert.equal(render({ source: "  " }), "");
});

test("the fallback and the source disclosure follow the page language", () => {
  const broken = "flowchart TD\n  A -->";
  const fa = render({ source: broken }, "fa");
  assert.match(fa, /<p>این نمودار ترسیم نشد\. منبع زیر کامل است\.<\/p>/);
  assert.match(fa, /<summary>منبع نمودار<\/summary>/);

  const ar = render({ source: broken }, "ar");
  assert.match(ar, /تعذّر رسم هذا المخطط\. المصدر أدناه كامل\./);
  assert.match(ar, /<summary>مصدر المخطط<\/summary>/);

  const rendered = render({ source: FLOWCHART, alt: "A flow" }, "fa");
  assert.match(rendered, /<summary>منبع نمودار<\/summary>/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css is logical and starts text on the reading side", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):\s/);
  assert.match(css, /margin-inline/);
  assert.match(css, /text-align:\s*start/);
});
