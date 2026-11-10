import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import terminal, { bodyText, commandsOf, directive, parseLines } from "../components/terminal/index.ts";
import { activate, copy, RESET_MS, type Clipboard, type CopyButton, type CopyEnv } from "../components/terminal/client.ts";

function render(html: string, lang = "en"): string {
  const input = { props: {}, html, page: { lang }, site: {} } as unknown as ComponentProps;
  return renderToString(terminal(input) as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/terminal/style.css", import.meta.url), "utf8");

const SESSION = "<p>$ npm ci\nadded 200 packages\n$ npm run check\n&lt;ok&gt; all gates passed</p>";

test("the directive is terminal and the default export is a component", () => {
  assert.equal(directive, "terminal");
  assert.equal(typeof terminal, "function");
});

test("bodyText keeps line breaks, drops tags, and decodes entities", () => {
  assert.equal(bodyText("<p>a<br>b &amp; c</p>\n<p>d &lt;e&gt; &quot;f&quot; &#39;g&#39;</p>"), 'a\nb & c\n\nd <e> "f" \'g\'');
  assert.equal(bodyText('<pre data-src="a.md:1"><code class="language-sh">$ ls\nout\n</code></pre>'), "$ ls\nout");
});

test("bodyText drops tags that a first pass would rebuild", () => {
  assert.doesNotMatch(bodyText("<scrip<script>t>alert(1)"), /<[^>]*>/);
  assert.doesNotMatch(bodyText("<<b>b>x<<i>/i>"), /<[^>]*>/);
});

test("parseLines marks $ lines as commands and strips the prompt and one space", () => {
  assert.deepEqual(parseLines("$ npm ci\nadded\n$ \n$npm test"), [
    { kind: "command", text: "npm ci" },
    { kind: "output", text: "added" },
    { kind: "command", text: "" },
    { kind: "command", text: "npm test" },
  ]);
  assert.deepEqual(parseLines(""), []);
});

test("commandsOf joins only the commands, one per line", () => {
  const lines = parseLines("$ npm ci\nadded 200 packages\n$ npm run check\nall gates passed");
  assert.equal(commandsOf(lines), "npm ci\nnpm run check");
});

test("each command shows its prompt, hidden from assistive tech; output has none", () => {
  const out = render(SESSION);

  assert.match(out, /<span class="terminal-line terminal-command"><span class="terminal-prompt" aria-hidden="true">\$ <\/span><span class="terminal-text">npm ci<\/span><\/span>/);
  assert.match(out, /<span class="terminal-line terminal-output">added 200 packages<\/span>/);
  assert.doesNotMatch(out, /terminal-output">\$/);
});

test("the session is a focusable pre with the lines inside, under the terminal frame", () => {
  const out = render(SESSION);

  assert.match(out, /^<div class="terminal">/);
  assert.match(out, /<pre class="terminal-body" tabindex="0"><code>/);
});

test("the copy button starts hidden and carries only the commands", () => {
  const out = render(SESSION);

  assert.match(out, /<button type="button" class="terminal-copy" hidden data-terminal-copy="true" data-commands="npm ci\nnpm run check"/);
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Press Ctrl\+C"/);
  assert.match(out, />Copy<\/button>/);
});

test("a session with no commands has no copy button", () => {
  const out = render("<p>just output</p>");

  assert.doesNotMatch(out, /terminal-copy/);
  assert.match(out, /terminal-output">just output/);
});

test("the copy button takes its label and messages from the page language", () => {
  const out = render(SESSION, "fa");

  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, /data-copy-failed="Ctrl\+C را بزنید"/);
  assert.match(out, />کپی<\/button>/);
});

test("HTML in the session stays text, never markup", () => {
  const out = render("<p>$ echo &lt;b&gt;hi&lt;/b&gt;</p>");

  assert.match(out, /<span class="terminal-text">echo &lt;b>hi&lt;\/b><\/span>/);
  assert.doesNotMatch(out, /<b>/);
});

test("a fenced block inside the directive is read the same way", () => {
  const out = render('<pre data-src="a.md:2"><code class="language-sh">$ npm ci\nadded\n</code></pre>');

  assert.match(out, /data-commands="npm ci"/);
  assert.match(out, /terminal-output">added</);
});

/** A button with the attributes the frame renders and a click listener that tests can fire. */
function fakeButton(hidden = true): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden,
    textContent: "Copy",
    dataset: { commands: "npm ci\nnpm run check", copied: "Copied", copyFailed: "Press Ctrl+C" },
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

test("with a clipboard the island reveals the button and copies only the commands", async () => {
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

  assert.deepEqual(env.written, ["npm ci\nnpm run check"]);
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

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states the block in logical properties and keeps the hidden button hidden", () => {
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.terminal-copy\[hidden\] \{\n {2}display: none;\n\}/);
});

test("style.css scrolls the session inside the block, never the page", () => {
  assert.match(css, /\.terminal-body \{[^}]*overflow-x: auto;/);
});
