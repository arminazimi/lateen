import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps, Page } from "@velella/mizzen/contracts";
import diffBlock, {
  ACTION_CLASS,
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
  STATUS_CLASS,
  TEXT_CLASS,
  actionLabels,
  directive,
  idBase,
} from "../components/diff-block/index.ts";
import { bodyText, copyText, parseDiff, patchText, sourceFilesOf } from "../components/diff-block/lines.ts";
import {
  activate,
  activateAll,
  copy,
  RESET_MS,
  type Clipboard,
  type CopyButton,
  type CopyEnv,
  type CopyStatus,
} from "../components/diff-block/client.ts";

const DIFF = `<pre><code class="language-diff">${[
  "--- a/mizzen.yml",
  "+++ b/mizzen.yml",
  "@@ -1,3 +1,3 @@",
  " publish:",
  "-  dir: build",
  "+  dir: dist",
  " keep:",
].join("\n")}</code></pre>`;

const SOURCE = "publish:\n  dir: dist\nkeep:";
const PATCH = "--- a/mizzen.yml\n+++ b/mizzen.yml\n@@ -1,3 +1,3 @@\n publish:\n-  dir: build\n+  dir: dist\n keep:";

const MULTI_DIFF = [
  "diff --git a/a.txt b/a.txt",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1 +1 @@",
  "-old a",
  "+new a",
  "diff --git a/b.txt b/b.txt",
  "--- a/b.txt",
  "+++ b/b.txt",
  "@@ -1 +1 @@",
  "-old b",
  "+new b",
].join("\n");

function render(html = DIFF, lang = "en", props: Record<string, string> = {}): string {
  const input = { props, html, page: { lang }, site: {} } as unknown as ComponentProps;
  return renderToString(diffBlock(input) as never);
}

/** Render on a page object the test controls, so several blocks share one page and its ids. */
function renderOn(html: string, page: Page, props: Record<string, string> = {}): string {
  const input = { props, html, page, site: {} } as unknown as ComponentProps;
  return renderToString(diffBlock(input) as never);
}

/** A block's group id and the label id the group names. */
function identityOf(out: string): { id: string; labelId: string } {
  const match = new RegExp(`<div class="${GROUP_CLASS}" id="([^"]+)" role="group" aria-labelledby="([^"]+)"`).exec(out);
  assert.ok(match, `expected a labelled group: ${out}`);
  return { id: match[1]!, labelId: match[2]! };
}

