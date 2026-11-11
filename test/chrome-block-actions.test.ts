import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Fragment } from "preact";
import type { ChromeProps, LayoutProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import doc from "../layouts/doc.ts";
import blockActions from "../chrome/block-actions/index.ts";
import {
  activate,
  blockId,
  cleanText,
  copy,
  isNested,
  MAX_TEXT,
  parseSpan,
  promptFor,
  promptText,
  RESET_MS,
  topLevel,
  type ActionButton,
  type ActionTemplate,
  type ActivateEnv,
  type BlockElement,
  type Clipboard,
} from "../chrome/block-actions/client.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

function siteConfig(): SiteConfig {
  return {
    title: "Example",
    base: "/example",
    lang: "en",
    dir: "ltr",
    languages: [],
    source: ".",
    include: [],
    exclude: [],
    navigation: "_data/navigation.yml",
    defaults: [],
    theme: { options: {} },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

const trail: Trail = [];
const pager: Pager = {};

function pageWith(lang = "en", dir: Page["dir"] = "ltr"): Page {
  return {
    url: "/example/guide/install/",
    source: pos,
    frontMatter: { title: "Install" },
    title: "Install",
    lang,
    dir,
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
  };
}

function props(page: Page = pageWith()): ChromeProps {
  const site: Site = { config: siteConfig(), pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager };
}

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";
  if (node.type === Fragment) return html(node.props.children);
  if (typeof node.type === "function") return html((node.type as (p: object) => unknown)(node.props));
  const tag = node.type as string;
  const { children, ...rest } = node.props;
  const attrs = Object.entries(rest)
    .filter(([, value]) => value != null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
    .join("");
  return `<${tag}${attrs}>${html(children)}</${tag}>`;
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("renders one inert template with a hidden, localized block action", () => {
  const out = html(blockActions(props()));

  assert.match(
    out,
    /^<template data-block-actions data-prompt="Edit \{source\}\. Current text: "\{text\}"\. Change:" data-copied="Copied" data-copy-failed="Press Ctrl\+C"><button type="button" class="block-action" hidden data-block-action>Edit with your agent<\/button><\/template>$/,
  );
});

test("the label and the prompt follow the page language", () => {
  const out = html(blockActions(props(pageWith("fa", "rtl"))));

  assert.match(out, />ویرایش با دستیار<\/button>/);
  assert.match(out, /data-prompt="فایل \{source\} را ویرایش کن/);
  assert.match(out, /data-copied="کپی شد"/);
});

test("a doc page carries the template once, after the article", () => {
  const page = pageWith();
  const site: Site = { config: siteConfig(), pages: [page], nav: {}, data: {} };
  const layoutProps: LayoutProps = {
    site,
    page,
    trail,
    pager,
    head: { title: page.title, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
  const out = html(doc(layoutProps));

  assert.equal([...out.matchAll(/data-block-actions/g)].length, 1);
  assert.match(out, /<\/article><template data-block-actions/);
});

test("parseSpan reads the full form, both point forms, and a path that contains colons", () => {
  assert.deepEqual(parseSpan("docs/a.md:3:1-9:12"), {
    file: "docs/a.md",
    line: 3,
    column: 1,
    endLine: 9,
    endColumn: 12,
  });
  assert.deepEqual(parseSpan("docs/a.md:3:5"), { file: "docs/a.md", line: 3, column: 5, endLine: 3, endColumn: 5 });
  assert.deepEqual(parseSpan("docs/a.md:7"), { file: "docs/a.md", line: 7, column: 1, endLine: 7, endColumn: 1 });
  assert.deepEqual(parseSpan("C:\\notes\\a.md:2:3-2:8"), {
    file: "C:\\notes\\a.md",
    line: 2,
    column: 3,
    endLine: 2,
    endColumn: 8,
  });
});

test("parseSpan rejects a missing part, zero, and an end before the start", () => {
  assert.equal(parseSpan(""), undefined);
  assert.equal(parseSpan("docs/a.md"), undefined);
  assert.equal(parseSpan("docs/a.md:0:1-1:1"), undefined);
  assert.equal(parseSpan("docs/a.md:4:1-3:9"), undefined);
  assert.equal(parseSpan("docs/a.md:4:5-4:2"), undefined);
});

test("cleanText keeps line structure and drops characters that could forge prompt fields", () => {
  assert.equal(cleanText("  Run\r\nthe\tbuild.  "), "Run\nthe\tbuild.");
  assert.equal(cleanText("\u001b[31mred\u202e\u0000\u000b\u009b tail"), "[31mred tail");
  assert.equal(cleanText("one\u2028two\u2029three"), "one\ntwo\nthree");
});

test("promptText carries a normal multiline block longer than the old limit completely", () => {
  const multiline = `# Install\n\n${"Run the build and check the output. ".repeat(10)}\n\nDone.`;
  assert.ok(multiline.length > 160);
  assert.ok(multiline.length < MAX_TEXT);

  const carried = promptText(multiline);
  assert.equal(carried.text, multiline);
  assert.equal(carried.omitted, 0);
  assert.equal(carried.total, [...multiline].length);
  assert.doesNotMatch(carried.text, /truncated/);
});

test("promptText bounds an exceptional block at a code-point boundary and says what it left out", () => {
  const long = "😀".repeat(12);
  const carried = promptText(long, 5);

  assert.equal([...carried.text].slice(0, 5).join(""), "😀".repeat(5));
  assert.equal(carried.total, 12);
  assert.equal(carried.omitted, 7);
  assert.match(carried.text, /\[Lateen: text truncated, 7 of 12 characters omitted\]$/);
  assert.doesNotMatch(carried.text, /[\ud800-\udbff](?![\udc00-\udfff])/);
});

test("promptText returns short text whole and trims only the edges", () => {
  assert.deepEqual(promptText("  short  ", 20), { text: "short", total: 5, omitted: 0 });
  assert.deepEqual(promptText("", 20), { text: "", total: 0, omitted: 0 });
});

test("promptFor fills the source and text once, keeping lines and literal placeholders", () => {
  const prompt = promptFor('Edit {source}. Current text: "{text}". Change:', "a.md:1:1-1:4", 'The {source} block\nwith $& {copied}');

  assert.equal(prompt, 'Edit a.md:1:1-1:4. Current text: "The {source} block\nwith $& {copied}". Change:');
  assert.match(prompt, /\n/);
});

/** A fake block with an optional parent chain, as the island's outermost check reads it. */
function block(
  src: string | null,
  text = "A block.",
  parent: BlockElement | null = null,
  lang: string | null = null,
  id: string | null = null,
): BlockElement & { appended: ActionButton[]; attrs: Record<string, string> } {
  const attrs: Record<string, string> = {};
  if (src !== null) attrs["data-src"] = src;
  if (lang !== null) attrs["data-lang"] = lang;
  if (id !== null) attrs.id = id;
  const fake = {
    parentElement: parent,
    textContent: text,
    appended: [] as ActionButton[],
    attrs,
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    appendChild(child: ActionButton) {
      fake.appended.push(child);
      return child;
    },
  };
  return fake;
}

/** A fake template button that counts clones and records its click listeners and attributes. */
function button(label = "Edit with your agent"): ActionButton & {
  clones: ActionButton[];
  clicks: Array<() => void>;
  attrs: Record<string, string>;
} {
  const attrs: Record<string, string> = {};
  const fake = {
    hidden: true,
    textContent: label,
    dataset: {} as {
      prompt?: string | undefined;
      copied?: string | undefined;
      copyFailed?: string | undefined;
      blockId?: string | undefined;
      lang?: string | undefined;
      file?: string | undefined;
      source?: string | undefined;
      text?: string | undefined;
    },
    clones: [] as ActionButton[],
    clicks: [] as Array<() => void>,
    attrs,
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    addEventListener(type: "click", listener: () => void) {
      assert.equal(type, "click");
      fake.clicks.push(listener);
    },
    cloneNode(): ActionButton {
      const clone = button(fake.textContent ?? "");
      clone.hidden = fake.hidden;
      Object.assign(clone.dataset, fake.dataset);
      Object.assign(clone.attrs, fake.attrs);
      fake.clones.push(clone);
      return clone;
    },
  };
  return fake;
}

/** The server template with the English strings the component writes. */
function template(): ActionTemplate & { sample: ReturnType<typeof button> } {
  const sample = button();
  return {
    sample,
    content: { firstElementChild: sample },
    dataset: {
      prompt: 'Edit {source}. Current text: "{text}". Change:',
      copied: "Copied",
      copyFailed: "Press Ctrl+C",
    },
  };
}

/** An environment whose clipboard records writes and whose timer can be run by hand. */
function env(options: { clipboard?: Clipboard; blocks?: BlockElement[]; template?: ActionTemplate } = {}): ActivateEnv & {
  wrote: string[];
  timers: Array<{ callback: () => void; ms: number }>;
} {
  const wrote: string[] = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  return {
    template: options.template ?? template(),
    blocks: options.blocks ?? [],
    clipboard:
      options.clipboard ??
      ({
        writeText(text: string) {
          wrote.push(text);
          return Promise.resolve();
        },
      } satisfies Clipboard),
    schedule(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    wrote,
    timers,
  };
}

/** Lets queued microtasks and promise callbacks run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("topLevel keeps only sourced blocks that are not nested in another sourced block", () => {
  const outer = block("a.md:1:1-3:4", "outer", block(null));
  const child = block("a.md:2:1-2:4", "inner", outer);
  const invalid = block("not a span");

  assert.equal(isNested(child), true);
  assert.equal(isNested(outer), false);
  assert.deepEqual(topLevel([outer, child, invalid]), [outer]);
});

test("without a clipboard nothing is stamped and the template button stays hidden", () => {
  const tpl = template();
  const first = block("a.md:1:1-1:4");
  const world = env({ template: tpl, blocks: [first] });

  activate({ ...world, clipboard: undefined });

  assert.equal(tpl.sample.hidden, true);
  assert.deepEqual(first.appended, []);
});

test("activate stamps one revealed button per top-level block with its span and complete text", () => {
  const tpl = template();
  const outer = block("a.md:1:1-3:12", "  Install\n  the tool ");
  const child = block("a.md:2:1-2:4", "inside", outer);
  const invalid = block("not a span");
  const world = env({ template: tpl, blocks: [outer, child, invalid] });

  activate(world);

  assert.equal(outer.appended.length, 1);
  assert.equal(child.appended.length, 0);
  assert.equal(invalid.appended.length, 0);
  const stamped = outer.appended[0]!;
  assert.equal(stamped.hidden, false);
  assert.equal(
    stamped.dataset.prompt,
    'Edit a.md:1:1-3:12. Current text: "Install\n  the tool". Change:',
  );
  assert.equal(stamped.dataset.text, "  Install\n  the tool ");
  assert.equal(stamped.dataset.textTotal, "18");
  assert.equal(stamped.dataset.textOmitted, "0");
  assert.equal(stamped.dataset.copied, "Copied");
  assert.equal(stamped.dataset.copyFailed, "Press Ctrl+C");
});

test("a long multiline block reaches the prompt whole, and an exceptional one is marked incomplete", () => {
  const body = `Intro line.\n\n${"Detail sentence. ".repeat(20)}\n\nEnd line.`;
  const long = block("a.md:1:1-40:1", body);
  const huge = block("b.md:1:1-2:1", `${"x".repeat(MAX_TEXT)}tail`);
  const world = env({ blocks: [long, huge] });

  activate(world);

  const carried = long.appended[0]!;
  assert.equal(carried.dataset.prompt, `Edit a.md:1:1-40:1. Current text: "${body}". Change:`);
  assert.equal(carried.dataset.textOmitted, "0");

  const bounded = huge.appended[0]!;
  assert.match(bounded.dataset.prompt ?? "", /\[Lateen: text truncated, 4 of 8004 characters omitted\]/);
  assert.equal(bounded.dataset.textTotal, "8004");
  assert.equal(bounded.dataset.textOmitted, "4");
});

test("a code block gets one stable id and its action keeps file, language, source, and exact text", () => {
  const first = block("docs/a.md:3:1-9:12", "  const a = 1;\n", null, "ts");
  const world = env({ blocks: [first] });

  activate(world);

  const id = blockId("docs/a.md:3:1-9:12");
  assert.equal(first.getAttribute("id"), id);
  assert.equal(first.appended.length, 1);
  const stamped = first.appended[0]!;
  assert.equal(stamped.dataset.blockId, id);
  assert.equal(stamped.dataset.lang, "ts");
  assert.equal(stamped.dataset.file, "docs/a.md");
  assert.equal(stamped.dataset.source, "docs/a.md:3:1-9:12");
  assert.equal(stamped.dataset.text, "  const a = 1;\n");
  assert.equal(stamped.dataset.prompt, 'Edit docs/a.md:3:1-9:12 (ts). Current text: "const a = 1;". Change:');
  assert.equal(stamped.getAttribute("aria-label"), "Edit with your agent (docs/a.md:3:1-9:12)");
});

test("an existing block id is kept, and a non-code block gets no id of its own", () => {
  const code = block("a.md:1:1-1:4", "x", null, "ts", "author-id");
  const prose = block("a.md:3:1-3:8", "Words.");

  activate(env({ blocks: [code, prose] }));

  assert.equal(code.getAttribute("id"), "author-id");
  assert.equal(code.appended[0]!.dataset.blockId, "author-id");
  assert.equal(prose.getAttribute("id"), null);
  assert.equal(prose.appended[0]!.dataset.blockId, "a.md:3:1-3:8");
  assert.equal(prose.appended[0]!.dataset.prompt, 'Edit a.md:3:1-3:8. Current text: "Words.". Change:');
});

test("duplicate blocks each get one action, but only the first takes the shared id", () => {
  const first = block("a.md:1:1-1:4", "x", null, "ts");
  const second = block("a.md:1:1-1:4", "x", null, "ts");

  activate(env({ blocks: [first, second] }));

  assert.equal(first.appended.length, 1);
  assert.equal(second.appended.length, 1);
  const id = blockId("a.md:1:1-1:4");
  assert.equal(first.getAttribute("id"), id);
  assert.equal(second.getAttribute("id"), null);
  assert.equal(second.appended[0]!.dataset.blockId, "a.md:1:1-1:4");
});

test("a localized template keeps its wording, full Unicode text, and literal placeholders", () => {
  const localized: ActionTemplate = {
    content: { firstElementChild: button("ویرایش با دستیار") },
    dataset: {
      prompt: "فایل {source} را ویرایش کن. متن فعلی: «{text}». تغییر:",
      copied: "کپی شد",
      copyFailed: "Ctrl+C را بزنید",
    },
  };
  const text = "سلام {source} 😀\nخط دوم";
  const first = block("docs/fa.md:1:1-2:4", text, null, "", "block-id");

  activate(env({ template: localized, blocks: [first] }));

  const stamped = first.appended[0]!;
  assert.equal(
    stamped.dataset.prompt,
    "فایل docs/fa.md:1:1-2:4 را ویرایش کن. متن فعلی: «سلام {source} 😀\nخط دوم». تغییر:",
  );
  assert.equal(stamped.dataset.text, text);
  assert.equal(stamped.dataset.textOmitted, "0");
});

test("control characters in block text cannot forge prompt fields", () => {
  const text = "before\u001b[2K\r\n{source}: forged\u202e\u0000 after";
  const first = block("a.md:1:1-2:1", text);

  activate(env({ blocks: [first] }));

  const stamped = first.appended[0]!;
  assert.doesNotMatch(stamped.dataset.prompt ?? "", /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e]/);
  assert.equal(
    stamped.dataset.prompt,
    'Edit a.md:1:1-2:1. Current text: "before[2K\n{source}: forged after". Change:',
  );
});

test("blockId is id-safe, stable, and different for different spans", () => {
  assert.equal(blockId("docs/a.md:3:1-9:12"), "code-docs-a-md-3-1-9-12");
  assert.equal(blockId("C:\\notes\\a.md:2:3"), "code-C-notes-a-md-2-3");
  assert.equal(blockId("docs/a.md:3:1-9:12"), blockId("docs/a.md:3:1-9:12"));
  assert.notEqual(blockId("docs/a.md:3:1-9:12"), blockId("docs/a.md:4:1-9:12"));
});

test("a click writes the prompt and shows the result until the timer restores the label", async () => {
  const tpl = template();
  const first = block("a.md:1:1-1:4", "Install");
  const world = env({ template: tpl, blocks: [first] });
  activate(world);

  const stamped = first.appended[0] as ReturnType<typeof button>;
  stamped.clicks[0]!();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(world.wrote, ['Edit a.md:1:1-1:4. Current text: "Install". Change:']);
  assert.equal(stamped.textContent, "Copied");
  assert.equal(world.timers.length, 1);
  assert.equal(world.timers[0]!.ms, RESET_MS);
  world.timers[0]!.callback();
  assert.equal(stamped.textContent, "Edit with your agent");
});

test("rapid clicks write in click order and only the latest result is shown", async () => {
  const first = block("a.md:1:1-1:4", "First");
  const second = block("b.md:1:1-1:4", "Second");
  const wrote: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const clipboard: Clipboard = {
    writeText(text: string) {
      wrote.push(text);
      return wrote.length === 1 ? gate : Promise.resolve();
    },
  };
  const world = env({ blocks: [first, second], clipboard });
  activate(world);

  const a = first.appended[0] as ReturnType<typeof button>;
  const b = second.appended[0] as ReturnType<typeof button>;
  a.clicks[0]!();
  b.clicks[0]!();
  await tick();

  assert.deepEqual(wrote, [a.dataset.prompt]);
  release();
  await tick();

  assert.deepEqual(wrote, [a.dataset.prompt, b.dataset.prompt]);
  assert.equal(a.textContent, "Copied");
  assert.equal(b.textContent, "Copied");
});

test("a repeated click ignores an earlier result and shows the latest", async () => {
  const first = block("a.md:1:1-1:4", "Install");
  let attempts = 0;
  const clipboard: Clipboard = {
    writeText() {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("denied")) : Promise.resolve();
    },
  };
  const world = env({ blocks: [first], clipboard });
  activate(world);

  const stamped = first.appended[0] as ReturnType<typeof button>;
  stamped.clicks[0]!();
  stamped.clicks[0]!();
  await tick();

  assert.equal(stamped.textContent, "Copied");
  assert.equal(world.timers.length, 1);
});

test("a refused clipboard reports the failure instead of claiming a copy", async () => {
  const denied: Clipboard = { writeText: () => Promise.reject(new Error("denied")) };
  const tpl = template();
  const first = block("a.md:1:1-1:4", "Install");
  const world = env({ template: tpl, blocks: [first], clipboard: denied });
  activate(world);

  const stamped = first.appended[0]!;
  await copy(stamped, "Edit with your agent", world);

  assert.equal(stamped.textContent, "Press Ctrl+C");
});

test("without a clipboard, copy does nothing", async () => {
  const world = env();
  await copy(button(), "Edit with your agent", { ...world, clipboard: undefined });

  assert.deepEqual(world.wrote, []);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/block-actions/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states every edge in logical properties and keeps the hidden button hidden", () => {
  const css = readFileSync(new URL("../chrome/block-actions/style.css", import.meta.url), "utf8");
  const declarations = css
    .split("\n")
    .filter((line) => !/^\s*@(media|container|supports)/.test(line))
    .join("\n");

  assert.match(css, /\.block-action\[hidden\] \{\n  display: none;/);
  assert.match(css, /inset-block-start: var\(--space-1\);/);
  assert.match(css, /inset-inline-end: var\(--space-1\);/);
  assert.doesNotMatch(declarations, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(declarations, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
