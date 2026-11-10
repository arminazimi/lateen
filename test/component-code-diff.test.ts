import assert from "node:assert/strict";
import { test } from "node:test";
import { DEL_CLASS, DIFF_LANGS, INS_CLASS, isDiffLang, markDiffLines, stripDiffMarkers } from "../components/code/diff.ts";
import { decorateLines, HIGHLIGHT_CLASS } from "../components/code/lines.ts";

/** Shiki's inner HTML for a small `diff` fence: the marker is the first token of each line. */
const DIFF_FENCE = [
  '<span class="line"><span style="--shiki-light:#d73a49">- publish: build</span></span>',
  '<span class="line"><span style="--shiki-light:#22863a">+ publish: dist</span></span>',
  '<span class="line"><span style="--shiki-light:#6a737d"> </span><span style="--shiki-light:#24292e">keep: as-is</span></span>',
].join("\n");

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

/** The class attribute of the line at `index` (0-based) of decorated output. */
function lineClass(html: string, index: number): string | undefined {
  return /^<span class="([^"]*)"/.exec(html.split("\n")[index] ?? "")?.[1];
}

test("isDiffLang names the fence languages that carry markers as text", () => {
  assert.equal(isDiffLang("diff"), true);
  assert.equal(isDiffLang("patch"), true);
  assert.equal(isDiffLang(" diff "), true);
  assert.equal(isDiffLang("Patch"), true);
  assert.equal(isDiffLang("ts"), false);
  assert.equal(isDiffLang(undefined), false);
  assert.deepEqual([...DIFF_LANGS].sort(), ["diff", "patch"]);
});

test("markDiffLines classes only the lines the ranges cover, and leaves the rest as it is", () => {
  const out = markDiffLines(SHIKI, { ins: [{ from: 1, to: 1 }], del: [{ from: 3, to: 3 }] });
  assert.equal(out.split("\n")[0], `<span class="line ${INS_CLASS}"><span style="color:#111">a</span></span>`);
  assert.equal(out.split("\n")[1], '<span class="line">b</span>');
  assert.equal(out.split("\n")[2], `<span class="line ${DEL_CLASS}"></span>`);
});

test("markDiffLines composes with decorateLines: highlight and marks share the class", () => {
  const out = markDiffLines(decorateLines(SHIKI, { highlight: [{ from: 2, to: 2 }], numbers: true }), { ins: [{ from: 2, to: 2 }] });
  assert.equal(lineClass(out, 1), `line ${HIGHLIGHT_CLASS} ${INS_CLASS}`);
  assert.match(out, /data-line="2"/);
});

test("markDiffLines with nothing to mark returns its input unchanged", () => {
  assert.equal(markDiffLines(SHIKI), SHIKI);
  assert.equal(markDiffLines(SHIKI, {}), SHIKI);
  assert.equal(markDiffLines(SHIKI, { ins: [], del: [] }), SHIKI);
});

test("markDiffLines never touches the text: the marker is a class for CSS, not content", () => {
  const out = markDiffLines(SHIKI, { ins: [{ from: 1, to: 1 }], del: [{ from: 1, to: 3 }] });
  assert.equal(textOf(out), textOf(SHIKI));
  assert.equal(lineClass(out, 0), `line ${INS_CLASS} ${DEL_CLASS}`);
  assert.equal(lineClass(out, 2), `line ${DEL_CLASS}`);
});

test("stripDiffMarkers takes the marker off the text and puts the class on the line", () => {
  const out = stripDiffMarkers(DIFF_FENCE);
  assert.equal(lineClass(out, 0), `line ${DEL_CLASS}`);
  assert.equal(lineClass(out, 1), `line ${INS_CLASS}`);
  assert.equal(lineClass(out, 2), "line");
  assert.equal(textOf(out), " publish: build\n publish: dist\nkeep: as-is");
});

test("diff headers keep their text and gain no marker class", () => {
  const fence = [
    '<span class="line"><span style="color:#6a737d">diff --git a/x b/x</span></span>',
    '<span class="line"><span style="color:#6a737d">--- a/x</span></span>',
    '<span class="line"><span style="color:#6a737d">+++ b/x</span></span>',
    '<span class="line"><span style="color:#6a737d">@@ -1 +1 @@</span></span>',
    '<span class="line">index 123..456</span>',
  ].join("\n");
  assert.equal(stripDiffMarkers(fence), fence);
});

test("lines that do not start with a marker keep their text", () => {
  const fence = '<span class="line">const a = 1;</span>\n<span class="line"></span>';
  assert.equal(stripDiffMarkers(fence), fence);
});

test("a marker split across token spans is still one text, and only the character goes", () => {
  const fence = '<span class="line"><span style="color:#a">+</span><span style="color:#b"> added: 1</span></span>';
  const out = stripDiffMarkers(fence);
  assert.equal(lineClass(out, 0), `line ${INS_CLASS}`);
  assert.equal(out, `<span class="line ${INS_CLASS}"><span style="color:#a"></span><span style="color:#b"> added: 1</span></span>`);
});

test("a diff fence through the real pipeline order — decorateLines first, then the strip — copies clean", () => {
  const out = stripDiffMarkers(decorateLines(DIFF_FENCE));
  assert.equal(textOf(out), " publish: build\n publish: dist\nkeep: as-is");
  assert.equal(lineClass(out, 1), `line ${INS_CLASS}`);
});
