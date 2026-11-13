import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ChromeProps,
  ComponentProps,
  LayoutProps,
  Page,
  Pager,
  Site,
  SiteConfig,
  SourcePos,
  Trail,
} from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import doc from "../layouts/doc.ts";
import blockActions from "../chrome/block-actions/index.ts";
import {
  activate as activateBlocks,
  RESET_MS,
  type ActionButton,
  type ActionTemplate,
  type ActivateEnv as BlockEnv,
  type BlockElement,
  type Clipboard as BlockClipboard,
} from "../chrome/block-actions/client.ts";
import {
  activate as activateCopyMarkdown,
  isCopyShortcut,
  isTypingTarget as copyTypingTarget,
  type CopyButton,
  type ShortcutEvent as CopyShortcutEvent,
} from "../chrome/copy-markdown/client.ts";
import {
  activateShortcuts,
  isSearchShortcut,
  isTypingTarget as searchTypingTarget,
  type ShortcutEvent as SearchShortcutEvent,
} from "../chrome/search/shortcut.ts";
import { SHORTCUTS } from "../chrome/shortcuts/index.ts";
import schemaTable, {
  type SchemaFieldNode,
  type SchemaFieldsPayload,
  type SchemaTableProps,
} from "../components/schema-table/index.ts";
import outputBlock, {
  outputText,
  type OutputBlockProps,
} from "../components/output-block/index.ts";
import {
  activate as activateVariables,
  applyValue,
  BLOCK_SELECTOR,
  INLINE_SELECTOR,
  OUTPUT_DEPENDENCY_SELECTOR,
  recomputeStaleness,
  STALE_ATTRIBUTE,
  STALE_NOTE_SELECTOR,
  type PlaceholderNode,
  type PlaceholderRoot,
  type VariableForm,
  type VariableInput,
} from "../components/variables-form/client.ts";

const pos: SourcePos = { file: "guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 12 };
const trail: Trail = [];
const pager: Pager = {};

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "",
    url: "https://docs.example.com",
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
    ...overrides,
  };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: { title: "Install", version: "1.2.0" },
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Run the build.</p>",
    markdown: "Run the build.",
    kind: "doc",
    ...overrides,
  };
}

function siteFor(page: Page, overrides: Partial<SiteConfig> = {}): Site {
  return { config: configWith(overrides), pages: [page], nav: { main: [] }, data: {} };
}

function chromeProps(page: Page, overrides: Partial<SiteConfig> = {}): ChromeProps {
  return { site: siteFor(page, overrides), page, trail, pager };
}