/** Every id in a rendered block, in document order. */
function idsOf(out: string): string[] {
  return [...out.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
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

test("parseDiff reads +, -, space, and plain lines, and takes the marker off the display text", () => {
  const lines = parseDiff("+added\n-removed\n context\nplain");
  assert.deepEqual(lines, [
    { kind: "added", text: "added", raw: "+added" },
    { kind: "removed", text: "removed", raw: "-removed" },
    { kind: "context", text: "context", raw: " context" },
    { kind: "context", text: "plain", raw: "plain" },
  ]);
  assert.deepEqual(parseDiff(""), []);
});

test("file headers keep their authored text and paths, and invent none", () => {
  const lines = parseDiff("--- a/x\n+++ b/x\ndiff --git a/x b/x\nindex 1..2\nnew file mode 100644");
  assert.deepEqual(lines, [
    { kind: "file", text: "--- a/x", raw: "--- a/x", file: { oldPath: "a/x" } },
    { kind: "file", text: "+++ b/x", raw: "+++ b/x", file: { newPath: "b/x" } },
    { kind: "file", text: "diff --git a/x b/x", raw: "diff --git a/x b/x", file: { oldPath: "x", newPath: "x" } },
    { kind: "file", text: "index 1..2", raw: "index 1..2" },
    { kind: "file", text: "new file mode 100644", raw: "new file mode 100644" },
  ]);
});

test("a /dev/null side names no path and a deleted file has no old path", () => {
  const created = parseDiff("--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+a\n+b");
  assert.deepEqual(created[0], { kind: "file", text: "--- /dev/null", raw: "--- /dev/null" });
  assert.deepEqual(created[1]?.file, { newPath: "b/new.txt" });

  const deleted = parseDiff("--- a/old.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b");
  assert.deepEqual(deleted[0]?.file, { oldPath: "a/old.txt" });
  assert.deepEqual(deleted[1], { kind: "file", text: "+++ /dev/null", raw: "+++ /dev/null" });
});

test("a hunk header exposes only the ranges and counts the author wrote", () => {
  assert.deepEqual(parseDiff("@@ -1,3 +1,3 @@")[0], {
    kind: "hunk",
    text: "@@ -1,3 +1,3 @@",
    raw: "@@ -1,3 +1,3 @@",
    hunk: { old: { start: 1, count: 3 }, new: { start: 1, count: 3 } },
  });
  assert.deepEqual(parseDiff("@@ -7 +9 @@ function name")[0], {
    kind: "hunk",
    text: "@@ -7 +9 @@ function name",
    raw: "@@ -7 +9 @@ function name",
    hunk: { old: { start: 7 }, new: { start: 9 }, section: "function name" },
  });
  assert.deepEqual(parseDiff("@@ -0,0 +1,2 @@")[0]?.hunk, {
    old: { start: 0, count: 0 },
    new: { start: 1, count: 2 },
  });
});

test("malformed hunk metadata stays text and is marked unknown, never given positions", () => {
  for (const raw of ["@@ -1 +x @@", "@@ -1,2 +3,4", "@@ nonsense @@", "@@"]) {
    const [line] = parseDiff(raw);
    assert.equal(line?.kind, "hunk", raw);
    assert.equal(line?.text, raw, raw);
    assert.equal(line?.hunk, undefined, raw);
    assert.equal(line?.unknown, true, raw);
  }
});

test("the no-newline marker is meta, kept out of the source export", () => {
  const lines = parseDiff("+a\n\\ No newline at end of file");
  assert.deepEqual(lines[1], { kind: "meta", text: "\\ No newline at end of file", raw: "\\ No newline at end of file" });
  assert.equal(copyText(lines), "a");
});

test("copyText is the resulting source: added and context lines, no markers, removed lines, or headers", () => {
  const lines = parseDiff(PATCH);
  assert.equal(copyText(lines), SOURCE);
  assert.equal(copyText([]), "");
});

test("a multi-file diff exports one source per file, never their concatenation", () => {
  const lines = parseDiff(MULTI_DIFF);
  assert.deepEqual(sourceFilesOf(lines), [
    { path: "b/a.txt", text: "new a" },
    { path: "b/b.txt", text: "new b" },
  ]);

  const out = render(MULTI_DIFF);
  assert.equal(out.match(/data-diff-copy="true"/g)?.length, 2);
  assert.equal(out.match(/data-patch-copy="true"/g)?.length, 1);
  assert.ok(out.includes('data-diff="new a"'), "the first file keeps its own source");
  assert.ok(out.includes('data-diff="new b"'), "the second file keeps its own source");
  assert.ok(!out.includes("new a\nnew b"), "the files are never joined into one invalid source");
  assert.match(out, />Copy source: b\/a\.txt<\/button>/);
  assert.match(out, />Copy source: b\/b\.txt<\/button>/);
});

test("patchText reproduces the authored diff exactly, markers and headers included", () => {
  assert.equal(patchText(parseDiff(PATCH)), PATCH);
  assert.equal(patchText(parseDiff("+only\n-removed\n plain")), "+only\n-removed\n plain");
  assert.equal(patchText([]), "");
});

test("empty, new, and deleted files get the right source and patch text", () => {
  assert.equal(copyText(parseDiff("")), "");
  assert.equal(patchText(parseDiff("")), "");

  const created = "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+a\n+b";
  assert.equal(copyText(parseDiff(created)), "a\nb");
  assert.equal(patchText(parseDiff(created)), created);

  const deleted = "--- a/old.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b";
  assert.equal(copyText(parseDiff(deleted)), "");
  assert.equal(patchText(parseDiff(deleted)), deleted);
});

test("the block is a group labelled by a visually hidden Diff span, around an ordered list", () => {
  const out = render();
  const base = idBase(undefined, DIFF);
  assert.match(
    out,
    new RegExp(`^<div class="${GROUP_CLASS}" id="${base}" role="group" aria-labelledby="${base}-label"`),
  );
  assert.match(out, new RegExp(`<span class="${SR_CLASS}" id="${base}-label">Diff</span>`));
  assert.match(out, new RegExp(`<ol class="${LIST_CLASS}">`));
});

test("repeated diff content gets unique group and label ids in document order", () => {
  const page = { lang: "en" } as unknown as Page;
  const base = idBase(undefined, DIFF);
  const one = renderOn(DIFF, page);
  const two = renderOn(DIFF, page);

  assert.deepEqual(identityOf(one), { id: base, labelId: `${base}-label` });
  assert.deepEqual(identityOf(two), { id: `${base}-2`, labelId: `${base}-2-label` });
  for (const out of [one, two]) {
    const { labelId } = identityOf(out);
    assert.ok(out.includes(`<span class="${SR_CLASS}" id="${labelId}">Diff</span>`), "each group names its own label");
  }
  const all = [...idsOf(one), ...idsOf(two)];
  assert.equal(new Set(all).size, all.length, "no id repeats");
});

test("explicit and slug-equivalent ids are numbered per page, and label ids are reserved", () => {
  const page = { lang: "en" } as unknown as Page;
  const one = renderOn(DIFF, page, { id: "My Block!" });
  const sameSlug = renderOn(DIFF, page, { id: "My-Block" });
  const again = renderOn(DIFF, page, { id: "My Block!" });
  const first = renderOn(DIFF, page, { id: "notice" });
  const labelClash = renderOn(DIFF, page, { id: "notice-label" });

  assert.deepEqual(identityOf(one), { id: "My-Block", labelId: "My-Block-label" });
  assert.deepEqual(identityOf(sameSlug), { id: "My-Block-2", labelId: "My-Block-2-label" });
  assert.deepEqual(identityOf(again), { id: "My-Block-3", labelId: "My-Block-3-label" });
  assert.deepEqual(identityOf(first), { id: "notice", labelId: "notice-label" });
  assert.deepEqual(identityOf(labelClash), { id: "notice-label-2", labelId: "notice-label-2-label" });

  const all = [one, sameSlug, again, first, labelClash].flatMap(idsOf);
  assert.equal(new Set(all).size, all.length);
});

test("Unicode ids survive and are numbered per page", () => {
  const page = { lang: "fa", dir: "rtl" } as unknown as Page;
  const one = renderOn(DIFF, page, { id: "تفاوت" });
  const two = renderOn(DIFF, page, { id: "تفاوت" });

  assert.deepEqual(identityOf(one), { id: "تفاوت", labelId: "تفاوت-label" });
  assert.deepEqual(identityOf(two), { id: "تفاوت-2", labelId: "تفاوت-2-label" });
  const all = [...idsOf(one), ...idsOf(two)];
  assert.equal(new Set(all).size, all.length);
});

test("allocator state never crosses pages, and a fresh page is deterministic", () => {
  const first = identityOf(renderOn(DIFF, { lang: "en" } as Page));
  const second = identityOf(renderOn(DIFF, { lang: "en" } as Page));

  assert.deepEqual(first, second);
  assert.equal(first.id, idBase(undefined, DIFF), "each page's first block keeps the published id");
});

test("an authored id cannot inject markup or collide with a label id", () => {
  const page = { lang: "en" } as unknown as Page;
  const ordinary = renderOn(DIFF, page, { id: "block" });
  const injected = renderOn(DIFF, page, { id: 'a"><script>alert(1)</script>' });
  const labelClash = renderOn(DIFF, page, { id: "block-label" });

  assert.doesNotMatch(injected, /<script|onload=/i);
  assert.deepEqual(identityOf(injected), { id: "a-script-alert-1-script", labelId: "a-script-alert-1-script-label" });
  assert.deepEqual(identityOf(labelClash), { id: "block-label-2", labelId: "block-label-2-label" });
  const all = [...idsOf(ordinary), ...idsOf(injected), ...idsOf(labelClash)];
  assert.equal(new Set(all).size, all.length);
});

test("a repeated block keeps every line kind and both export payloads unchanged", () => {
  const diff = [
    "diff --git a/a.txt b/a.txt",
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -1,2 +1,2 @@",
    "-old",
    "+new",
    " keep",
    "\\ No newline at end of file",
  ].join("\n");
  const page = { lang: "en" } as unknown as Page;
  const one = renderOn(diff, page);
  const two = renderOn(diff, page);

  for (const out of [one, two]) {
    for (const kind of ["added", "removed", "context", "file", "hunk", "meta"]) {
      assert.match(out, new RegExp(`data-kind="${kind}"`), `${kind} line is kept`);
    }
    assert.ok(out.includes('data-diff="new\nkeep"'), "the source payload is unchanged");
    assert.ok(out.includes(`data-patch="${diff}"`), "the patch payload is unchanged");
    assert.match(out, />Copy source<\/button>/);
    assert.match(out, />Copy patch<\/button>/);
  }
  assert.equal(one.match(/data-diff-copy="true"/g)?.length, two.match(/data-diff-copy="true"/g)?.length);
  assert.equal(new Set([...idsOf(one), ...idsOf(two)]).size, 4, "one group id and one label id per block");
});

test("each line carries its kind class and a machine-readable kind", () => {
  const out = render();
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}" data-kind="file" data-file-old="a/mizzen.yml">`));
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}" data-kind="file" data-file-new="b/mizzen.yml">`));
  assert.match(
    out,
    new RegExp(
      `<li class="${LINE_CLASS} ${CONTEXT_CLASS}" data-kind="hunk" data-hunk-old-start="1" data-hunk-old-count="3" data-hunk-new-start="1" data-hunk-new-count="3">`,
    ),
  );
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}" data-kind="context">`));
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${REMOVED_CLASS}" data-kind="removed">`));
  assert.match(out, new RegExp(`<li class="${LINE_CLASS} ${ADDED_CLASS}" data-kind="added">`));
  assert.equal(out.match(new RegExp(`<li class="${LINE_CLASS}`, "g"))?.length, 7);
});

