import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import code from "../components/code/index.ts";
import {
  activate,
  BAR_CLASS,
  BUTTON_CLASS,
  copyText,
  RESET_MS,
  STATUS_CLASS,
  type Clipboard,
  type CopyBlock,
  type CopyDocument,
  type CopyEnv,
  type CopyNode,
} from "../components/code/client.ts";

const FAILED = "Copy failed. Select the code and copy it by hand.";
const COPIED = "Copied.";

/** An element as the island builds and reads it: attributes, children, listeners, and text. */
class FakeNode implements CopyNode {
  readonly attrs: Record<string, string> = {};
  readonly children: Array<FakeNode | string> = [];
  readonly listeners: Array<() => void> = [];
  textContent: string | null = null;
  readonly tag: string;

  constructor(tag: string) {
    this.tag = tag;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attrs[name];
  }

  append(...children: Array<CopyNode | string>): void {
    for (const child of children) this.children.push(child as FakeNode | string);
  }

  addEventListener(type: "click", listener: () => void): void {
    assert.equal(type, "click");
    this.listeners.push(listener);
  }

  click(): void {
    for (const listener of this.listeners) listener();
  }

  hasAttr(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }
}

/** A `pre.code` block with its `code` element and the nodes inserted before it. */
class FakeBlock implements CopyBlock {
  readonly code: FakeNode | null;
  readonly inserted: FakeNode[] = [];
  private readonly attrs: Record<string, string>;

  constructor(attrs: Record<string, string>, text: string | null, hasCode = true) {
    this.attrs = attrs;
    this.code = hasCode ? new FakeNode("code") : null;
    if (this.code) this.code.textContent = text;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  querySelector(selector: string): { textContent: string | null } | null {
    assert.equal(selector, "code");
    return this.code;
  }

  before(node: CopyNode): void {
    this.inserted.push(node as FakeNode);
  }
}

/** A document with a list of code blocks; `createElement` makes the nodes the island adds. */
class FakeDoc implements CopyDocument {
  readonly blocks: FakeBlock[];

  constructor(blocks: FakeBlock[]) {
    this.blocks = blocks;
  }

  createElement(tag: string): FakeNode {
    return new FakeNode(tag);
  }

  createElementNS(_namespace: string, tag: string): FakeNode {
    return new FakeNode(tag);
  }

