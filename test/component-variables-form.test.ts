import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import variablesForm, {
  DEFAULT_ID,
  FIELDS_CLASS,
  FIELD_CLASS,
  FORM_CLASS,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  LEGEND_CLASS,
  RESET_CLASS,
  declarationsFor,
  declarationsOf,
  directive,
  fieldId,
  fieldsFor,
  idBase,
  inputTypeOf,
  mergeDeclarations,
  parseDeclarations,
  valueOf,
  type VariableDeclaration,
  type VariablesFormProps,
} from "../components/variables-form/index.ts";
import {
  BLOCK_SELECTOR,
  FORM_SELECTOR,
  INLINE_SELECTOR,
  INPUT_SELECTOR,
  OUTPUT_DEPENDENCY_SELECTOR,
  RESET_SELECTOR,
  STALE_ATTRIBUTE,
  STALE_NOTE_SELECTOR,
  activate,
  applyValue,
  markStale,
  namesOf,
  recomputeStaleness,
  replaceIn,
  tokenOf,
  valuesOf,
  type PlaceholderNode,
  type PlaceholderRoot,
  type ResetButton,
  type VariableForm,
  type VariableInput,
} from "../components/variables-form/client.ts";
import { commandsOf } from "../components/terminal/client.ts";

type RenderOptions = {
  readonly lang?: string;
  readonly frontMatter?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
};

/** Render the form the way the render host calls it: directive props, the page, and the site model. */
function render(props: VariablesFormProps = {}, options: RenderOptions = {}): string | null {
  const page = { lang: options.lang ?? "en", frontMatter: options.frontMatter ?? {} };
  const site = { data: options.data ?? {} };
  const node = variablesForm({ props, page, site, html: "" } as unknown as ComponentProps<VariablesFormProps>);
  return node === null ? null : renderToString(node as never);
}

/** A page declaration list in the N33 shape. */
function pageWith(variables: unknown): RenderOptions {
  return { frontMatter: { variables } };
}

/** A site declaration list in the N33 shape. */
function siteWith(variables: unknown): RenderOptions {
  return { data: { variables } };
}

function countOf(haystack: string, needle: RegExp): number {
  return [...haystack.matchAll(needle)].length;
}

