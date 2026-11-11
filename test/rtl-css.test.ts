// The right-to-left stylesheet is where a Persian or Arabic page gets its own type: Vazirmatn
// before Geist, a roomier line height, no letter spacing, and code that stays left to right.
// This test reads `styles/rtl.css` and `styles/tokens.css` and fails when a rule that makes that
// contract work disappears, when a token is unknown or invented, when a raw value or a physical
// property slips in, or when the file grows past its budget. It lives beside the other unit tests
// and adds no shared index file.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
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

test("technical inline content is left to right and isolated inside RTL text", () => {
  const code = rule("pre");
  assert.ok(code, "no rule for pre");
  for (const element of ["pre", "code", "kbd", "samp", "var"]) {
    assert.ok(code.selector.includes(element), `the code rule does not name ${element}`);
  }
  assert.match(code.selector, /:lang\(fa\)/);
  assert.match(code.selector, /:lang\(ar\)/);
  assert.match(code.selector, /:not\(\[dir\]\)/, "an authored direction should not be overruled");
  assert.match(code.body, /direction:\s*ltr/);
  assert.match(code.body, /unicode-bidi:\s*isolate/);
  assert.match(code.body, /font-family:\s*var\(--type-font-mono\)/);
});

test("code stays left to right on every right-to-left page, not only Persian and Arabic", () => {
  const code = rule("pre");
  assert.ok(code, "no rule for pre");
  assert.match(code.selector, /\[dir="rtl"\]/, "the code rule does not follow the dir attribute");
  assert.match(code.body, /text-align:\s*start/, "a left-to-right block should start at its left edge");
});

test("inline Latin runs in right-to-left prose are isolated", () => {
  const isolation = blocks(css).find(
    (block) => block.selector.includes('[dir="ltr"]') && /unicode-bidi:\s*isolate/.test(block.body),
  );
  assert.ok(isolation, "no rule isolates the pipeline's <span dir=\"ltr\"> runs");
  assert.match(isolation.selector, /\[dir="rtl"\]/);
});