function layoutProps(page: Page, overrides: Partial<SiteConfig> = {}, data: Site["data"] = {}): LayoutProps {
  const site: Site = { config: configWith(overrides), pages: [page], nav: { main: [] }, data };
  return {
    site,
    page,
    trail,
    pager,
    head: { title: page.title, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

function render(node: unknown): string {
  return renderToString(node as never);
}

function docHtml(page: Page, overrides: Partial<SiteConfig> = {}, data: Site["data"] = {}): string {
  return render(doc(layoutProps(page, overrides, data)));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A fake action button that records its click listeners, attributes, dataset, and clones. */
interface FakeActionButton extends ActionButton {
  readonly clicks: Array<() => void>;
  readonly attrs: Record<string, string>;
}

function fakeActionButton(label: string, hidden = true): FakeActionButton {
  const attrs: Record<string, string> = {};
  const button: FakeActionButton = {
    hidden,
    textContent: label,
    dataset: {},
    clicks: [],
    attrs,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      button.clicks.push(listener);
    },
    cloneNode() {
      const clone = fakeActionButton(button.textContent ?? "", button.hidden);
      Object.assign(clone.dataset, button.dataset);
      Object.assign(clone.attrs, attrs);
      return clone;
    },
  };
  return button;
}

/** A fake sourced block the island can stamp a button into. */
interface FakeBlock extends BlockElement {
  readonly attrs: Record<string, string>;
  readonly appended: ActionButton[];
}

function fakeBlock(
  src: string | null,
  text: string,
  options: { lang?: string; parent?: BlockElement | null } = {},
): FakeBlock {
  const attrs: Record<string, string> = {};
  if (src !== null) attrs["data-src"] = src;
  if (options.lang !== undefined) attrs["data-lang"] = options.lang;
  const appended: ActionButton[] = [];
  return {
    parentElement: options.parent ?? null,
    textContent: text,
    attrs,
    appended,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
    appendChild(button) {
      appended.push(button);
      return button;
    },
  };
}

/** The real server template from `chrome/block-actions` as the island reads it. */
function actionTemplate(page: Page): ActionTemplate & { sample: FakeActionButton } {
  type VNode = { props: Record<string, unknown> & { children?: VNode | string | null } };
  const tree = blockActions(chromeProps(page)) as unknown as VNode;
  const child = tree.props.children as VNode;
  const label = child.props.children;
  if (typeof label !== "string") assert.fail("the block action template has no button label");
  const sample = fakeActionButton(label);
  return {
    sample,
    content: { firstElementChild: sample },
    dataset: {
      prompt: String(tree.props["data-prompt"] ?? ""),
      copied: String(tree.props["data-copied"] ?? ""),
      copyFailed: String(tree.props["data-copy-failed"] ?? ""),
    },
  };
}

/** An island environment whose clipboard records writes and whose timer the test can run. */
function blockWorld(
  template: ActionTemplate,
  blocks: BlockElement[],
  clipboard?: BlockClipboard,
): BlockEnv & { readonly wrote: string[]; readonly timers: Array<{ callback: () => void; ms: number }> } {
  const wrote: string[] = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  return {
    template,
    blocks,
    clipboard:
      clipboard ??
      ({
        writeText(text: string) {
          wrote.push(text);
          return Promise.resolve();
        },
      } satisfies BlockClipboard),
    schedule(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    wrote,
    timers,
  };
}

test("one block action copies the exact source span, the block text, and the page language", async () => {
  const page = pageWith({ lang: "fa", dir: "rtl" });
  const template = actionTemplate(page);
  const span = "docs/guide/install.md:3:1-9:12";
  const block = fakeBlock(span, "  const ok = true;\n", { lang: "ts" });
  const world = blockWorld(template, [block]);

  activateBlocks(world);

  assert.equal(block.appended.length, 1);
  const stamped = block.appended[0] as FakeActionButton;
  assert.equal(stamped.hidden, false);
  assert.equal(stamped.getAttribute("aria-label"), `ویرایش با دستیار (${span})`);

  stamped.clicks[0]!();
  await tick();

  assert.equal(
    world.wrote[0],
    "فایل docs/guide/install.md:3:1-9:12 (ts) را ویرایش کن. متن فعلی: «const ok = true;». تغییر:",
  );
  assert.ok(world.wrote[0]!.includes(span), "the copied prompt carries the exact span");
  assert.ok(world.wrote[0]!.includes("const ok = true;"), "the copied prompt carries the block text");
  assert.match(world.wrote[0]!, /را ویرایش کن/, "the copied prompt follows the page language");
  assert.equal(stamped.dataset.source, span);
  assert.equal(stamped.dataset.file, "docs/guide/install.md");
  assert.equal(stamped.dataset.lang, "ts");

  assert.equal(stamped.textContent, "کپی شد");
  assert.equal(world.timers.length, 1);
  assert.equal(world.timers[0]!.ms, RESET_MS);
  world.timers[0]!.callback();
  assert.equal(stamped.textContent, "ویرایش با دستیار");
});

test("a refused clipboard write reports failure instead of claiming a copy", async () => {
  const page = pageWith({ lang: "en" });
  const template = actionTemplate(page);
  const block = fakeBlock("docs/guide/install.md:3:1-9:12", "Install");
  const world = blockWorld(template, [block], {
    writeText: () => Promise.reject(new Error("denied")),
  });

  activateBlocks(world);
  const stamped = block.appended[0] as FakeActionButton;
  stamped.clicks[0]!();
  await tick();

  assert.equal(stamped.textContent, "Press Ctrl+C");
  assert.notEqual(stamped.textContent, "Copied");
  assert.equal(world.wrote.length, 0, "a refused write records no text");
});

test("a rendered doc names the source in the block action and links the Markdown twin and provider context", () => {
  const span = "docs/guide/install.md:3:1-9:12";
  const page = pageWith({
    html: `<p>Install the tool.</p><pre data-src="${span}" data-lang="ts"><code>const ok = true;</code></pre>`,
  });
  const out = docHtml(page, {
    theme: {
      options: {
        pageAgent: {
          providers: [
            {
              title: "Ask",
              url: "https://example.com/ask?url={url}&source={source}&version={version}&lang={lang}&markdown={markdown}",
            },
          ],
        },
      },
    },
  });

  assert.ok(out.includes(`data-src="${span}"`), "the body keeps the block's source span");
  assert.match(out, /<pre data-src="docs\/guide\/install\.md:3:1-9:12" data-lang="ts"><code>const ok = true;<\/code><\/pre>/);

  const block = fakeBlock(span, "const ok = true;", { lang: "ts" });
  activateBlocks(blockWorld(actionTemplate(page), [block]));
  const stamped = block.appended[0] as FakeActionButton;
  assert.equal(stamped.getAttribute("aria-label"), `Edit with your agent (${span})`);

  const copyLink = /<a class="copy-markdown-link" href="([^"]+)"/.exec(out)?.[1];
  assert.equal(copyLink, "/guide/install/index.md");
  assert.match(copyLink ?? "", /\.md$/);
  assert.match(out, /<a class="page-agent-menu-view" href="\/guide\/install\/index\.md">View Markdown<\/a>/);

  const providerHref = /<a class="page-agent-menu-provider" href="([^"]+)"/.exec(out)?.[1];
  assert.ok(providerHref, "the configured provider is rendered");
  const query = new URL(providerHref.replaceAll("&amp;", "&"));
  assert.equal(query.searchParams.get("url"), "https://docs.example.com/guide/install/");
  assert.equal(query.searchParams.get("source"), "guide/install.md");
  assert.equal(query.searchParams.get("version"), "1.2.0");
  assert.equal(query.searchParams.get("lang"), "en");
  assert.equal(query.searchParams.get("markdown"), "https://docs.example.com/guide/install/index.md");
});