const css = readFileSync(new URL("../components/variables-form/style.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../components/variables-form/client.ts", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("default export is the component and its directive is variables-form", () => {
  assert.equal(typeof variablesForm, "function");
  assert.equal(directive, "variables-form");
  assert.deepEqual(
    [FORM_CLASS, LEGEND_CLASS, HINT_CLASS, FIELDS_CLASS, FIELD_CLASS, LABEL_CLASS, INPUT_CLASS, RESET_CLASS],
    [
      "variables-form",
      "variables-form-legend",
      "variables-form-hint",
      "variables-form-fields",
      "variables-form-field",
      "variables-form-label",
      "variables-form-input",
      "variables-form-reset",
    ],
  );
});

test("a declared input type becomes the field's type, so the browser validates it", () => {
  assert.equal(inputTypeOf("url"), "url");
  assert.equal(inputTypeOf(" URL "), "url");
  assert.equal(inputTypeOf("number"), "number");
  assert.equal(inputTypeOf("string"), "text");
  assert.equal(inputTypeOf(undefined), "text");
  assert.equal(inputTypeOf("unknown"), "text");
  assert.equal(inputTypeOf("checkbox"), "text", "a declaration never turns a variable into a checkbox");

  const out = render(
    {},
    pageWith([
      { name: "host", default: "https://api.example.com", type: "url" },
      { name: "api_key", default: "YOUR_KEY", type: "string" },
    ]),
  );
  assert.ok(out);
  assert.match(out, /name="host" type="url"/);
  assert.match(out, /name="api_key" type="text"/);
});

test("the reset button is hidden, labelled, and carries each declared default", () => {
  const out = render({}, pageWith([{ name: "api_key", default: "YOUR_KEY" }]));
  assert.ok(out);
  assert.match(out, new RegExp(`<button type="button" class="${RESET_CLASS}" hidden data-variables-reset="true">`));
  assert.ok(out.endsWith(">Reset values</button></fieldset>"));
  assert.match(out, /data-default="YOUR_KEY"/);

  assert.ok(render({}, { lang: "fa", ...pageWith([{ name: "api_key" }]) })!.includes(">بازنشانی مقدارها</button>"));
  assert.ok(render({}, { lang: "ar", ...pageWith([{ name: "api_key" }]) })!.includes(">إعادة ضبط القيم</button>"));
});

test("one labelled input per variable, in code-point order", () => {
  const out = render(
    {},
    pageWith([
      { name: "host", default: "https://api.example.com" },
      { name: "api_key", default: "YOUR_KEY" },
    ]),
  );
  assert.ok(out);
  assert.equal(countOf(out, /<input\b/g), 2);
  assert.equal(countOf(out, new RegExp(`class="${LABEL_CLASS}"`, "g")), 2);
  assert.ok(out.indexOf(">api_key</label>") < out.indexOf(">host</label>"), "names sort by code point");
  assert.match(
    out,
    new RegExp(
      `<label class="${LABEL_CLASS}" for="${fieldId(DEFAULT_ID, "api_key", 0)}">api_key</label>`,
    ),
  );
  assert.match(
    out,
    new RegExp(`<input class="${INPUT_CLASS}" id="${fieldId(DEFAULT_ID, "api_key", 0)}" name="api_key"`),
  );
});

test("the declared default is both the input value and its placeholder", () => {
  const out = render({}, pageWith([{ name: "api_key", default: "YOUR_KEY" }]));
  assert.ok(out);
  assert.match(out, /\bvalue="YOUR_KEY"/);
  assert.match(out, /\bplaceholder="YOUR_KEY"/);
  assert.match(out, /data-var="api_key"/);
  assert.match(out, /\btype="text"/);
  assert.match(out, /autocomplete="off"/);
});

test("defaults are in the server-rendered markup, so the page works without JavaScript", () => {
  const out = render({}, pageWith([{ name: "host", default: "https://api.example.com" }]));
  assert.ok(out);
  assert.doesNotMatch(out, /<script\b/);
  assert.match(out, /\bvalue="https:\/\/api\.example\.com"/);
  assert.match(out, /\bplaceholder="https:\/\/api\.example\.com"/);
  assert.match(out, new RegExp(`<legend class="${LEGEND_CLASS}"`));
  assert.match(out, new RegExp(`<p class="${HINT_CLASS}"`));
  // Only the reset button starts hidden: it needs the island to put the examples back too.
  const withoutReset = out.replace(/<button\b[^>]*>Reset values<\/button>/, "");
  assert.doesNotMatch(withoutReset, /\bhidden\b/);
});

test("a form with no variables renders nothing", () => {
  assert.equal(render(), null);
  assert.equal(render({ variables: "[]" }, pageWith([{ name: "api_key" }])), null);
  assert.equal(render({ variables: "not json" }), null);
  assert.equal(render({}, pageWith([])), null);
  assert.equal(render({}, siteWith([])), null);
  assert.equal(render({}, siteWith("not a list")), null);
  assert.equal(render({}, siteWith({ api_key: "YOUR_KEY" })), null);
});

test("the page's declarations win over site.data for the same name", () => {
  const options = {
    frontMatter: { variables: [{ name: "api_key", default: "PAGE_KEY" }] },
    data: {
      variables: [
        { name: "api_key", default: "SITE_KEY", type: "string" },
        { name: "host", default: "https://site.example.com" },
      ],
    },
  };
  const out = render({}, options);
  assert.ok(out);
  assert.match(out, /\bvalue="PAGE_KEY"/);
  assert.match(out, /\bvalue="https:\/\/site\.example\.com"/);
  assert.doesNotMatch(out, /SITE_KEY/);
});

test("a page declaration without a default keeps the site default and type", () => {
  const fields = fieldsFor(
    {},
    { frontMatter: { variables: [{ name: "api_key" }] } },
    { data: { variables: [{ name: "api_key", default: "SITE_KEY", type: "string" }] } },
  );
  assert.deepEqual(fields, [{ name: "api_key", value: "SITE_KEY", type: "string" }]);
});

test("a valid variables prop is the whole list and wins over page and site data", () => {
  const out = render(
    { variables: '[{"name":"api_key","default":"PROP_KEY"}]' },
    { frontMatter: { variables: [{ name: "api_key", default: "PAGE_KEY" }] }, ...siteWith([{ name: "host" }]) },
  );
  assert.ok(out);
  assert.match(out, /\bvalue="PROP_KEY"/);
  assert.equal(countOf(out, /<input\b/g), 1);
});

test("an unreadable variables prop falls back to page and site data", () => {
  const out = render(
    { variables: "not json" },
    { frontMatter: { variables: [{ name: "api_key", default: "PAGE_KEY" }] } },
  );
  assert.ok(out);
  assert.match(out, /\bvalue="PAGE_KEY"/);
});

test("the declarations parser keeps the N33 shape and drops unusable items", () => {
  assert.deepEqual(
    declarationsOf([
      { name: " api_key ", default: "YOUR_KEY", type: " string " },
      { name: "host" },
      { name: "" },
      { default: "no name" },
      "api_key",
      { name: "port", default: 8080 },
    ]),
    [
      { name: "api_key", default: "YOUR_KEY", type: "string" },
      { name: "host" },
      { name: "port", default: 8080 },
    ],
  );
  assert.deepEqual(declarationsOf(undefined), []);
  assert.deepEqual(declarationsOf({ variables: [{ name: "api_key" }] }), []);
  assert.deepEqual(parseDeclarations("[]"), []);
  assert.equal(parseDeclarations(""), undefined);
  assert.equal(parseDeclarations("{}"), undefined);
  assert.equal(parseDeclarations(undefined), undefined);
});

test("merging fills a missing value and sorts by name", () => {
  const first: VariableDeclaration[] = [
    { name: "host", default: "https://site.example.com" },
    { name: "api_key", default: "SITE_KEY", type: "string" },
  ];
  const second: VariableDeclaration[] = [{ name: "api_key", default: "PAGE_KEY" }, { name: "port" }];
  assert.deepEqual(mergeDeclarations(first, second), [
    { name: "api_key", default: "PAGE_KEY", type: "string" },
    { name: "host", default: "https://site.example.com" },
    { name: "port" },
  ]);
  assert.deepEqual(declarationsFor({ variables: "[]" }, {}, {}), []);
});

test("defaults become text, and non-scalar or missing defaults become empty", () => {
  assert.equal(valueOf("YOUR_KEY"), "YOUR_KEY");
  assert.equal(valueOf(8080), "8080");
  assert.equal(valueOf(true), "true");
  assert.equal(valueOf(10n), "10");
  assert.equal(valueOf(undefined), "");
  assert.equal(valueOf(null), "");
  assert.equal(valueOf(["a"]), "");
  assert.equal(valueOf({ a: 1 }), "");

  const out = render(
    {},
    pageWith([
      { name: "port", default: 8080 },
      { name: "empty" },
    ]),
  );
  assert.ok(out);
  assert.match(out, /\bvalue="8080"/);
  assert.match(out, /id="variables-form-empty-1" name="empty" type="text" value placeholder/);
});

test("the id prop prefixes the ids and is reduced to safe characters", () => {
  assert.equal(idBase(undefined), DEFAULT_ID);
  assert.equal(idBase("  quick start  "), "quick-start");
  assert.equal(idBase('x"><script>'), "x-script");

  const out = render({ id: "quick start" }, pageWith([{ name: "api.key" }]));
  assert.ok(out);
  assert.match(out, /for="quick-start-api-key-1"/);
  assert.match(out, /id="quick-start-api-key-1"/);
  assert.match(out, /id="quick-start-hint"/);
});

test("the legend and hint follow the page language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const table = stringsOf(lang);
    const out = render({}, { lang, ...pageWith([{ name: "api_key" }]) });
    assert.ok(out, lang);
    assert.ok(out.includes(`>${table.variables_form_legend}</legend>`), `${lang} legend`);
    assert.ok(out.includes(`>${table.variables_form_hint}</p>`), `${lang} hint`);
  }
  const english = render({}, pageWith([{ name: "api_key" }]))!;
  assert.ok(english.includes(">Variables</legend>"));
  assert.ok(render({}, { lang: "fa", ...pageWith([{ name: "api_key" }]) })!.includes(">متغیرها</legend>"));
  assert.ok(render({}, { lang: "ar", ...pageWith([{ name: "api_key" }]) })!.includes(">المتغيّرات</legend>"));
});