test("every explicit direction island is isolated and keeps its authored direction", () => {
  const islands = blocks(css).find(
    (block) => block.selector.includes('[dir="auto"]') && /unicode-bidi:\s*isolate/.test(block.body),
  );
  assert.ok(islands, "no rule isolates dir=\"auto\" and dir=\"ltr\"/dir=\"rtl\" runs");
  for (const direction of ["ltr", "rtl"]) {
    assert.ok(islands.selector.includes(`[dir="${direction}"]`), `the island rule does not name dir="${direction}"`);
  }
  // The rule adds isolation only; direction stays with the attribute (and the browser's detection).
  assert.doesNotMatch(islands.body, /(?:^|;)\s*direction\s*:/, "the island rule overrules an authored direction");
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

/** Every stylesheet the theme ships, with the path used in failure messages. */
function themeCss(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const folder of ["styles", "chrome", "components", "layouts"]) {
    for (const entry of readdirSync(new URL(`../${folder}/`, import.meta.url), { recursive: true })) {
      const name = String(entry);
      if (name.endsWith(".css")) found.push({ path: `${folder}/${name}`, text: read(`../${folder}/${name}`) });
    }
  }
  return found;
}

/** A declaration that points at a physical edge instead of the reading direction. */
const PHYSICAL_DECLARATION =
  /^(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right|top|bottom)$|^border-(?:top|bottom)-(?:left|right)-radius$|^(?:left|right|top|bottom)$|^(?:min-|max-)?(?:width|height)$/;

/** The affordances whose meaning is the way the reader moves; the only symbols that may mirror. */
const MIRRORED = ["pager-arrow", "breadcrumb-sep", "home-arrow"];

test("every stylesheet uses logical direction properties", () => {
  const problems: string[] = [];
  for (const file of themeCss()) {
    for (const declaration of declarations(file.text)) {
      const sideways = ["text-align", "float", "clear"].includes(declaration.property) && /^(left|right)$/.test(declaration.value);
      if (PHYSICAL_DECLARATION.test(declaration.property) || sideways) {
        problems.push(`${file.path}:${declaration.line}: ${declaration.property}: ${declaration.value}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("only navigation affordances mirror, never media or technical symbols", () => {
  const mirrored = new Set<string>();
  for (const file of themeCss()) {
    for (const block of blocks(file.text)) {
      if (!/transform:\s*scaleX\(\s*-1\s*\)/.test(block.body)) continue;
      const classes = [...block.selector.matchAll(/\.([a-z0-9-]+)/g)].map((match) => match[1] ?? "");
      assert.ok(classes.length > 0, `${file.path}: ${block.selector} mirrors without naming what it mirrors`);
      for (const name of classes) {
        assert.ok(MIRRORED.includes(name), `${file.path}: ${block.selector} mirrors .${name}, which is not a navigation affordance`);
        mirrored.add(name);
      }
    }
  }
  for (const name of MIRRORED) assert.ok(mirrored.has(name), `no stylesheet mirrors .${name}`);
});

/** The theme's own direction and affordance styles, applied to a fixture the way a page loads them. */
const FIXTURE_CSS = [
  "../styles/rtl.css",
  "../styles/base.css",
  "../chrome/pager/style.css",
  "../chrome/breadcrumb/style.css",
  "../layouts/home.css",
  "../components/diff-block/style.css",
  "../components/version-diff/style.css",
  "../components/figure/style.css",
];

/** A fixture parsed by a DOM with the theme styles; `getComputedStyle` then follows the cascade. */
function rendered(name: string) {
  const dom = new JSDOM(read(`../fixtures/rtl/${name}`));
  for (const path of FIXTURE_CSS) {
    const style = dom.window.document.createElement("style");
    style.textContent = read(path);
    dom.window.document.head.append(style);
  }
  return dom.window;
}

/** The computed direction of the first element matching `selector`. */
function direction(window: ReturnType<typeof rendered>, selector: string): string {
  const element = window.document.querySelector(selector);
  assert.ok(element, `the fixture has no ${selector}`);
  return window.getComputedStyle(element).direction;
}

test("the mixed inline fixture reads right to left and keeps its technical runs left to right", () => {
  const window = rendered("mixed-inline.html");
  const document = window.document;

  assert.equal(document.documentElement.lang, "fa");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(direction(window, "#install"), "rtl");
  assert.equal(direction(window, "#quotation"), "rtl");
  for (const id of ["inline-code", "path-code", "flag-code", "version", "quote"]) {
    assert.equal(direction(window, `#${id}`), "ltr", `#${id} should read left to right`);
  }

  // The sentence keeps its words, and the technical values keep their exact text.
  const sentence = document.querySelector("#install")?.textContent ?? "";
  assert.ok(sentence.startsWith("برای نصب "), sentence);
  assert.ok(sentence.includes("beacon init --force"), sentence);
  assert.equal(document.querySelector("#path-code")?.textContent, "/etc/beacon/beacon.yml");
  assert.equal(document.querySelector("#version")?.textContent, "1.2.3");
});

test("the technical inline fixture keeps every run in its own direction", () => {
  const window = rendered("technical-inline.html");
  const document = window.document;

  assert.equal(document.documentElement.lang, "fa-IR");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(direction(window, "#samples"), "rtl");
  assert.equal(direction(window, "#regional"), "rtl");

  for (const id of ["sample", "variable", "url", "number", "ltr-run", "forced-ltr", "regional-code"]) {
    assert.equal(direction(window, `#${id}`), "ltr", `#${id} should read left to right`);
  }
  // A nested run and an authored `dir="rtl"` keep the direction they state.
  assert.equal(direction(window, "#rtl-run"), "rtl");
  assert.equal(direction(window, "#forced-rtl"), "rtl");

  // Every explicit island is isolated, including a string of only neutral characters.
  for (const id of ["url", "number", "neutral-run", "ltr-run", "rtl-run", "forced-rtl"]) {
    const element = document.querySelector(`#${id}`);
    assert.ok(element, `the fixture has no #${id}`);
    assert.equal(window.getComputedStyle(element).unicodeBidi, "isolate", `#${id} should be isolated`);
  }

  // The quoted values keep their exact characters and punctuation; nothing is reordered in the DOM.
  assert.equal(document.querySelector("#sample")?.textContent, "beacon: ready");
  assert.equal(document.querySelector("#variable")?.textContent, "retry_limit");
  assert.equal(document.querySelector("#url")?.textContent, "https://example.com/api?q=1&v=2");
  assert.equal(document.querySelector("#number")?.textContent, "1,024.50");
  assert.equal(document.querySelector("#neutral-run")?.textContent, "— 12 —");
});

test("the mixed block fixture keeps its technical blocks left to right", () => {
  const window = rendered("mixed-block.html");
  const document = window.document;

  assert.equal(document.documentElement.lang, "he");
  assert.equal(document.documentElement.dir, "rtl");
  assert.equal(direction(window, "#prose"), "rtl");
  for (const selector of ["pre", "#block-code", "#diff", "#ltr-quote", "#ltr-block", "#ltr-code"]) {
    assert.equal(direction(window, selector), "ltr", `${selector} should read left to right`);
  }

  // Source order is the reading order: title, prose, code block, quotation, pager.
  const order = ["#title", "#prose", "#block-code", "#ltr-quote", ".pager-prev", ".pager-next"];
  const nodes = order.map((selector) => document.querySelector(selector));
  for (let index = 1; index < nodes.length; index += 1) {
    const [previous, next] = [nodes[index - 1], nodes[index]];
    assert.ok(previous && next, `the fixture has no ${order[index]}`);
    assert.ok(
      (previous.compareDocumentPosition(next) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      `${order[index]} should come after ${order[index - 1]}`,
    );
  }
});

test("the mixed block fixture mirrors navigation arrows and leaves content symbols alone", () => {
  const window = rendered("mixed-block.html");
  for (const selector of [".pager-arrow", ".breadcrumb-sep", ".home-arrow"]) {
    const nodes = [...window.document.querySelectorAll(selector)];
    assert.ok(nodes.length > 0, `the fixture has no ${selector}`);
    for (const node of nodes) {
      assert.equal(window.getComputedStyle(node).transform, "scaleX(-1)", `${selector} should mirror`);
    }
  }
  for (const selector of [".version-diff-icon", "#media"]) {
    const node = window.document.querySelector(selector);
    assert.ok(node, `the fixture has no ${selector}`);
    assert.equal(window.getComputedStyle(node).transform, "none", `${selector} should not mirror`);
  }
});
