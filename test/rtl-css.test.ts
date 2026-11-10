// The right-to-left stylesheet is where a Persian or Arabic page gets its own type: Vazirmatn
// before Geist, a roomier line height, no letter spacing, and code that stays left to right.
// This test reads `styles/rtl.css` and `styles/tokens.css` and fails when a rule that makes that
// contract work disappears, when a token is unknown or invented, when a raw value or a physical
// property slips in, or when the file grows past its budget. It lives beside the other unit tests
// and adds no shared index file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadTokens } from "../scripts/tokens.ts";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../styles/rtl.css");
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

const defined = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? ""));
const referenced = [...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1] ?? "");

const problems = (check: (declaration: Declaration) => boolean): string[] =>
  declarations(css)
    .filter(check)
    .map((declaration) => `styles/rtl.css:${declaration.line}: ${declaration.property}: ${declaration.value}`);

/** The body of the first rule whose selector includes `selector`. */
const rule = (selector: string): { selector: string; body: string } | undefined =>
  blocks(css).find((block) => block.selector.includes(selector));

test("rtl.css targets Persian and Arabic by language", () => {
  const selectors = blocks(css).map((block) => block.selector).join("\n");
  for (const tag of ["fa", "ar"]) {
    assert.match(selectors, new RegExp(`:lang\\(${tag}\\)`), `rtl.css does not name :lang(${tag})`);
  }
});

test("rtl.css maps every type token to an rtl token", () => {
  const root = blocks(css).find((block) => block.body.includes("--type-font-body"));
  assert.ok(root, "rtl.css does not override --type-font-body");
  assert.match(root.selector, /:lang\(fa\)/);
  assert.match(root.selector, /:lang\(ar\)/);
  for (const [name, token] of [
    ["--type-font-body", "--rtl-font-body"],
    ["--type-font-heading", "--rtl-font-heading"],
    ["--type-font-ui", "--rtl-font-ui"],
    ["--type-leading-body", "--rtl-leading-body"],
    ["--type-leading-heading", "--rtl-leading-heading"],
    ["--type-leading-tight", "--rtl-leading-tight"],
  ] as const) {
    assert.match(root.body, new RegExp(`${name}:\\s*var\\(${token}\\)`), `${name} is not mapped to ${token}`);
  }
});

test("the rtl tokens are a group the pipeline builds", () => {
  const tokens = loadTokens();
  for (const name of ["font-body", "font-heading", "font-ui", "leading-body", "leading-heading", "leading-tight", "letter-spacing"]) {
    assert.ok(tokens.has(`rtl-${name}`), `tokens/rtl.json does not define rtl-${name}`);
    assert.ok(defined.has(`--rtl-${name}`), `styles/tokens.css does not define --rtl-${name}`);
  }
});

test("the RTL stack puts Vazirmatn before Geist and keeps a size-adjusted fallback", () => {
  const tokens = loadTokens();
  for (const name of ["rtl-font-body", "rtl-font-heading", "rtl-font-ui"]) {
    const value = tokens.get(name)?.light ?? "";
    assert.match(value, /^Vazirmatn,\s*Geist,/, `${name} should start with Vazirmatn then Geist: ${value}`);
    assert.match(value, /"Vazirmatn Fallback"/, `${name} should keep the Vazirmatn fallback: ${value}`);
    assert.match(value, /system-ui/, `${name} should fall back to the system sans: ${value}`);
  }
});

test("RTL line heights leave more room than the Latin ones", () => {
  const tokens = loadTokens();
  const number = (name: string): number => Number(tokens.get(name)?.light ?? "NaN");
  for (const name of ["body", "heading", "tight"]) {
    assert.ok(number(`rtl-leading-${name}`) > number(`type-leading-${name}`), `the RTL ${name} line height should exceed the Latin one`);
  }
  assert.equal(tokens.get("rtl-letter-spacing")?.light, "normal");
});

test("Persian and Arabic pages drop letter spacing, including on elements that set it", () => {
  const body = blocks(css).find((block) => block.body.includes("letter-spacing: var(--rtl-letter-spacing)"));
  assert.ok(body, "no rule applies the RTL letter spacing");
  for (const selector of [":root:lang(fa) *", ":root:lang(ar) *"]) {
    assert.ok(body.selector.includes(selector), `the letter spacing rule does not reach ${selector}`);
  }
});

test("code is left to right and isolated inside RTL text", () => {
  const code = rule("pre");
  assert.ok(code, "no rule for pre");
  for (const element of ["pre", "code", "kbd"]) {
    assert.ok(code.selector.includes(element), `the code rule does not name ${element}`);
  }
  assert.match(code.selector, /:lang\(fa\)/);
  assert.match(code.selector, /:lang\(ar\)/);
  assert.match(code.body, /direction:\s*ltr/);
  assert.match(code.body, /unicode-bidi:\s*isolate/);
  assert.match(code.body, /font-family:\s*var\(--type-font-mono\)/);
});

test("rtl.css uses no raw color or raw length outside a token", () => {
  assert.deepEqual(problems((declaration) => rawColor(declaration.value)), []);
  assert.deepEqual(problems((declaration) => rawLength(declaration.value)), []);
});

test("rtl.css invents no token and every token it reads exists", () => {
  const definitions = declarations(css).filter((declaration) => declaration.property.startsWith("--"));
  assert.ok(definitions.length > 0, "rtl.css should map the type tokens");
  for (const definition of definitions) {
    assert.ok(definition.property.startsWith("--type-"), `styles/rtl.css defines a new token: ${definition.property}`);
    assert.ok(defined.has(definition.property), `styles/rtl.css defines ${definition.property}, which tokens.css does not define`);
    assert.match(definition.value, /^var\(--rtl-[a-z-]+\)$/, `${definition.property} should map to an rtl token: ${definition.value}`);
  }
  assert.ok(referenced.length > 0, "rtl.css should use tokens");
  for (const token of referenced) assert.ok(defined.has(token), `styles/rtl.css reads ${token}, which styles/tokens.css does not define`);
});

test("rtl.css uses logical properties only", () => {
  assert.deepEqual(physicalLines(css), []);
  assert.ok(physicalLines("a { margin-left: 1rem; }").length > 0);
});

test("rtl.css stays under the 4 KB budget when minified", () => {
  const minified = stripComments(css)
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .trim();
  const bytes = Buffer.byteLength(minified);
  assert.ok(bytes > 0 && bytes < 4 * 1024, `minified rtl.css is ${bytes} bytes; the budget is 4096`);
});