test("names, defaults, and types are escaped, never parsed as markup", () => {
  const out = render(
    {},
    pageWith([
      { name: "<b>name</b>", default: '"><script>alert(1)</script>', type: "<i>x</i>" },
    ]),
  );
  assert.ok(out);
  assert.doesNotMatch(out, /<script/);
  assert.doesNotMatch(out, /<b>name<\/b>/);
  assert.match(out, /&lt;b>name&lt;\/b>/);
});

test("the form root and the hint are labelled for assistive tech", () => {
  const out = render({}, pageWith([{ name: "api_key" }]));
  assert.ok(out);
  assert.match(out, new RegExp(`^<fieldset class="${FORM_CLASS}" data-variables-form(?:>|\\s)`));
  assert.match(out, /<legend class="variables-form-legend" id="variables-form-legend">Variables<\/legend>/);
  assert.match(out, /<p class="variables-form-hint" id="variables-form-hint">/);
  assert.match(out, /aria-describedby="variables-form-hint"/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only, so right-to-left pages work", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /\btext-align\s*:\s*(left|right)\b/);
  assert.match(css, /margin-block:/);
  assert.match(css, /padding-inline:/);
  assert.match(css, /border-radius:/);
});

test("style.css gives the inputs a visible focus ring and shows the placeholder", () => {
  assert.match(css, /\.variables-form-input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.variables-form-input::placeholder\s*\{[^}]*color:\s*var\(--color-muted\)/s);
  assert.match(css, /\.variables-form-input::placeholder\s*\{[^}]*opacity:\s*1/s);
});

test("style.css marks a rejected value and gives the reset button a visible focus ring", () => {
  assert.match(css, /\.variables-form-input:invalid\s*\{[^}]*border-color:\s*var\(--color-danger\)/s);
  assert.match(css, /\.variables-form-reset:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
});

test("the island targets the engine's placeholder markup and records no values", () => {
  assert.equal(FORM_SELECTOR, "[data-variables-form]");
  assert.equal(INPUT_SELECTOR, "input[data-var]");
  assert.equal(RESET_SELECTOR, "[data-variables-reset]");
  assert.equal(INLINE_SELECTOR, ".placeholder[data-var]");
  assert.equal(BLOCK_SELECTOR, "[data-placeholders]");
  assert.equal(OUTPUT_DEPENDENCY_SELECTOR, "[data-output-deps]");
  assert.equal(STALE_NOTE_SELECTOR, "[data-output-stale-note]");
  assert.equal(STALE_ATTRIBUTE, "data-output-stale");
  assert.equal(tokenOf("api_key"), "{{api_key}}");

  assert.doesNotMatch(client, /\blocalStorage\b|\bsessionStorage\b|document\.cookie|\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(client, /\beval\s*\(|\bnew Function\b|\bimport\s*\(/);
  assert.doesNotMatch(client, /navigator\s*\.\s*clipboard/);
});

test("namesOf reads the code block's recorded variable names", () => {
  assert.deepEqual(namesOf('[{"name":"api_key","line":1},{"name":"host"}]'), ["api_key", "host"]);
  assert.deepEqual(namesOf("[]"), []);
  assert.deepEqual(namesOf("not json"), []);
  assert.deepEqual(namesOf(null), []);
  assert.deepEqual(namesOf('{"name":"api_key"}'), []);
});

/** A text node the island can rewrite. */
class FakeText implements PlaceholderNode {
  readonly nodeType = 3;
  textContent: string | null;

  constructor(value: string) {
    this.textContent = value;
  }

  get childNodes(): undefined {
    return undefined;
  }

  getAttribute(): string | null {
    return null;
  }
}

/** An element with children and attributes. */
class FakeElement implements PlaceholderNode {
  readonly nodeType = 1;
  readonly childNodes: PlaceholderNode[];
  attrs: Record<string, string>;

  constructor(attrs: Readonly<Record<string, string>>, children: PlaceholderNode[] = []) {
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

  /** Supports the one selector the island uses inside a node: `[attribute]`. */
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

/** A page root returning the inline spans, code blocks, outputs, and buttons the test made. */
class FakeRoot implements PlaceholderRoot {
  readonly inline: PlaceholderNode[];
  readonly blocks: PlaceholderNode[];
  readonly outputs: PlaceholderNode[];

  constructor(inline: PlaceholderNode[], blocks: PlaceholderNode[], outputs: PlaceholderNode[] = []) {
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
  readonly listeners: Array<() => void>;
  accepted = true;

  constructor(name: string, value: string, fallback = value) {
    this.name = name;
    this.value = value;
    this.fallback = fallback;
    this.listeners = [];
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

/** The reset button the form renders, with a click the test can fire. */
class FakeReset implements ResetButton {
  hidden = true;
  readonly listeners: Array<() => void> = [];

  addEventListener(_type: "click", listener: () => void): void {
    this.listeners.push(listener);
  }

  click(): void {
    for (const listener of this.listeners) listener();
  }
}

/** A form returning the inputs and reset button the test made. */
class FakeForm implements VariableForm {
  readonly inputs: VariableInput[];
  readonly reset: ResetButton | undefined;

  constructor(inputs: VariableInput[], reset?: ResetButton) {
    this.inputs = inputs;
    this.reset = reset;
  }

  querySelectorAll(selector: string): Iterable<VariableInput> {
    return selector === INPUT_SELECTOR ? this.inputs : [];
  }

  querySelector(selector: string): ResetButton | null {
    return selector === RESET_SELECTOR ? (this.reset ?? null) : null;
  }
}

test("typing in an input updates that variable's inline placeholders only", () => {
  const api = new FakeElement({ "data-var": "api_key" }, [new FakeText("{{api_key}}")]);
  const host = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const root = new FakeRoot([api, host], []);

  applyValue(root, "api_key", "SECRET");
  assert.equal(api.textContent, "SECRET");
  assert.equal(host.textContent, "{{host}}");
  assert.equal(replaceIn(root.inline[0]!, "{{host}}", "x"), false);
});

test("a code block's recorded placeholder updates, keeping its markup when it can", () => {
  const code = new FakeElement(
    { "data-placeholders": '[{"name":"api_key"},{"name":"host"}]' },
    [new FakeText("curl "), new FakeText("{{api_key}}"), new FakeText("/x")],
  );
  const other = new FakeElement({ "data-placeholders": '[{"name":"host"}]' }, [new FakeText("{{host}}")]);
  const root = new FakeRoot([], [code, other]);

  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "curl SECRET/x");
  assert.equal(other.textContent, "{{host}}");
});

test("a highlighted token split across spans still changes as a whole", () => {
  const code = new FakeElement(
    { "data-placeholders": '[{"name":"api_key"}]' },
    [new FakeText("{{api"), new FakeText("_key}}")],
  );
  const root = new FakeRoot([], [code]);
  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "SECRET");
});

test("text identical to a value the block showed before is never rewritten", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeText("KEY={{api_key}}; YOUR_KEY above is only an example"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "api_key", "YOUR_KEY");
  assert.equal(code.textContent, "KEY=YOUR_KEY; YOUR_KEY above is only an example");
  applyValue(root, "api_key", "LIVE_KEY");
  assert.equal(code.textContent, "KEY=LIVE_KEY; YOUR_KEY above is only an example");
});

test("repeated, adjacent, and split-span placeholders all follow the same variable", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"host"}]' }, [
    new FakeText("{{host}}"),
    new FakeText("{{ho"),
    new FakeText("st}}/{{host}}"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "host", "https://one.example.com");
  assert.equal(code.textContent, "https://one.example.comhttps://one.example.com/https://one.example.com");
  applyValue(root, "host", "https://two.example.com");
  assert.equal(code.textContent, "https://two.example.comhttps://two.example.com/https://two.example.com");
});

test("a highlighted token round-trips without flattening the spans around it", () => {
  const token = new FakeElement({ class: "token" }, [new FakeText("{{api"), new FakeText("_key}}")]);
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeElement({ class: "line" }, [new FakeText("curl -H "), token, new FakeText(" /v1")]),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "curl -H SECRET /v1");
  assert.equal(code.childNodes.length, 1);
  assert.equal(token.childNodes.length, 2, "the highlighted token keeps both of its spans");

  applyValue(root, "api_key", "OTHER");
  assert.equal(code.textContent, "curl -H OTHER /v1");
  assert.equal(token.childNodes.length, 2);
});

test("an escaped placeholder stays literal while the real one follows the value", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeText("echo \\{{api_key}} {{api_key}}"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "echo \\{{api_key}} SECRET");
  applyValue(root, "api_key", "OTHER");
  assert.equal(code.textContent, "echo \\{{api_key}} OTHER");
});

test("an even run of backslashes leaves a variable the island follows", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeText("echo \\\\{{api_key}}"),
  ]);
  const root = new FakeRoot([], [code]);
  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "echo \\\\SECRET");
});

