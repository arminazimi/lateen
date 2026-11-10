// The forced-colors stylesheet is the contract for Windows high contrast: borders, separators,
// focus rings, selected states, disabled controls, and icons keep their meaning when the system
// palette replaces every token color. This test reads `styles/forced-colors.css` and fails on a raw
// color or length, a physical property, a token read, a non-system color, a selector family the
// stylesheet forgets, and a focus rule duplicated from `styles/base.css`. It lives beside the other
// stylesheet tests and adds no shared index file.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../styles/forced-colors.css");
const baseCss = read("../styles/base.css");

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

/** An absolute length: the values that must come from a token instead. `0`, `%`, and keywords are fine. */
const RAW_LENGTH = /(?:^|[^\w-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|pt|pc|cm|mm|in|q|fr)\b/i;

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

/** The CSS system colors a forced-colors stylesheet may name, plus the values that follow the text color. */
const SYSTEM_COLORS = new Set([
  "AccentColor",
  "AccentColorText",
  "ActiveText",
  "ButtonBorder",
  "ButtonFace",
  "ButtonText",
  "Canvas",
  "CanvasText",
  "Field",
  "FieldText",
  "GrayText",
  "Highlight",
  "HighlightText",
  "LinkText",
  "Mark",
  "MarkText",
  "SelectedItem",
  "SelectedItemText",
  "VisitedText",
  "currentColor",
  "inherit",
  "none",
  "transparent",
]);

/** Properties whose value must be a system color in this stylesheet. */
const COLOR_PROPERTIES = new Set([
  "background-color",
  "border-block-end-color",
  "border-color",
  "border-inline-start-color",
  "color",
  "fill",
  "outline-color",
  "stroke",
  "text-decoration-color",
]);

/** The value without its `!important` flag. */
const plainValue = (value: string): string => value.replace(/\s*!important\s*$/i, "").trim();

const problems = (check: (declaration: Declaration) => boolean): string[] =>
  declarations(css)
    .filter(check)
    .map((declaration) => `styles/forced-colors.css:${declaration.line}: ${declaration.property}: ${declaration.value}`);

test("forced-colors.css exists and every rule is inside a forced-colors media query", () => {
  assert.ok(existsSync(new URL("../styles/forced-colors.css", import.meta.url)), "styles/forced-colors.css is missing");
  const source = stripComments(css).trim();
  assert.match(source, /^@media\s*\(forced-colors:\s*active\)\s*\{/, "the file must start with the forced-colors media query");
  assert.equal((source.match(/@media/g) ?? []).length, 1, "the file should hold one media query");
  assert.equal(source.at(-1), "}", "the media query should close at the end of the file");
});

test("every color is a system color and no token is read", () => {
  const used = new Set<string>();
  const unexpected: string[] = [];
  for (const declaration of declarations(css)) {
    if (!COLOR_PROPERTIES.has(declaration.property)) continue;
    const value = plainValue(declaration.value);
    used.add(value);
    if (!SYSTEM_COLORS.has(value)) unexpected.push(`styles/forced-colors.css:${declaration.line}: ${declaration.property}: ${value}`);
  }
  assert.deepEqual(unexpected, [], "every color must be a CSS system color");
  assert.doesNotMatch(stripComments(css), /var\(/, "a forced-colors stylesheet reads no tokens");
  for (const color of ["ButtonBorder", "ButtonFace", "ButtonText", "Canvas", "CanvasText", "GrayText", "Highlight", "HighlightText", "LinkText", "Mark", "MarkText", "VisitedText", "Field", "FieldText"]) {
    assert.ok(used.has(color), `the stylesheet never uses ${color}`);
  }
});

test("the system color check catches what it claims to", () => {
  assert.ok(!SYSTEM_COLORS.has("#fff"));
  assert.ok(!SYSTEM_COLORS.has("rgb(0 0 0)"));
  assert.ok(SYSTEM_COLORS.has("Highlight"));
  assert.ok(SYSTEM_COLORS.has("currentColor"));
});

test("forced-colors.css uses no raw color outside a system color", () => {
  assert.deepEqual(problems((declaration) => rawColor(declaration.value)), []);
  assert.ok(rawColor("#fff"));
  assert.ok(rawColor("light-dark(#fff, #000)"));
  assert.ok(!rawColor("CanvasText"));
});

test("forced-colors.css uses no raw length", () => {
  assert.deepEqual(problems((declaration) => rawLength(declaration.value)), []);
  assert.ok(rawLength("1px"));
  assert.ok(!rawLength("thin solid CanvasText"));
});

test("forced-colors.css uses logical properties only", () => {
  assert.deepEqual(physicalLines(css), []);
  assert.ok(physicalLines("a { margin-left: 1rem; }").length > 0);
});

test("forced-colors.css covers every unit whose meaning relies on color", () => {
  const selectors = blocks(css)
    .map((block) => block.selector)
    .join("\n");
  for (const selector of [
    ".badge",
    ".callout",
    ".page-status",
    ".diff-block",
    ".tag",
    ".code",
    ".table-scroll",
    ".schema-table",
    ".copy-markdown-button",
    ".feedback-button",
    ".page-footer-copy",
    "aria-current",
    ":disabled",
    "::selection",
    ":focus-visible",
  ]) {
    assert.ok(selectors.includes(selector), `forced-colors.css does not cover ${selector}`);
  }
  assert.match(stripComments(css), /stroke:\s*currentColor/, "icons must stay on currentColor");
  assert.match(stripComments(css), /fill:\s*currentColor/, "filled icons must stay on currentColor");
});

test("the focus rule is complemented, not duplicated from base.css", () => {
  // base.css names the ring twice: the generic `:focus-visible` rule and the forced-colors rule
  // that turns it into `Highlight`. Those are the two the new stylesheet must not repeat.
  const baseFocus = blocks(baseCss).filter((block) => block.selector === ":focus-visible");
  assert.equal(baseFocus.length, 2, "styles/base.css should hold the generic focus rule and its forced-colors rule");
  assert.match(baseFocus[0]?.body ?? "", /outline:\s*thin solid var\(--state-focus-ring\)/);
  assert.match(baseFocus[1]?.body ?? "", /outline-color:\s*Highlight/);
  assert.equal(blocks(css).filter((block) => block.selector === ":focus-visible").length, 0, "forced-colors.css must not repeat the generic focus rule");
  const complement = blocks(css).find((block) => block.selector.includes(":focus-visible"));
  assert.ok(complement, "forced-colors.css should name the system focus color for controls");
  assert.match(complement.selector, /:is\(|:has\(/, "the complement scopes the ring to the controls that outrank the base rule");
  assert.match(complement.body, /outline-color:\s*Highlight/);
});

test("selected and current states are not colour alone", () => {
  const selected = blocks(css).find((block) => block.selector.includes('aria-current="page"'));
  assert.ok(selected, "no current-page rule");
  assert.match(selected.body, /background-color:\s*Highlight/);
  assert.match(selected.body, /color:\s*HighlightText/);
  assert.match(selected.body, /text-decoration:\s*underline/, "the current state also needs a non-color cue");
  assert.doesNotMatch(stripComments(css), /display:\s*none|visibility:\s*hidden/, "nothing may be hidden to fit the palette");
  assert.doesNotMatch(stripComments(css), /\bcontent\s*:/, "the stylesheet may not add generated text");
  const marker = blocks(css).find((block) => block.selector.includes(".diff-block-marker"));
  assert.ok(marker, "no diff marker rule");
  assert.match(marker.body, /color:\s*CanvasText/);
});

test("disabled text and icons use their own system values", () => {
  const disabled = blocks(css).find((block) => block.selector.includes(":disabled"));
  assert.ok(disabled, "no disabled rule");
  assert.match(disabled.body, /color:\s*GrayText/);
  const icons = blocks(css).find((block) => block.selector.includes(".callout-icon") && block.body.includes("stroke"));
  assert.ok(icons, "no icon rule using currentColor");
  for (const declaration of declarations(css)) {
    if (declaration.property !== "fill" && declaration.property !== "stroke") continue;
    assert.equal(plainValue(declaration.value), "currentColor", `an icon must draw with currentColor, not ${declaration.value}`);
  }
});