  querySelectorAll(selector: string): FakeBlock[] {
    assert.equal(selector, "pre.code");
    return this.blocks;
  }
}

/** A clipboard that records what was written and succeeds or fails as asked. */
function clipboard(mode: "ok" | "reject" | "throw" = "ok"): Clipboard & { written: string[] } {
  const fake = {
    written: [] as string[],
    writeText(text: string): Promise<void> {
      if (mode === "throw") throw new Error("denied");
      fake.written.push(text);
      return mode === "ok" ? Promise.resolve() : Promise.reject(new Error("denied"));
    },
  };
  return fake;
}

/** Timers the island schedules, run by the test when it wants the reset to happen. */
function timers(): { schedule: CopyEnv["schedule"]; pending: Array<{ callback: () => void; ms: number }> } {
  const pending: Array<{ callback: () => void; ms: number }> = [];
  return {
    pending,
    schedule(callback: () => void, ms: number) {
      pending.push({ callback, ms });
      return pending.length;
    },
  };
}

/** Lets every queued promise callback run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** One block on a page with a copy-capable environment, activated and ready to click. */
function page(text: string, lang: string | undefined, clip: Clipboard | undefined) {
  const attrs: Record<string, string> = lang === undefined ? {} : { "data-lang": lang };
  const block = new FakeBlock(attrs, text);
  const doc = new FakeDoc([block]);
  const clock = timers();
  const env: CopyEnv = { clipboard: clip, schedule: clock.schedule };
  activate(doc, env);
  const bar = block.inserted[0]!;
  const button = bar.children[0] as FakeNode;
  const status = bar.children[1] as FakeNode;
  const [copyIcon, checkIcon] = button.children as FakeNode[];
  return { block, doc, bar, button, status, copyIcon: copyIcon!, checkIcon: checkIcon!, clock };
}

test("copyText keeps a plain block as written, whatever its language", () => {
  assert.equal(copyText("const a = 1;\n", "ts"), "const a = 1;\n");
  assert.equal(copyText("$x = 1;\n", "perl"), "$x = 1;\n");
  assert.equal(copyText("+ kept\n", undefined), "+ kept\n");
});

test("copyText drops headers and removed lines from a diff and takes off the + and space markers", () => {
  const diff = "--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;";
  assert.equal(copyText(diff, "diff"), "const a = 1;\nconst b = 3;");
  assert.equal(copyText(diff, "Diff"), "const a = 1;\nconst b = 3;");
});

test("copyText takes the prompt off each shell line and keeps the command", () => {
  assert.equal(copyText("$ npm ci\n% npm run check\n  $ ls", "bash"), "npm ci\nnpm run check\n  ls");
  assert.equal(copyText("$ npm ci", "shell"), "npm ci");
});

test("copyText takes the Python prompts off and keeps the code", () => {
  assert.equal(copyText(">>> x = 1\n... y = 2\nprint(x)", "python"), "x = 1\ny = 2\nprint(x)");
});

test("the server output has no copy control: it appears only when the island runs", () => {
  const input = { props: { lang: "ts" }, html: "const a = 1;", page: {}, site: {} };
  const out = renderToString(code(input as unknown as ComponentProps<never>) as never);
  assert.doesNotMatch(out, /code-copy/);
  assert.doesNotMatch(out, /<button/);
});

test("activate adds one control above each code block, with the copy icon showing", () => {
  const block = new FakeBlock({ "data-lang": "ts" }, "const a = 1;");
  const doc = new FakeDoc([block]);
  activate(doc, { clipboard: clipboard(), schedule: timers().schedule });

  assert.equal(block.inserted.length, 1);
  const bar = block.inserted[0]!;
  assert.equal(bar.tag, "div");
  assert.equal(bar.attrs.class, BAR_CLASS);

  const button = bar.children[0] as FakeNode;
  assert.equal(button.tag, "button");
  assert.equal(button.attrs.type, "button");
  assert.equal(button.attrs.class, BUTTON_CLASS);
  assert.equal(button.attrs["aria-label"], "Copy code");

  const [copyIcon, checkIcon] = button.children as FakeNode[];
  assert.equal(copyIcon!.hasAttr("hidden"), false);
  assert.equal(checkIcon!.hasAttr("hidden"), true);
  assert.equal(copyIcon!.attrs["aria-hidden"], "true");
});

test("the live message is a status region that starts empty", () => {
  const { status } = page("x", undefined, clipboard());
  assert.equal(status.attrs.class, STATUS_CLASS);
  assert.equal(status.attrs.role, "status");
  assert.equal(status.textContent, "");
});

test("a block the island cannot read is left alone", () => {
  const block = new FakeBlock({}, null, false);
  activate(new FakeDoc([block]), { clipboard: clipboard(), schedule: timers().schedule });
  assert.equal(block.inserted.length, 0);
});

test("a click copies the code, shows Copied with the check icon, and resets after RESET_MS", async () => {
  const clip = clipboard();
  const { button, status, copyIcon, checkIcon, clock } = page("const a = 1;", "ts", clip);

  button.click();
  await flush();

  assert.deepEqual(clip.written, ["const a = 1;"]);
  assert.equal(status.textContent, COPIED);
  assert.equal(copyIcon.hasAttr("hidden"), true);
  assert.equal(checkIcon.hasAttr("hidden"), false);

  assert.equal(clock.pending.length, 1);
  assert.equal(clock.pending[0]!.ms, RESET_MS);
  clock.pending[0]!.callback();

  assert.equal(status.textContent, "");
  assert.equal(copyIcon.hasAttr("hidden"), false);
  assert.equal(checkIcon.hasAttr("hidden"), true);
});

test("a click copies the block without diff markers when the block is a diff", async () => {
  const clip = clipboard();
  const { button } = page("--- a\n+++ b\n-old\n+new", "diff", clip);
  button.click();
  await flush();
  assert.deepEqual(clip.written, ["new"]);
});

test("a rejected write shows the fallback message and leaves the copy icon in place", async () => {
  const { button, status, copyIcon, checkIcon } = page("x", "ts", clipboard("reject"));
  button.click();
  await flush();

  assert.equal(status.textContent, FAILED);
  assert.equal(copyIcon.hasAttr("hidden"), false);
  assert.equal(checkIcon.hasAttr("hidden"), true);
});

test("a write that throws at once shows the fallback message", async () => {
  const { button, status } = page("x", "ts", clipboard("throw"));
  button.click();
  await flush();
  assert.equal(status.textContent, FAILED);
});

test("without a clipboard, a click shows the fallback message and writes nothing", async () => {
  const { button, status } = page("x", "ts", undefined);
  button.click();
  await flush();
  assert.equal(status.textContent, FAILED);
});

test("a second click keeps the newest message: the first click's reset does not clear it", async () => {
  const clip = clipboard();
  const { button, status, clock } = page("x", "ts", clip);

  button.click();
  await flush();
  button.click();
  await flush();

  assert.equal(clock.pending.length, 2);
  clock.pending[0]!.callback();
  assert.equal(status.textContent, COPIED);

  clock.pending[1]!.callback();
  assert.equal(status.textContent, "");
});
