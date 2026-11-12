// The print stylesheet is the contract for printed pages: only the article, the light palette,
// link addresses, every tab panel and disclosure body, and blocks that do not split or clip. This
// test reads `styles/print.css` and fails when a rule that makes that contract work disappears, when
// a token is unknown, when a physical (left/right) property or a raw color slips in, or when a rule
// escapes `@media print` and reaches the screen. It is a test for the new stylesheet, so it lives
// beside the other unit tests and adds no shared index file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../styles/print.css");
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

/** One `property: value` declaration in a block body. */
interface Declaration {
  readonly property: string;
  readonly value: string;
}

/** Every declaration in the given blocks. */
function declarations(text: string): Declaration[] {
  const found: Declaration[] = [];
  for (const block of text.matchAll(/\{([^{}]*)\}/g)) {
    const body = block[1] ?? "";
    for (const part of body.split(";")) {
      const match = /^\s*([-a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([\s\S]+?)\s*$/.exec(part);
      if (match !== null) found.push({ property: match[1] ?? "", value: match[2] ?? "" });
    }
  }
  return found;
}

/** A hex color or a color function. `var(--color-*)` is a token reference, not a raw color. */
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)\s*\(/i;

/** An absolute length. `0`, `%`, and keywords are fine; physical print geometry is handled below. */
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

/**
 * The `@media print` block, brace for brace. Everything in the stylesheet but `@page` must sit
 * inside it: a screen page must inherit nothing from these rules, so a rule written after the block
 * closes, or a second top-level rule before it, fails here.
 */
function printBody(text: string): string {
  const source = stripComments(text);
  const start = source.search(/@media\s+print\s*\{/);
  assert.ok(start >= 0, "print.css has no @media print rule");

  let depth = 0;
  let end = start;
  for (; end < source.length; end += 1) {
    const character = source[end];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  assert.match(source.slice(0, start).trim(), /^@page\s*\{[^}]*\}$/, "print.css has a rule outside @media print");
  assert.equal(source.slice(end + 1).trim(), "", "print.css has a rule after @media print");
  return source.slice(start, end + 1);
}

/** The three tab variants a printed page can hold, by the selectors that isolate them. */
const TAB_VARIANTS: ReadonlyArray<{ readonly name: string; readonly panel: string; readonly title: string; readonly list: string }> = [
  { name: "generic content tabs", panel: '.tabs > [role="tabpanel"]', title: ".tabs-title", list: '.tabs > [role="tablist"]' },
  { name: "OS tabs", panel: ".os-tabs-panel", title: ".os-tabs-title", list: ".os-tabs-list" },
  { name: "code tabs", panel: ".code-tabs-panel", title: ".code-tabs-title", list: ".code-tabs-list" },
];

/** The selectors of every rule that hides something with `display: none !important`. */
function hiddenSelectors(text: string): Set<string> {
  const found = new Set<string>();
  for (const block of blocks(text)) {
    if (!/display\s*:\s*none\s*!important/.test(block.body)) continue;
    for (const selector of block.selector.split(",")) found.add(selector.trim());
  }
  return found;
}

/** The body of the first rule whose selector includes `selector`. */
function rule(text: string, selector: string): { selector: string; body: string } | undefined {
  return blocks(text).find((block) => block.selector.includes(selector));
}

const problems = (check: (declaration: Declaration) => boolean): Declaration[] => declarations(css).filter(check);

test("print.css is a print stylesheet with a page size and margins", () => {
  assert.match(css, /@media\s+print\s*\{/);
  const page = rule(css, "@page");
  assert.ok(page, "no @page rule");
  assert.match(page.body, /size:\s*A4\s+portrait/);
  assert.match(page.body, /margin:\s*18mm\s+16mm/);
});

test("print.css forces the light color scheme so tokens do not print dark", () => {
  assert.match(css, /color-scheme:\s*light\s*!important/);
});

test("print.css hides every piece of chrome and every screen-only control", () => {
  const hidden = hiddenSelectors(printBody(css));
  for (const selector of [
    ".skip-link",
    "body > header",
    "body > footer",
    ".header",
    ".drawer",
    ".sidebar",
    ".sidebar-nav",
    ".aside",
    ".toc",
    ".toc-fold",
    ".breadcrumb",
    ".pager",
    ".page-footer",
    ".page-agent-menu",
    "[data-page-agent-menu]",
    ".block-actions",
    "[data-block-actions]",
    ".search",
    "[data-search]",
    ".theme-toggle",
    "[data-theme-toggle]",
    ".heading-anchor",
    ".terminal-copy",
    ".page-footer-copy",
    ".code-tabs-list",
  ]) {
    assert.ok(hidden.has(selector), `print.css does not hide ${selector}`);
  }
});

test("a closed details prints its body, and its summary stays with it", () => {
  const details = rule(css, "details:not([open])");
  assert.ok(details, "no closed-details rule");
  assert.match(details.body, /display:\s*block\s*!important/);
  const summary = rule(css, ".details-summary");
  assert.ok(summary, "no details summary rule");
  assert.match(summary.body, /break-after:\s*avoid/);
});

test("every tab variant prints all its panels, each under its own title, and drops its tab list", () => {
  const body = printBody(css);
  for (const variant of TAB_VARIANTS) {
    const panels = blocks(body).filter((block) => block.selector.includes(variant.panel));
    assert.ok(panels.length > 0, `print.css says nothing about ${variant.name} panels`);
    assert.ok(
      panels.some((block) => /display:\s*block\s*!important/.test(block.body)),
      `${variant.name}: unselected panels are not shown`,
    );
    assert.ok(
      panels.some((block) => block.selector.includes(`${variant.panel}[hidden]`) && /display:\s*block\s*!important/.test(block.body)),
      `${variant.name}: a panel hidden with the [hidden] attribute is not shown`,
    );
    const title = rule(body, variant.title);
    assert.ok(title, `${variant.name}: no rule for the panel title ${variant.title}`);
    assert.match(title.body, /display:\s*block\s*!important/, `${variant.name}: the panel title stays hidden`);
    assert.ok(hiddenSelectors(body).has(variant.list), `${variant.name}: the screen tab list ${variant.list} still prints`);
  }
});

test("no screen-only copy control prints", () => {
  const hidden = hiddenSelectors(printBody(css));
  for (const selector of [
    ".terminal-copy",
    ".code-copy",
    ".code-copy-bar",
    ".code-copy-status",
    ".diff-block-copy",
    ".output-block-copy",
    ".copy-markdown",
    "[data-copy-markdown]",
    ".page-footer-copy",
    ".page-agent-menu-copy",
  ]) {
    assert.ok(hidden.has(selector), `print.css does not hide the copy control ${selector}`);
  }
});

test("a disclosure whose panel floats on screen prints inside the text flow", () => {
  for (const selector of [".symbol-popover-panel", ".trust-panel-body"]) {
    const panel = rule(printBody(css), selector);
    assert.ok(panel, `no print rule for ${selector}`);
    assert.match(panel.body, /position:\s*static/);
    assert.match(panel.body, /max-inline-size:\s*none/);
  }
});

test("print.css has nothing outside @media print", () => {
  const body = printBody(css);
  assert.match(body, /^@media\s+print\s*\{/);
  assert.ok(body.trimEnd().endsWith("}"));
  assert.throws(
    () => printBody("@page { size: A4 portrait; } @media print { a { color: blue } } b { display: none }"),
    "a rule after @media print must fail the check",
  );
});

test("printed links show their address, but anchors, scripts, and mail links do not", () => {
  assert.match(css, /content:\s*"\s*\(" attr\(href\) "\)"/);
  for (const skip of ['[href^="#"', '[href^="javascript:"', '[href^="mailto:"']) {
    assert.ok(css.includes(skip), `the link rule does not skip ${skip}`);
  }
});

test("headings stay with their text and blocks stay whole", () => {
  const headings = blocks(css).find((block) => block.selector.includes("h1") && block.body.includes("break-after"));
  assert.ok(headings, "no heading break-after rule");
  assert.match(headings.body, /break-after:\s*avoid/);
  const whole = blocks(css).find((block) => block.selector.includes("pre") && block.body.includes("break-inside"));
  assert.ok(whole, "no break-inside rule for code");
  assert.match(whole.body, /break-inside:\s*avoid/);
});

test("printed code wraps instead of clipping and tables fit the page", () => {
  const code = rule(css, ".code code");
  assert.ok(code, "no printed code rule");
  assert.match(code.body, /white-space:\s*pre-wrap/);
  assert.match(code.body, /overflow-wrap:\s*anywhere/);
  const table = rule(css, ".table-scroll > .table");
  assert.ok(table, "no printed table rule");
  assert.match(table.body, /inline-size:\s*100%/);
});

test("print.css uses only tokens and no raw color", () => {
  assert.deepEqual(problems((declaration) => rawColor(declaration.value)), []);
  const defined = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? ""));
  const referenced = new Set([...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1] ?? ""));
  assert.ok(referenced.size > 0, "print.css should use tokens");
  for (const token of referenced) assert.ok(defined.has(token), `print.css reads ${token}, which styles/tokens.css does not define`);
});

test("print.css uses logical properties only", () => {
  assert.deepEqual(physicalLines(css), []);
  assert.ok(physicalLines("a { margin-left: 1rem; }").length > 0);
});

test("only the @page rule uses a physical length", () => {
  const withoutPage = css.replace(/@page\s*\{[^}]*\}/, "");
  const raw = declarations(withoutPage)
    .filter((declaration) => rawLength(declaration.value))
    .map((declaration) => `${declaration.property}: ${declaration.value}`);
  assert.deepEqual(raw, []);
});