test("a value change updates placeholders, marks a declared output stale, and restoring it clears the state", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const code = new FakeElement({ "data-placeholders": '[{"name":"host"}]' }, [
    new FakeText("curl {{host}}/v1"),
  ]);
  const { output, note, recorded, staleText } = renderedOutputWith(["host"], "<p>Written 12 pages\nin 340 ms</p>");
  const root = new FakeRoot([span], [code], [output]);

  applyValue(root, "host", "https://docs.example.com");
  assert.equal(code.textContent, "curl https://docs.example.com/v1");

  const host = new FakeInput("host", "https://api.example.com");
  activateVariables(root, new FakeForm([host]));
  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(code.textContent, "curl https://api.example.com/v1");
  assert.equal(output.getAttribute(STALE_ATTRIBUTE), null, "the documented default is not stale");

  host.type("https://sandbox.example.com");
  recomputeStaleness(root);
  assert.equal(span.textContent, "https://sandbox.example.com");
  assert.equal(code.textContent, "curl https://sandbox.example.com/v1");
  assert.equal(output.getAttribute(STALE_ATTRIBUTE), "true");
  assert.equal(note.textContent, staleText);
  assert.equal(output.childNodes[0]!.textContent, recorded, "the recorded output text is never rewritten");

  host.type("https://api.example.com");
  recomputeStaleness(root);
  assert.equal(output.getAttribute(STALE_ATTRIBUTE), null);
  assert.equal(note.textContent, "");
  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(output.childNodes[0]!.textContent, recorded, "the recorded output text stays byte-for-byte");
});