test("swapped values never cascade into each other", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"a"},{"name":"b"}]' }, [
    new FakeText("a={{a}} b={{b}}"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "a", "two");
  applyValue(root, "b", "one");
  assert.equal(code.textContent, "a=two b=one");
  applyValue(root, "a", "one");
  applyValue(root, "b", "two");
  assert.equal(code.textContent, "a=one b=two");
});

test("a value that looks like another placeholder is inserted once, not expanded", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"a"},{"name":"b"}]' }, [
    new FakeText("a={{a}} b={{b}}"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "a", "{{b}}");
  applyValue(root, "b", "N");
  assert.equal(code.textContent, "a={{b}} b=N");
});

test("a token the author spaced inside the braces still matches its variable", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"},{"name":"host"}]' }, [
    new FakeText("curl -H 'Bearer {{ api_key }}' {{host}}/v1"),
  ]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "api_key", "SECRET");
  assert.equal(code.textContent, "curl -H 'Bearer SECRET' {{host}}/v1");
  applyValue(root, "host", "https://api.example.com");
  assert.equal(code.textContent, "curl -H 'Bearer SECRET' https://api.example.com/v1");
});

test("two forms on one page follow their own variables without touching the other", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"a"},{"name":"b"}]' }, [
    new FakeText("{{a}}/{{b}}"),
  ]);
  const root = new FakeRoot([], [code]);

  activate(root, new FakeForm([new FakeInput("a", "one")]));
  activate(root, new FakeForm([new FakeInput("b", "two")]));
  assert.equal(code.textContent, "one/two");

  const b = new FakeInput("b", "three");
  activate(root, new FakeForm([b]));
  assert.equal(code.textContent, "one/three");
  b.type("four");
  assert.equal(code.textContent, "one/four");
});

