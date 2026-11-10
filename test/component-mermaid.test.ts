import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import mermaid, { altFromSource, type MermaidProps } from "../components/mermaid/index.ts";

function render(props: MermaidProps): string {
  const input = {
    props,
    html: "",
    page: {} as ComponentProps["page"],
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

test("the figure can keep a source position", () => {
  const out = render({ source: FLOWCHART, src: "docs/flow.md:3:1-6:3" });
  assert.match(out, /data-src="docs\/flow.md:3:1-6:3"/);
});

test("an invalid diagram falls back without throwing and keeps the source", () => {
  const out = render({ source: "flowchart TD\n  A -->", alt: "Broken" });
  assert.match(out, /class="mermaid-fallback"/);
  assert.match(out, /role="note"/);
  assert.match(out, /<code class="language-mermaid">flowchart TD/);
  assert.doesNotMatch(out, /<svg/);
});

test("an empty source renders nothing", () => {
  assert.equal(render({}), "");
  assert.equal(render({ source: "  " }), "");
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
