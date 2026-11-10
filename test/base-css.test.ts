// The base stylesheet is the first shared CSS every page loads, so it is also the first place a raw
// value could creep in and break the theme's token contract instead of just one component. This test
// reads `styles/base.css` and fails on a color or absolute length that is not a token, on a physical
// property, on an unknown token name, and on a bundle that grows past the 8 KB budget.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../styles/base.css");
const tokensCss = read("../styles/tokens.css");

/** Comments become spaces (newlines kept) so offsets and line numbers stay useful. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

/** Every innermost `{ ... }` block: its selector and its declarations. At-rules keep their inner blocks. */
function blocks(text: string): { selector: string; body: string }[] {
  const source = stripComments(text);
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));
}

/** One `property: value` declaration, with the line it starts on. */
interface Declaration {
  readonly line: number;
  readonly property: string;
  readonly value: string;
}

/** Every declaration in the file, with line numbers for the failure message. */
function declarations(text: string): Declaration[] {
  const source = stripComments(text);
  const found: Declaration[] = [];
  for (const block of source.matchAll(/\{([^{}]*)\}/g)) {
    const body = block[1] ?? "";
    const bodyStart = (block.index ?? 0) + 1;
    let partStart = 0;
    for (const part of body.split(";")) {
      const match = /^\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([\s\S]+?)\s*$/.exec(part);
      if (match !== null) {
        const line = source.slice(0, bodyStart + partStart).split("\n").length;
        found.push({ line, property: match[1] ?? "", value: match[2] ?? "" });
      }
      partStart += part.length + 1;
    }
  }
  return found;
}

/** A hex color or a color function. `var(--color-*)` is a token reference, not a raw color. */
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)\s*\(/i;

/** An absolute length: the values that must come from a token instead. `0`, `%`, and keywords are fine. */const RAW_LENGTH = /(?:^|[^\w-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|pt|pc|cm|mm|in|q|fr)\b/i;

/** Removes `var(--token)` so only literal values are left to inspect. */
const withoutTokens = (value: string): string => value.replace(/var\(\s*--[a-z0-9-]+\s*(?:,[^)]*)?\)/gi, " ");

const rawColor = (value: string): boolean => RAW_COLOR.test(value);
const rawLength = (value: string): boolean => RAW_LENGTH.test(withoutTokens(value));

/**
 * The physical properties `tools/theme/logical-css.ts` rejects, kept here so the theme's strict
 * typecheck does not have to check a tools file. Keep the two lists in step.
 */
const PHYSICAL = [
  /\b(margin|padding|border|scroll-margin|scroll-padding)-(left|right|top|bottom)\b/,
  /\bborder-(top|bottom)-(left|right)-radius\b/,
  /(^|[;{\s])(left|right|top|bottom)\s*:/,
  /\btext-align\s*:\s*(left|right)\b/,
  /\bfloat\s*:\s*(left|right)\b/,
  /\bclear\s*:\s*(left|right)\b/,
  /(?<![\w-])(min-|max-)?(width|height)\s*:/,
];

/** "line: text" for every line with a physical property. */
const physicalLines = (text: string): string[] =>
  stripComments(text)
    .split("\n")
    .flatMap((line, index) => (PHYSICAL.some((rule) => rule.test(line)) ? [`${index + 1}: ${line.trim()}`] : []));


const problems = (check: (declaration: Declaration) => boolean): string[] =>
  declarations(css)
    .filter(check)
    .map((declaration) => `styles/base.css:${declaration.line}: ${declaration.property}: ${declaration.value}`);

test("base.css uses no raw color outside a token", () => {
  assert.deepEqual(problems((declaration) => rawColor(declaration.value)), []);
});

test("base.css uses no raw length outside a token", () => {
  assert.deepEqual(problems((declaration) => rawLength(declaration.value)), []);
});

test("base.css defines no tokens and every token it reads exists", () => {
  assert.deepEqual(problems((declaration) => declaration.property.startsWith("--")), []);
  const defined = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? ""));
  const referenced = new Set([...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1] ?? ""));
  assert.ok(referenced.size > 0, "base.css should use tokens");
  for (const token of referenced) assert.ok(defined.has(token), `styles/base.css reads ${token}, which styles/tokens.css does not define`);
});

test("the color and length checks catch the values they claim to", () => {
  for (const value of ["#fff", "#1f1f28cc", "rgb(0 0 0 / 0.1)", "hsl(210 40% 50%)", "light-dark(#fff, #000)", "oklch(0.7 0.1 250)"]) {
    assert.ok(rawColor(value), `expected a raw color in ${value}`);
  }
  for (const value of ["var(--color-text)", "currentColor", "transparent", "inherit"]) assert.ok(!rawColor(value), value);

  for (const value of ["16px", "1rem", "0.5em", "65ch", "2vw", "1.5fr"]) {
    assert.ok(rawLength(value), `expected a raw length in ${value}`);
  }
  for (const value of ["0", "100%", "var(--space-4)", "thin solid var(--color-border)"]) assert.ok(!rawLength(value), value);
  assert.ok(rawLength("calc(var(--space-16) + 1px)"), "a literal inside calc() is still a raw length");
});

test("base.css uses logical properties only", () => {
  assert.deepEqual(physicalLines(css), []);
  assert.ok(physicalLines("a { margin-left: 1rem; }").length > 0);
});

test("the focus ring uses the shared state token and survives forced colors", () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*thin solid var\(--state-focus-ring\)/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{[^}]*:focus-visible[^}]*outline-color:\s*(?:Highlight|CanvasText)\b/);
});

test("the disabled state uses the shared token", () => {
  assert.match(css, /:where\(:disabled, \[aria-disabled="true"\]\)\s*\{[^}]*color:\s*var\(--state-disabled-fg\)/);
});

test("headings leave room for the sticky header", () => {
  const rule = blocks(css).find((block) => block.body.includes("scroll-margin-block-start"));
  assert.ok(rule, "no heading rule sets scroll-margin-block-start");
  for (const heading of ["h1", "h2", "h3", "h4", "h5", "h6"]) assert.ok(rule.selector.includes(heading), `the scroll margin rule does not name ${heading}`);
  assert.match(rule.body, /scroll-margin-block-start:\s*var\(--space-16\)/);
});

test("the base styles cover the reset and every article element in the issue", () => {
  const selectors = blocks(css).map((block) => block.selector).join("\n");
  assert.match(css, /box-sizing:\s*border-box/, "the reset should set border-box");
  assert.match(selectors, /body/);
  for (const element of ["h1", "p", "ul", "ol", "a", "code", "blockquote", "hr", "img"]) {
    assert.match(selectors, new RegExp(`\\b${element}\\b`), `base.css does not style <${element}>`);
  }
  assert.match(css, /margin:\s*0;/, "the reset should clear the body margin");
});

test("base.css stays under the 8 KB budget when minified", () => {
  const minified = stripComments(css)
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .trim();
  const bytes = Buffer.byteLength(minified);
  assert.ok(bytes > 0 && bytes < 8 * 1024, `minified base.css is ${bytes} bytes; the budget is 8192`);
});