test("the copied commands are the command text the block now shows", () => {
  const text = new FakeElement({ class: "terminal-text" }, [new FakeText("curl {{host}}/v1")]);
  const line = new FakeElement({ class: "terminal-command" }, [text]);
  const code = new FakeElement({ "data-placeholders": '[{"name":"host"}]' }, [line]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "host", "https://sandbox.example.com");
  assert.equal(text.textContent, "curl https://sandbox.example.com/v1");
  assert.equal(commandsOf({ querySelectorAll: () => [text] }), text.textContent);
});

test("reset puts the authored defaults back into a highlighted example", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeElement({ class: "line" }, [new FakeText("Bearer "), new FakeText("{{api_key}}")]),
  ]);
  const root = new FakeRoot([], [code]);
  const api = new FakeInput("api_key", "YOUR_KEY");
  const reset = new FakeReset();

  activate(root, new FakeForm([api], reset));
  api.type("LIVE_KEY");
  assert.equal(code.textContent, "Bearer LIVE_KEY");
  reset.click();
  assert.equal(code.textContent, "Bearer YOUR_KEY");
});

test("activate wires each input and starts from the form's defaults", () => {
  const span = new FakeElement({ "data-var": "api_key" }, [new FakeText("{{api_key}}")]);
  const root = new FakeRoot([span], []);
  const api = new FakeInput("api_key", "YOUR_KEY");
  const form = new FakeForm([api]);

  assert.deepEqual(valuesOf(form), new Map([["api_key", "YOUR_KEY"]]));
  assert.deepEqual(activate(root, form), ["api_key"]);
  assert.equal(span.textContent, "YOUR_KEY");

  api.type("LIVE_KEY");
  assert.equal(span.textContent, "LIVE_KEY");
});