test("a schema table publishes field paths and types and marks unresolved references explicitly", () => {
  const widget = {
    title: "Widget",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Unique identifier." },
      lost: { $ref: "#/$defs/missing" },
      owner: {
        type: "object",
        properties: { email: { type: "string" } },
      },
    },
  };
  const out = renderComponent(schemaTable, { data: "widget" }, { widget });
  const payload = schemaPayload(out);

  assert.equal(payload.component, "schema-table");
  assert.equal(payload.version, 2);
  assert.equal(payload.data, "widget");
  assert.deepEqual(publishedPaths(payload.fields), ["id", "lost", "owner", "owner.email"]);

  const id = fieldAt(payload.fields, "id");
  assert.equal(id.type, "string");
  assert.equal(id.copyValue, "id: string");
  const lost = fieldAt(payload.fields, "lost");
  assert.equal(lost.type, "unknown");
  assert.notEqual(lost.type, "any");
  assert.deepEqual(lost.ref, { value: "#/$defs/missing", state: "unresolved" });
  assert.equal(fieldAt(payload.fields, "owner.email").type, "string");

  assert.match(out, /<table class="schema-table">/);
  assert.match(out, /<th scope="row" class="schema-name"/);
  assert.match(out, /data-field="lost"/);
  assert.match(out, /data-ref-state="unresolved"/);
  assert.match(out, />unknown</);
  assert.match(out, />unresolved</);
  assert.match(out, /Unique identifier\./);
  assert.doesNotMatch(out, /<button/, "the table is readable without any control");
  assert.match(out, /<script type="application\/json" data-schema-fields[^>]*>/);
});

test("a page has one copy-Markdown control and one agent menu, and its distinct shortcuts stay out of fields", async () => {
  const page = pageWith();
  const out = docHtml(page);

  assert.equal([...out.matchAll(/data-copy-markdown="true"/g)].length, 1);
  assert.equal([...out.matchAll(/data-copy-markdown-button="true"/g)].length, 1);
  assert.equal([...out.matchAll(/data-page-agent-menu="true"/g)].length, 1);
  assert.equal([...out.matchAll(/data-block-actions="true"/g)].length, 1);

  const search = SHORTCUTS.find((shortcut) => shortcut.label === "search");
  const copy = SHORTCUTS.find((shortcut) => shortcut.label === "copy_page_md");
  assert.ok(search && copy);
  assert.deepEqual([...copy.keys], ["m"]);
  assert.deepEqual(
    search.keys.filter((key) => copy.keys.some((other) => other.toLowerCase() === key.toLowerCase())),
    [],
    "search and copy-Markdown share no key",
  );

  assert.equal(isCopyShortcut({ key: "m", preventDefault() {} }), true);
  assert.equal(isCopyShortcut({ key: "M", preventDefault() {} }), true);
  assert.equal(isCopyShortcut({ key: "/", preventDefault() {} }), false);
  assert.equal(isSearchShortcut({ key: "/", preventDefault() {} }, "Linux"), true);
  assert.equal(isSearchShortcut({ key: "k", ctrlKey: true, preventDefault() {} }, "Linux"), true);
  assert.equal(isSearchShortcut({ key: "m", preventDefault() {} }, "Linux"), false);

  for (const target of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) {
    assert.equal(copyTypingTarget(target), true);
    assert.equal(searchTypingTarget(target), true);
  }

  // The copy shortcut pressed while typing stays an ordinary letter and fetches nothing.
  const fetched: string[] = [];
  const button = fakeCopyButton();
  let copyKey: ((event: CopyShortcutEvent) => void) | undefined;
  activateCopyMarkdown(button, {
    clipboard: { writeText: () => Promise.resolve() },
    fetchText: (url) => {
      fetched.push(url);
      return Promise.resolve("# Install\n");
    },
    status: { textContent: "" },
    keys: {
      addEventListener(_type, listener) {
        copyKey = listener;
      },
    },
  });
  let prevented = false;
  copyKey!({ key: "m", target: { tagName: "INPUT" }, preventDefault() { prevented = true; } });
  await tick();
  assert.equal(prevented, false);
  assert.deepEqual(fetched, []);

  // The search shortcut pressed while typing leaves the key in the field.
  let searchKey: ((event: SearchShortcutEvent) => void) | undefined;
  let opens = 0;
  activateShortcuts(
    { button: { click: () => { opens += 1; } } },
    {
      platform: "Linux",
      addEventListener(_type, listener) {
        searchKey = listener;
      },
    },
  );
  let searchPrevented = false;
  searchKey!({ key: "/", target: { tagName: "INPUT" }, preventDefault() { searchPrevented = true; } });
  assert.equal(opens, 0);
  assert.equal(searchPrevented, false);
  searchKey!({ key: "/", target: { tagName: "BUTTON" }, preventDefault() { searchPrevented = true; } });
  assert.equal(opens, 1, "outside a field the documented shortcut still opens search");
});

