import assert from "node:assert/strict";
import { test } from "node:test";
import { decorateLines, HIGHLIGHT_CLASS, isHighlighted, LINE_CLASS } from "../components/code/lines.ts";

/** Shiki's inner HTML for three lines, one `span.line` each, joined by `\n`. */
const SHIKI = '<span class="line"><span style="color:#111">a</span></span>\n<span class="line">b</span>\n<span class="line"></span>';

/** The visible text of an HTML fragment: characters outside tags, scanned one at a time. */
function textOf(html: string): string {
  let text = "";
  let inTag = false;
  for (const char of html) {
    if (char === "<") inTag = true;
    else if (char === ">" && inTag) inTag = false;
    else if (!inTag) text += char;
  }
  return text;
}

test("isHighlighted covers single lines and inclusive ranges", () => {
  const ranges = [
    { from: 1, to: 1 },
    { from: 3, to: 5 },
  ];
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => isHighlighted(n, ranges)), [true, false, true, true, true, false]);
  assert.equal(isHighlighted(1, []), false);
});

test("decorateLines wraps every line once, without nesting Shiki's wrapper", () => {
  const out = decorateLines(SHIKI);
  assert.equal((out.match(/<span class="line/g) ?? []).length, 3);
  assert.equal(out.split("\n").length, 3);
  assert.match(out, /^<span class="line"><span style="color:#111">a<\/span><\/span>\n/);
  assert.match(out, /<span class="line">b<\/span>\n/);
  assert.doesNotMatch(out, /class="line"><span class="line"/);
});

test("decorateLines marks only the lines a highlight range covers", () => {
  const out = decorateLines(SHIKI, { highlight: [{ from: 2, to: 3 }] }).split("\n");
  assert.equal(out[0], `<span class="${LINE_CLASS}"><span style="color:#111">a</span></span>`);
  assert.equal(out[1], `<span class="${LINE_CLASS} ${HIGHLIGHT_CLASS}">b</span>`);
  assert.equal(out[2], `<span class="${LINE_CLASS} ${HIGHLIGHT_CLASS}"></span>`);
});

test("decorateLines adds no line numbers unless asked", () => {
  assert.doesNotMatch(decorateLines(SHIKI), /data-line/);
  assert.doesNotMatch(decorateLines(SHIKI, { highlight: [{ from: 1, to: 1 }] }), /data-line/);
});

test("line numbers are attributes, so the text of the block is only the code", () => {
  const out = decorateLines(SHIKI, { numbers: true, highlight: [{ from: 1, to: 1 }] });
  assert.match(out, /data-line="1"/);
  assert.match(out, /data-line="2"/);
  assert.match(out, /data-line="3"/);
  assert.equal(textOf(out), "a\nb\n");
});

test("code text is kept exactly, entities and all", () => {
  const html = '<span class="line">a &lt; b &amp;&amp; c</span>';
  assert.equal(textOf(decorateLines(html, { numbers: true })), "a &lt; b &amp;&amp; c");
  assert.match(decorateLines(html), /a &lt; b &amp;&amp; c<\/span>$/);
});

test("a line without Shiki's wrapper is wrapped too", () => {
  assert.equal(decorateLines("plain"), `<span class="${LINE_CLASS}">plain</span>`);
});