test("an input without a variable name is ignored", () => {
  const root = new FakeRoot([], []);
  const nameless = new FakeInput("", "x");
  const form = new FakeForm([nameless]);
  assert.deepEqual(activate(root, form), []);
  assert.deepEqual(valuesOf(form), new Map());
});

test("a second change replaces the value a code block already shows", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"host"}]' }, [new FakeText("curl {{host}}/v1")]);
  const root = new FakeRoot([], [code]);

  applyValue(root, "host", "https://one.example.com");
  assert.equal(code.textContent, "curl https://one.example.com/v1");
  applyValue(root, "host", "https://two.example.com");
  assert.equal(code.textContent, "curl https://two.example.com/v1");
});

test("marking a change stale touches only the outputs that depend on it", () => {
  const note = new FakeElement({ "data-output-stale-note": "" }, [new FakeText("")]);
  const dependent = new FakeElement(
    { "data-output-deps": '[{"name":"host"}]', "data-stale-text": "Run the command again." },
    [new FakeText("old output"), note],
  );
  const other = new FakeElement({ "data-output-deps": '[{"name":"api_key"}]' }, [new FakeText("other output")]);
  const root = new FakeRoot([], [], [dependent, other]);

  assert.equal(markStale(root, "host"), 1);
  assert.equal(dependent.getAttribute("data-output-stale"), "true");
  assert.equal(note.textContent, "Run the command again.");
  assert.equal(dependent.textContent, "old outputRun the command again.", "the recorded output itself never changes");
  assert.equal(other.getAttribute("data-output-stale"), null);
  assert.equal(markStale(root, "missing"), 0);
});