test("without JavaScript the doc keeps its prose, code, and schema rows and only hides the actions", () => {
  const span = "docs/guide/install.md:3:1-9:12";
  const widget = {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique identifier." },
      mode: { enum: ["fast", "safe"] },
    },
  };
  const table = renderComponent(schemaTable, { data: "widget" }, { widget });
  const output = renderComponent(outputBlock, { deps: '["project"]' }, {}, "<p>Created {{project}}</p>");
  const page = pageWith({
    html: [
      "<p>Install the tool, then run it.</p>",
      `<pre data-src="${span}" data-lang="ts"><code>const ok = true;</code></pre>`,
      table,
      output,
    ].join(""),
  });

  const out = docHtml(page);

  assert.match(out, /<p>Install the tool, then run it\.<\/p>/);
  assert.match(out, /<pre data-src="docs\/guide\/install\.md:3:1-9:12" data-lang="ts"><code>const ok = true;<\/code><\/pre>/);
  assert.match(out, /id="schema-widget-field-id"/);
  assert.match(out, />Unique identifier\.</);
  assert.match(out, /&quot;fast&quot;/);
  assert.match(out, />Created \{\{project\}\}</);
  assert.match(out, /<script type="application\/json" data-schema-fields[^>]*>/);

  assert.match(out, /<template data-block-actions="true"/);
  assert.match(out, /<button type="button" class="block-action" hidden/);
  assert.match(out, /<button type="button" class="copy-markdown-button" hidden/);
  assert.match(out, /<button type="button" class="page-agent-menu-copy" hidden/);
  assert.match(out, /<button type="button" class="output-block-copy" hidden/);
  assert.equal([...out.matchAll(/class="block-action" hidden/g)].length, 1);
  assert.doesNotMatch(out, /<button[^>]*class="block-action"(?![^>]*hidden)/, "the block action is enhancement-only");
});

/** Render one component the way the render host calls it. */
function renderComponent(
  component: unknown,
  props: Record<string, unknown>,
  data: Record<string, unknown>,
  html = "",
): string {
  const input = { props, page: { lang: "en" }, site: { data }, html } as unknown as ComponentProps<
    SchemaTableProps | OutputBlockProps
  >;
  return render((component as (value: unknown) => unknown)(input));
}

/** The inert schema payload as the rendered HTML carries it. */
function schemaPayload(markup: string): SchemaFieldsPayload {
  const match = /<script type="application\/json" data-schema-fields[^>]*>([\s\S]*?)<\/script>/.exec(markup);
  assert.ok(match, "the table publishes its fields");
  return JSON.parse(match[1]!) as SchemaFieldsPayload;
}

function publishedPaths(fields: readonly SchemaFieldNode[]): string[] {
  return fields.flatMap((field) => [field.path, ...publishedPaths(field.children)]);
}

function findField(fields: readonly SchemaFieldNode[], path: string): SchemaFieldNode | undefined {
  for (const field of fields) {
    if (field.path === path) return field;
    const nested = findField(field.children, path);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function fieldAt(fields: readonly SchemaFieldNode[], path: string): SchemaFieldNode {
  const found = findField(fields, path);
  assert.ok(found, `no published field ${path}`);
  return found;
}

/** A real output block's dependency record, stale note markup, and recorded text, as the island sees them. */
function renderedOutputWith(
  deps: readonly string[],
  body: string,
): { output: FakeElement; note: FakeText; recorded: string; staleText: string } {
  const markup = renderComponent(outputBlock, { deps: JSON.stringify(deps) }, {}, body);
  const dependencyAttr = /data-output-deps="([^"]*)"/.exec(markup)?.[1];
  const staleText = /data-stale-text="([^"]*)"/.exec(markup)?.[1];
  assert.ok(dependencyAttr, "the output declares its dependencies");
  assert.ok(staleText, "the output carries its stale note text");
  assert.match(markup, /data-output-stale-note="true"/);
  const recorded = outputText(body);
  const note = new FakeText("", { "data-output-stale-note": "" });
  const output = new FakeElement(
    {
      "data-output-deps": dependencyAttr.replaceAll("&quot;", '"'),
      "data-stale-text": staleText,
    },
    [new FakeText(recorded), note],
  );
  return { output, note, recorded, staleText };
}

