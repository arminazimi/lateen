import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import diffBlock, {
  ADDED_CLASS,
  BAR_CLASS,
  CONTEXT_CLASS,
  COPY_CLASS,
  GROUP_CLASS,
  LINE_CLASS,
  LIST_CLASS,
  MARKER_CLASS,
  REMOVED_CLASS,
  SR_CLASS,
  TEXT_CLASS,
  directive,
  idBase,
} from "../components/diff-block/index.ts";
import { bodyText, copyText, parseDiff } from "../components/diff-block/lines.ts";
import { activate, copy, RESET_MS, type Clipboard, type CopyButton, type CopyEnv } from "../components/diff-block/client.ts";

const DIFF = `<pre><code class="language-diff">${[
  "--- a/slipway.yml",
  "+++ b/slipway.yml",
  "@@ -1,3 +1,3 @@",
  " publish:",
  "-  dir: build",
  "+  dir: dist",
  " keep:",
].join("\n")}</code></pre>`;

function render(html = DIFF, lang = "en", props: Record<string, string> = {}): string {
  const input = { props, html, page: { lang }, site: {} } as unknown as ComponentProps;
  return renderToString(diffBlock(input) as never);
}

const css = readFileSync(new URL("../components/diff-block/style.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("the directive is diff-block and the default export is a component", () => {
  assert.equal(directive, "diff-block");
  assert.equal(typeof diffBlock, "function");
});

test("bodyText keeps line breaks, drops tags, and decodes entities", () => {
  assert.equal(bodyText("<p>a<br>b &amp; c</p>\n<p>d &lt;e&gt; &quot;f&quot; &#39;g&#39;</p>"), 'a\nb & c\n\nd <e> "f" \'g\'');
  assert.equal(bodyText('<pre data-src="a.md:1"><code class="language-diff">+a\n-b\n c\n</code></pre>'), "+a\n-b\n c");
});

test("bodyText drops tags that a first pass would rebuild", () => {
  assert.doesNotMatch(bodyText("<scrip<script>t>alert(1)"), /<[^>]*>/);
});

test("parseDiff reads +, -, space, and headers, and takes the marker off the text", () => {
  const lines = parseDiff("+added\n-removed\n context\nplain");
  assert.deepEqual(lines, [
    { kind: "added", text: "added" },
    { kind: "removed", text: "removed" },
    { kind: "context", text: "context" },
    { kind: "context", text: "plain" },
  ]);
  assert.deepEqual(parseDiff(""), []);
});

test("file and hunk headers stay context and keep their text", () => {
  assert.deepEqual(parseDiff("--- a/x\n+++ b/x\n@@ -1 +1 @@\ndiff --git a/x b/x\nindex 1..2"), [
    { kind: "context", text: "--- a/x", header: true },
    { kind: "context", text: "+++ b/x", header: true },
    { kind: "context", text: "@@ -1 +1 @@", header: true },
    { kind: "context", text: "diff --git a/x b/x", header: true },
    { kind: "context", text: "index 1..2", header: true },
  ]);
});

test("copyText is the new file: added and context lines, no markers, removed lines, or headers", () => {
  const lines = parseDiff("--- a/x\n+++ b/x\n@@ -1 +1 @@\n publish:\n-  dir: build\n+  dir: dist\n keep:");
  assert.equal(copyText(lines), "publish:\n  dir: dist\nkeep:");
  assert.equal(copyText([]), "");
});

test("the block is a group labelled by a visually hidden Diff span, around an ordered list", () => {
  const out = render();
  const id = /aria-labelledby="([^"]+)"/.exec(out)?.[1];
  assert.ok(id, "the group should be labelled");
  assert.match(out, new RegExp(`^<div class="${GROUP_CLASS}" role="group" aria-labelledby="${id}"`));
  assert.match(out, new RegExp(`<span class="${SR_CLASS}" id="${id}">Diff</span>`));
  assert.match(out, new RegExp(`<ol class="${LIST_CLASS}">`));
});

test("each line has the line class and its kind class", () => {
  const out = render();
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}">`));
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${REMOVED_CLASS}">`));
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${ADDED_CLASS}">`));
  assert.equal(out.match(new RegExp(`<li class="${LINE_CLASS}`, "g"))?.length, 7);
});