test("a malformed hunk shows its text and marks its metadata unknown in the markup", () => {
  const out = render('<pre><code class="language-diff">@@ -1 +x @@\n+a</code></pre>');
  assert.match(out, /data-kind="hunk" data-hunk-unknown="true"/);
  assert.doesNotMatch(out, /data-hunk-old-start/);
  assert.match(out, /@@ -1 \+x @@/);
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
});

test("context lines have no kind prefix", () => {
  const out = render();
  assert.match(
    out,
    new RegExp(`<li class="${LINE_CLASS} ${CONTEXT_CLASS}" data-kind="context"><span class="${MARKER_CLASS}" aria-hidden="true"></span><span class="${TEXT_CLASS}">publish:</span>`),
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

test("two hidden copy actions carry the source and the authored patch", () => {
  const out = render();
  assert.match(out, new RegExp(`<div class="${BAR_CLASS}">`));
  assert.equal(out.match(new RegExp(`<span class="${ACTION_CLASS}">`, "g"))?.length, 2);

  assert.match(out, new RegExp(`<button type="button" class="${COPY_CLASS}" hidden data-diff-copy="true"`));
  assert.match(out, new RegExp(`<button type="button" class="${COPY_CLASS}" hidden data-patch-copy="true"`));
  assert.ok(out.includes(`data-diff="${SOURCE}"`), "the source text is on the source button");
  assert.ok(out.includes(`data-patch="${PATCH}"`), "the authored patch is on the patch button");
  assert.match(out, />Copy source<\/button>/);
  assert.match(out, />Copy patch<\/button>/);
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Press Ctrl\+C"/);
});

test("each action has its own live status region", () => {
  const out = render();
  const statuses = out.match(new RegExp(`<span class="${SR_CLASS} ${STATUS_CLASS}" role="status" data-diff-status="true"></span>`, "g"));
  assert.equal(statuses?.length, 2);
});

test("without JavaScript the lines, the kinds, and both exports are in the markup", () => {
  const out = render();
  assert.match(out, /publish:/);
  assert.match(out, /  dir: dist/);
  assert.match(out, /data-kind="added"/);
  assert.equal(out.match(/ hidden /g)?.length, 2, "both copy buttons stay hidden without JavaScript");
  assert.ok(out.includes(`data-diff="${SOURCE}"`));
  assert.ok(out.includes(`data-patch="${PATCH}"`));
});

test("the labels and copy messages follow the page language", () => {
  const out = render(DIFF, "fa");
  assert.match(out, /تفاوت/);
  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, />کپی نتیجه<\/button>/);
  assert.match(out, />کپی وصله<\/button>/);
  assert.deepEqual(actionLabels("fa-IR"), actionLabels("fa"));
  assert.deepEqual(actionLabels("xx"), actionLabels("en"));
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

test("style.css uses logical properties and keeps the hidden buttons hidden", () => {
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.diff-block-copy\[hidden\] \{\n {2}display: none;\n\}/);
  assert.match(css, /\.diff-block-bar \{[^}]*gap: var\(--space-2\)/s);
});

test("style.css names both kinds without colour alone", () => {
  assert.match(css, /\.diff-block-added > \.diff-block-marker \{[^}]*color: var\(--color-success\)/s);
  assert.match(css, /\.diff-block-removed > \.diff-block-marker \{[^}]*color: var\(--color-danger\)/s);
  assert.match(css, /\.diff-block-removed > \.diff-block-text \{[^}]*text-decoration: line-through/s);
});

/** A button with the attributes the component renders, its own live region, and a click the test fires. */
function fakeButton(kind: "source" | "patch" = "source", hidden = true): CopyButton & {
  click(): void;
  status: CopyStatus;
  parentElement: { querySelector(selector: string): CopyStatus | null } | null;
} {
  const listeners: Array<() => void> = [];
  const status: CopyStatus = { textContent: "" };
  return {
    hidden,
    textContent: kind === "source" ? "Copy source" : "Copy patch",
    status,
    parentElement: null,
    dataset:
      kind === "source"
        ? { diff: SOURCE, copied: "Source copied", copyFailed: "Press Ctrl+C" }
        : { patch: PATCH, copied: "Patch copied", copyFailed: "Press Ctrl+C" },
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

test("without a clipboard the island leaves both buttons hidden", () => {
  for (const kind of ["source", "patch"] as const) {
    const button = fakeButton(kind);
    activate(button, fakeEnv(undefined), button.status);
    assert.equal(button.hidden, true);
  }
});

test("with a clipboard each action reveals and copies its own text", async () => {
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  const source = fakeButton("source");
  const patch = fakeButton("patch");
  activate(source, env, source.status);
  activate(patch, env, patch.status);
  assert.equal(source.hidden, false);
  assert.equal(patch.hidden, false);

  source.click();
  patch.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, [SOURCE, PATCH]);
  assert.equal(source.textContent, "Source copied");
  assert.equal(patch.textContent, "Patch copied");
  assert.equal(source.status.textContent, "Source copied");
  assert.equal(patch.status.textContent, "Patch copied");
});

test("the button goes back to its label after RESET_MS", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  await copy(button, "Copy source", env, button.status);

  assert.equal(button.textContent, "Source copied");
  assert.equal(button.status.textContent, "Source copied");
  assert.equal(RESET_MS, 2000);
  env.resets[0]?.();
  assert.equal(button.textContent, "Copy source");
  assert.equal(button.status.textContent, "");
});

test("a failed copy shows the failure message on its own action", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.reject(new Error("denied")) });
  await copy(button, "Copy source", env, button.status);

  assert.equal(button.textContent, "Press Ctrl+C");
  assert.equal(button.status.textContent, "Press Ctrl+C");
});