test("typing updates the examples and marks dependent output stale", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const output = new FakeElement(
    { "data-output-deps": '[{"name":"host"}]', "data-stale-text": "Run the command again." },
    [new FakeText("200 OK")],
  );
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");

  activate(root, new FakeForm([host]));
  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null, "the documented defaults are not stale");

  host.type("https://sandbox.example.com");
  assert.equal(span.textContent, "https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");
});

test("a value the declared type rejects never reaches an example or marks output stale", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const output = new FakeElement({ "data-output-deps": '[{"name":"host"}]' }, [new FakeText("200 OK")]);
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");
  host.accepted = false;

  activate(root, new FakeForm([host]));
  host.type("not a url");

  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null);
});

test("the reset button starts hidden, and puts every declared default back", () => {
  const span = new FakeElement({ "data-var": "api_key" }, [new FakeText("{{api_key}}")]);
  const root = new FakeRoot([span], []);
  const reset = new FakeReset();
  const api = new FakeInput("api_key", "YOUR_KEY", "YOUR_KEY");
  const form = new FakeForm([api], reset);

  activate(root, form);
  assert.equal(reset.hidden, false);

  api.type("LIVE_KEY");
  assert.equal(span.textContent, "LIVE_KEY");

  reset.click();
  assert.equal(api.value, "YOUR_KEY");
  assert.equal(span.textContent, "YOUR_KEY");
});

/** A recorded output listing these dependency names, with its stale note inside. */
function outputWith(deps: readonly string[]): { readonly output: FakeElement; readonly note: FakeElement } {
  const note = new FakeElement({ "data-output-stale-note": "" }, [new FakeText("")]);
  const output = new FakeElement(
    {
      "data-output-deps": JSON.stringify(deps.map((name) => ({ name }))),
      "data-stale-text": "Run the command again.",
    },
    [new FakeText("200 OK"), note],
  );
  return { output, note };
}

test("editing away and back to the recorded value makes the output fresh again", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const { output, note } = outputWith(["host"]);
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");

  activate(root, new FakeForm([host]));
  host.type("https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");
  assert.equal(note.textContent, "Run the command again.");

  host.type("https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null, "the recorded value restores freshness");
  assert.equal(note.textContent, "");
  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(output.childNodes[0]!.textContent, "200 OK", "the recorded output text is never rewritten");
});

