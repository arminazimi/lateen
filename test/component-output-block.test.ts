import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import outputBlock, {
  BAR_CLASS,
  BLOCK_CLASS,
  BODY_CLASS,
  COPY_CLASS,
  directive,
  LABEL_KEY,
  outputText,
  STATUS_CLASS,
  type OutputBlockProps,
} from "../components/output-block/index.ts";
import {
  activate,
  activateAll,
  copy,
  RESET_MS,
  STATUS_SELECTOR,
  type Clipboard,
  type CopyButton,
  type CopyDocument,
  type CopyEnv,
  type CopyParent,
  type CopyStatus,
} from "../components/output-block/client.ts";

/** The props the render host passes: directive attributes, the page, and the rendered body. */
function input(html: string, lang = "en", props: OutputBlockProps = {}): ComponentProps<OutputBlockProps> {
  return { props, html, page: { lang }, site: {} } as unknown as ComponentProps<OutputBlockProps>;
}

function render(html: string, lang = "en", props: OutputBlockProps = {}): string {
  return renderToString(outputBlock(input(html, lang, props)) as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/output-block/style.css", import.meta.url), "utf8");

const OUTPUT = "<p>Written 12 pages\nin 340 ms</p>";

test("the directive is output-block and the default export is a component", () => {
  assert.equal(directive, "output-block");
  assert.equal(typeof outputBlock, "function");
});

test("the block is a named group whose default label is Output", () => {
  const out = render(OUTPUT);

  assert.match(out, /^<div class="output-block" role="group" aria-label="Output">/);
  assert.equal(labelsOf(out), "Output");
  assert.equal(LABEL_KEY, "output");
});

test("the label option overrides the default, and a blank one falls back to it", () => {
  assert.equal(labelsOf(render(OUTPUT, "en", { label: "Build result" })), "Build result");
  assert.equal(labelsOf(render(OUTPUT, "en", { label: "   " })), "Output");
});

test("the default label follows the page language", () => {
  const out = render(OUTPUT, "fa");

  assert.equal(labelsOf(out), "خروجی");
  assert.match(out, />کپی<\/button>/);
});

test("the body has its own class, so it is distinct from input code", () => {
  const out = render(OUTPUT);

  assert.match(out, /<pre class="output-block-body" tabindex="0"><code>/);
  assert.doesNotMatch(out, /class="code"/);
});

test("the copy button starts hidden and carries the whole output", () => {
  const out = render(OUTPUT);

  assert.match(
    out,
    /<button type="button" class="output-block-copy" hidden data-output-copy="true" data-output="Written 12 pages\nin 340 ms"/,
  );
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Copy failed\. Select the text and copy it by hand\."/);
  assert.match(out, />Copy<\/button>/);
  assert.match(out, /<span class="output-block-status" role="status" data-output-status="true"><\/span>/);
});

test("the status region is beside the button and empty until a copy", () => {
  const out = render(OUTPUT);

  assert.match(out, new RegExp(`<span class="${STATUS_CLASS}" role="status" data-output-status="true"></span>`));
  assert.match(out, new RegExp(`class="${BAR_CLASS}"`));
});

test("a body that holds nothing but whitespace renders nothing", () => {
  assert.equal(outputBlock(input("")), null);
  assert.equal(outputBlock(input("<p>   </p>")), null);
  assert.equal(outputBlock(input("\n\n")), null);
});

test("outputText keeps line breaks, drops tags, and decodes entities", () => {
  assert.equal(outputText("<p>a<br>b &amp; c</p>"), "a\nb & c");
  assert.equal(outputText('<pre data-src="a.md:2"><code>line\n</code></pre>'), "line");
  assert.equal(outputText("<p>   </p>"), "");
});

test("HTML in the output stays text, never markup", () => {
  const out = render("<p>&lt;b&gt;hi&lt;/b&gt; &amp; done</p>");

  assert.match(out, /<code>&lt;b>hi&lt;\/b> &amp; done<\/code>/);
  assert.doesNotMatch(out, /<b>/);
});

test("without JavaScript the output is fully visible and the button stays hidden", () => {
  const out = render(OUTPUT);

  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/);
  assert.match(out, /class="output-block-copy" hidden/);
});

/** The `aria-label` of the group, as the rendered HTML carries it. */
function labelsOf(html: string): string | undefined {
  return /role="group" aria-label="([^"]*)"/.exec(html)?.[1];
}

/** A button with the attributes the frame renders and a click listener the test can fire. */
function fakeButton(output = "Written 12 pages\nin 340 ms"): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden: true,
    dataset: { output, copied: "Copied", copyFailed: "Copy failed" },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    click() {
      for (const listener of listeners) listener();
    },
  };
}

function fakeStatus(textContent = ""): CopyStatus {
  return { textContent };
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

test("the island copies the output text and nothing else", async () => {
  const button = fakeButton("line one\nline two");
  const status = fakeStatus();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  activate(button, status, env);
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["line one\nline two"]);
  assert.equal(status.textContent, "Copied");
});

test("without a clipboard the island leaves the button hidden", () => {
  const button = fakeButton();
  const env = fakeEnv(undefined);
  activate(button, fakeStatus(), env);

  assert.equal(button.hidden, true);
  button.click();
  assert.deepEqual(env.written, []);
});

test("the status goes back to empty after RESET_MS", async () => {
  const status = fakeStatus();
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  await copy(fakeButton(), status, env);

  assert.equal(status.textContent, "Copied");
  assert.equal(RESET_MS, 2000);
  env.resets[0]?.();
  assert.equal(status.textContent, "");
});

test("a failed copy reports the failure in the status", async () => {
  const status = fakeStatus();
  const env = fakeEnv({ writeText: () => Promise.reject(new Error("denied")) });
  await copy(fakeButton(), status, env);

  assert.equal(status.textContent, "Copy failed");
});

test("activateAll wires each button to the status region beside it", () => {
  const status = fakeStatus();
  const parent: CopyParent = {
    querySelector(selector) {
      assert.equal(selector, STATUS_SELECTOR);
      return status;
    },
  };
  const button = Object.assign(fakeButton(), { parentElement: parent });
  const doc: CopyDocument = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-output-copy]");
      return [button];
    },
  };
  activateAll(doc, fakeEnv({ writeText: () => Promise.resolve() }));

  assert.equal(button.hidden, false);
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
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{`));
  assert.match(css, new RegExp(`\\.${BODY_CLASS} \\{`));
  assert.match(css, new RegExp(`\\.${COPY_CLASS}\\[hidden\\] \\{[\\s\\S]*?display: none;`));
});

test("style.css sets the block apart from input code with a dashed edge and the surface color", () => {
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{[^}]*border: 1px dashed var\\(--code-border\\);`));
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{[^}]*background-color: var\\(--color-surface\\);`));
});

test("style.css scrolls the output inside the block, never the page", () => {
  assert.match(css, new RegExp(`\\.${BODY_CLASS} \\{[^}]*overflow-x: auto;`));
});