test("added and removed lines name themselves for assistive tech, and show a marker", () => {
  const out = render();
  assert.match(
    out,
    new RegExp(`<span class="${SR_CLASS}">Added: </span><span class="${MARKER_CLASS}" aria-hidden="true">\\+</span><span class="${TEXT_CLASS}">  dir: dist</span>`),
  );
  assert.match(
    out,
    new RegExp(`<span class="${SR_CLASS}">Removed: </span><span class="${MARKER_CLASS}" aria-hidden="true">−</span><span class="${TEXT_CLASS}">  dir: build</span>`),
  );
  assert.doesNotMatch(out, /<span class="diff-block-sr">Added: <\/span><span class="diff-block-marker" aria-hidden="true">−/);
});

test("context lines have no kind prefix", () => {
  const out = render();
  assert.match(
    out,
    new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}"><span class="${MARKER_CLASS}" aria-hidden="true"></span><span class="${TEXT_CLASS}">publish:</span>`),
  );
});

test("the body text is escaped, never markup", () => {
  const out = render('<pre><code class="language-diff">+if (a &lt; b &amp;&amp; c &gt; d) { alert(&quot;x&quot;); }</code></pre>');
  assert.match(out, /if \(a &lt; b &amp;&amp; c > d\) \{ alert\(&quot;x&quot;\); \}/);
  assert.doesNotMatch(out, /<script\b/);
});

test("an empty body renders nothing at all", () => {
  assert.equal(render(""), "");
  const input = { props: {}, html: "", page: { lang: "en" }, site: {} } as unknown as ComponentProps;
  assert.equal(diffBlock(input), null);
});

test("the copy button starts hidden and carries the new file without markers", () => {
  const out = render();
  assert.match(out, new RegExp(`<div class="${BAR_CLASS}"><button type="button" class="${COPY_CLASS}" hidden data-diff-copy="true"`));
  assert.match(out, /data-diff="publish:\n  dir: dist\nkeep:"/);
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Press Ctrl\+C"/);
  assert.match(out, />Copy<\/button>/);
});

test("the label and copy messages follow the page language", () => {
  const out = render(DIFF, "fa");
  assert.match(out, /تفاوت/);
  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, />کپی<\/button>/);
});

test("idBase keeps safe letters and falls back to a text-derived id", () => {
  assert.equal(idBase("example", "x"), "example");
  assert.equal(idBase("My Block!", "x"), "My-Block");
  assert.equal(idBase("   ", "a"), idBase(undefined, "a"));
  assert.notEqual(idBase(undefined, "a"), idBase(undefined, "b"));
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token --${name}`);
});

test("style.css uses logical properties and keeps the hidden button hidden", () => {
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.diff-block-copy\[hidden\] \{\n {2}display: none;\n\}/);
});

test("style.css names both kinds without colour alone", () => {
  assert.match(css, /\.diff-block-added > \.diff-block-marker \{[^}]*color: var\(--color-success\)/s);
  assert.match(css, /\.diff-block-removed > \.diff-block-marker \{[^}]*color: var\(--color-danger\)/s);
  assert.match(css, /\.diff-block-removed > \.diff-block-text \{[^}]*text-decoration: line-through/s);
});

/** A button with the attributes the component renders and a click listener that tests can fire. */
function fakeButton(hidden = true): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden,
    textContent: "Copy",
    dataset: { diff: "publish:\n  dir: dist\nkeep:", copied: "Copied", copyFailed: "Press Ctrl+C" },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    click() {
      for (const listener of listeners) listener();
    },
  };
}

/** Clipboard and timers the island uses, with the scheduled resets kept for the test to run. */
function fakeEnv(clipboard?: Clipboard): CopyEnv & { resets: Array<() => void>; written: string[] } {
  const written: string[] = [];
  const resets: Array<() => void> = [];
  return {
    clipboard,
    written,
    resets,
    schedule(callback) {
      resets.push(callback);
      return undefined;
    },
  };
}

test("without a clipboard the island leaves the button hidden", () => {
  const button = fakeButton();
  activate(button, fakeEnv(undefined));
  assert.equal(button.hidden, true);
});

test("with a clipboard the island reveals the button and copies the new file", async () => {
  const button = fakeButton();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  activate(button, env);
  assert.equal(button.hidden, false);

  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["publish:\n  dir: dist\nkeep:"]);
  assert.equal(button.textContent, "Copied");
});

test("the button goes back to its label after RESET_MS", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  await copy(button, "Copy", env);

  assert.equal(button.textContent, "Copied");
  assert.equal(RESET_MS, 2000);
  env.resets[0]?.();
  assert.equal(button.textContent, "Copy");
});

test("a failed copy shows the failure message", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.reject(new Error("denied")) });
  await copy(button, "Copy", env);

  assert.equal(button.textContent, "Press Ctrl+C");
});