/** A text node the variables island can rewrite, optionally carrying attributes for the note query. */
class FakeText implements PlaceholderNode {
  readonly nodeType = 3;
  textContent: string | null;
  private readonly attrs: Record<string, string>;

  constructor(value: string, attrs: Record<string, string> = {}) {
    this.textContent = value;
    this.attrs = attrs;
  }

  get childNodes(): undefined {
    return undefined;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
}

/** An element with children and attributes, and the one `[attribute]` query the island uses. */
class FakeElement implements PlaceholderNode {
  readonly nodeType = 1;
  readonly childNodes: PlaceholderNode[];
  readonly attrs: Record<string, string>;

  constructor(attrs: Record<string, string>, children: PlaceholderNode[] = []) {
    this.attrs = { ...attrs };
    this.childNodes = children;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent ?? "").join("");
  }

  set textContent(value: string) {
    this.childNodes.length = 0;
    this.childNodes.push(new FakeText(value));
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attrs[name];
  }

  querySelector(selector: string): PlaceholderNode | null {
    const attribute = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
    if (attribute === undefined) return null;
    for (const child of this.childNodes) {
      if (child.getAttribute(attribute) !== null) return child;
      const nested = child.querySelector?.(selector) ?? null;
      if (nested !== null) return nested;
    }
    return null;
  }
}

/** A page root returning the inline spans, blocks, and outputs the test made. */
class FakeRoot implements PlaceholderRoot {
  readonly inline: PlaceholderNode[];
  readonly blocks: PlaceholderNode[];
  readonly outputs: PlaceholderNode[];

  constructor(inline: PlaceholderNode[], blocks: PlaceholderNode[], outputs: PlaceholderNode[]) {
    this.inline = inline;
    this.blocks = blocks;
    this.outputs = outputs;
  }

  querySelectorAll(selector: string): Iterable<PlaceholderNode> {
    if (selector === INLINE_SELECTOR) return this.inline;
    if (selector === BLOCK_SELECTOR) return this.blocks;
    if (selector === OUTPUT_DEPENDENCY_SELECTOR) return this.outputs;
    return [];
  }
}

/** An input that remembers its listeners so a test can type. */
class FakeInput implements VariableInput {
  value: string;
  readonly name: string;
  readonly fallback: string;
  readonly listeners: Array<() => void> = [];
  accepted = true;

  constructor(name: string, value: string, fallback = value) {
    this.name = name;
    this.value = value;
    this.fallback = fallback;
  }

  get validity(): { readonly valid: boolean } {
    return { valid: this.accepted };
  }

  getAttribute(name: string): string | null {
    if (name === "data-var") return this.name;
    if (name === "data-default") return this.fallback;
    return null;
  }

  addEventListener(_type: "input", listener: () => void): void {
    this.listeners.push(listener);
  }

  type(value: string): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}

/** A form returning the inputs the test made. */
class FakeForm implements VariableForm {
  readonly inputs: VariableInput[];

  constructor(inputs: VariableInput[]) {
    this.inputs = inputs;
  }

  querySelectorAll(selector: string): Iterable<VariableInput> {
    return selector === "input[data-var]" ? this.inputs : [];
  }

  querySelector(): null {
    return null;
  }
}

/** A copy button with the attributes the copy-Markdown frame renders and a click listener. */
function fakeCopyButton(): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden: true,
    dataset: {
      markdown: "/guide/install/index.md",
      copied: "Copied",
      copyFailed: "Press Ctrl+C",
    },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    click() {
      for (const listener of listeners) listener();
    },
  };
}

// The variables island exports its selectors; these assertions keep the fakes honest.
test("the test fakes match the selectors the islands use", () => {
  assert.equal(STALE_NOTE_SELECTOR, "[data-output-stale-note]");
  assert.equal(INLINE_SELECTOR, ".placeholder[data-var]");
  assert.equal(BLOCK_SELECTOR, "[data-placeholders]");
  assert.equal(OUTPUT_DEPENDENCY_SELECTOR, "[data-output-deps]");
  assert.equal(STALE_ATTRIBUTE, "data-output-stale");
});