test("an output with several dependencies clears only when every one is restored", () => {
  const { output } = outputWith(["host", "api_key"]);
  const root = new FakeRoot([], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");
  const api = new FakeInput("api_key", "YOUR_KEY");

  activate(root, new FakeForm([host, api]));
  host.type("https://sandbox.example.com");
  api.type("LIVE_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  api.type("YOUR_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true", "a remaining changed dependency keeps it stale");

  host.type("https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null);
});

test("dependencies spread across two forms share one freshness check", () => {
  const { output } = outputWith(["host", "api_key"]);
  const root = new FakeRoot([], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");
  const api = new FakeInput("api_key", "YOUR_KEY");

  activate(root, new FakeForm([host]));
  activate(root, new FakeForm([api]));
  host.type("https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");
  api.type("LIVE_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  api.type("YOUR_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true", "the other form still holds a changed value");
  host.type("https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null);
});

test("reset restores the examples and the output freshness together", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const { output, note } = outputWith(["host", "api_key"]);
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");
  const api = new FakeInput("api_key", "YOUR_KEY");
  const reset = new FakeReset();

  activate(root, new FakeForm([host, api], reset));
  host.type("https://sandbox.example.com");
  api.type("LIVE_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  reset.click();
  assert.equal(host.value, "https://api.example.com");
  assert.equal(api.value, "YOUR_KEY");
  assert.equal(span.textContent, "https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null, "reset clears freshness in the same step");
  assert.equal(note.textContent, "");
});

test("an invalid value never fabricates a fresh output", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const { output } = outputWith(["host"]);
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");

  activate(root, new FakeForm([host]));
  host.type("https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  host.accepted = false;
  host.type("https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true", "a rejected value does not claim freshness");
  assert.equal(span.textContent, "https://sandbox.example.com", "a rejected value never reaches the example");

  host.accepted = true;
  host.type("https://api.example.com");
  assert.equal(output.getAttribute("data-output-stale"), null);
  assert.equal(span.textContent, "https://api.example.com");
});

test("a reset the type rejects restores the input but never marks the output fresh", () => {
  const span = new FakeElement({ "data-var": "host" }, [new FakeText("{{host}}")]);
  const { output } = outputWith(["host"]);
  const root = new FakeRoot([span], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");
  const reset = new FakeReset();

  activate(root, new FakeForm([host], reset));
  host.type("https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  host.accepted = false;
  reset.click();
  assert.equal(host.value, "https://api.example.com", "the input itself returns to the declared default");
  assert.equal(span.textContent, "https://sandbox.example.com", "the rejected default never reaches the example");
  assert.equal(output.getAttribute("data-output-stale"), "true");
});

test("an output whose dependency no form holds never becomes fresh again", () => {
  const { output } = outputWith(["host", "region"]);
  const root = new FakeRoot([], [], [output]);
  const host = new FakeInput("host", "https://api.example.com");

  activate(root, new FakeForm([host]));
  assert.equal(output.getAttribute("data-output-stale"), null, "nothing is stale before a change");
  host.type("https://sandbox.example.com");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  host.type("https://api.example.com");
  assert.equal(
    output.getAttribute("data-output-stale"),
    "true",
    "without a baseline for region the island never infers freshness",
  );
});

test("duplicate names follow one recorded baseline, and an undepended output stays untouched", () => {
  const { output } = outputWith(["api_key"]);
  const plain = new FakeElement({}, [new FakeText("static output")]);
  const root = new FakeRoot([], [], [output, plain]);
  const first = new FakeInput("api_key", "YOUR_KEY");
  const second = new FakeInput("api_key", "YOUR_KEY");

  assert.deepEqual(activate(root, new FakeForm([first, second])), ["api_key", "api_key"]);
  first.type("LIVE_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  first.type("YOUR_KEY");
  assert.equal(output.getAttribute("data-output-stale"), null);
  assert.equal(plain.getAttribute("data-output-stale"), null, "an output with no dependencies is never marked");
});

test("an edit-and-restore cycle keeps escaped placeholders literal", () => {
  const code = new FakeElement({ "data-placeholders": '[{"name":"api_key"}]' }, [
    new FakeText("echo \\{{api_key}} {{api_key}}"),
  ]);
  const { output } = outputWith(["api_key"]);
  const root = new FakeRoot([], [code], [output]);
  const api = new FakeInput("api_key", "YOUR_KEY");

  activate(root, new FakeForm([api]));
  api.type("LIVE_KEY");
  assert.equal(code.textContent, "echo \\{{api_key}} LIVE_KEY");
  assert.equal(output.getAttribute("data-output-stale"), "true");

  api.type("YOUR_KEY");
  assert.equal(code.textContent, "echo \\{{api_key}} YOUR_KEY", "the authored text is the template every time");
  assert.equal(output.getAttribute("data-output-stale"), null);
});

test("recomputeStaleness changes nothing before a form is wired, and recheck is idempotent", () => {
  const { output } = outputWith(["host"]);
  const root = new FakeRoot([], [], [output]);

  recomputeStaleness(root);
  assert.equal(output.getAttribute("data-output-stale"), null, "without a wired form nothing is claimed");

  const host = new FakeInput("host", "https://api.example.com");
  activate(root, new FakeForm([host]));
  host.type("https://sandbox.example.com");
  recomputeStaleness(root);
  assert.equal(output.getAttribute("data-output-stale"), "true", "recomputing twice marks the same");
  host.type("https://api.example.com");
  recomputeStaleness(root);
  assert.equal(output.getAttribute("data-output-stale"), null);
  recomputeStaleness(root);
  assert.equal(output.getAttribute("data-output-stale"), null, "a fresh output stays fresh");
});