test("two pending actions announce their own result, whichever finishes first", async () => {
  let resolveSource: (() => void) | undefined;
  let resolvePatch: (() => void) | undefined;
  const source = fakeButton("source");
  const patch = fakeButton("patch");
  const env = fakeEnv({
    writeText(text) {
      return new Promise<void>((resolve) => {
        if (text === SOURCE) resolveSource = resolve;
        else resolvePatch = resolve;
      });
    },
  });
  activate(source, env, source.status);
  activate(patch, env, patch.status);

  source.click();
  patch.click();
  resolvePatch?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(patch.status.textContent, "Patch copied");
  assert.equal(source.status.textContent, "", "the patch result must not land on the source action");

  resolveSource?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(source.status.textContent, "Source copied");
  assert.equal(patch.status.textContent, "Patch copied");
});

test("an older copy cannot overwrite the newer result on the same button", async () => {
  const button = fakeButton();
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const env = fakeEnv({
    writeText() {
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
  });
  activate(button, env, button.status);

  button.click();
  pending[0]?.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  button.click();
  pending[1]?.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.status.textContent, "Source copied");

  env.resets[0]?.();
  assert.equal(button.status.textContent, "Source copied", "the older reset must not clear the newer result");

  env.resets[1]?.();
  assert.equal(button.status.textContent, "");
});

test("a stale failure never overwrites a newer success", async () => {
  const button = fakeButton();
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const env = fakeEnv({
    writeText() {
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
  });
  activate(button, env, button.status);

  button.click();
  button.click();
  pending[1]?.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.status.textContent, "Source copied");

  pending[0]?.reject(new Error("late"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.status.textContent, "Source copied", "the stale failure must be dropped");
});

test("activateAll pairs every button with the status region in its own wrapper", () => {
  const source = fakeButton("source");
  const patch = fakeButton("patch");
  const doc = {
    querySelectorAll(selector: string) {
      assert.equal(selector, "[data-diff-copy], [data-patch-copy]");
      return [source, patch];
    },
  };
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  const wrappers = new Map<CopyButton, { querySelector(selector: string): CopyStatus | null }>([
    [source, { querySelector: () => source.status }],
    [patch, { querySelector: () => patch.status }],
  ]);
  for (const button of [source, patch]) {
    Object.defineProperty(button, "parentElement", { value: wrappers.get(button) });
  }
  activateAll(doc, env);
  assert.equal(source.hidden, false);
  assert.equal(patch.hidden, false);
});

test("the copy buttons are native buttons, so Enter and Space activate them", () => {
  const out = render();
  for (const match of out.matchAll(/<button ([^>]*)>/g)) {
    const attributes = match[1] ?? "";
    assert.match(attributes, /type="button"/);
    assert.doesNotMatch(attributes, /tabindex="-1"/);
    assert.doesNotMatch(attributes, /disabled/);
  }
});
