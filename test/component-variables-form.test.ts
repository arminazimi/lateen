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
  declarationsFor,
  declarationsOf,
  directive,
  fieldId,
  fieldsFor,
  idBase,
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
  activate,
  applyValue,
  namesOf,
  replaceIn,
  tokenOf,
  valuesOf,
  type PlaceholderNode,
  type PlaceholderRoot,
  type VariableForm,
  type VariableInput,
} from "../components/variables-form/client.ts";

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
    [FORM_CLASS, LEGEND_CLASS, HINT_CLASS, FIELDS_CLASS, FIELD_CLASS, LABEL_CLASS, INPUT_CLASS],
    [
      "variables-form",
      "variables-form-legend",
      "variables-form-hint",
      "variables-form-fields",
      "variables-form-field",
      "variables-form-label",
      "variables-form-input",
    ],
  );
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
  assert.doesNotMatch(out, /\bhidden\b/);
  assert.doesNotMatch(out, /<script\b/);
  assert.match(out, /\bvalue="https:\/\/api\.example\.com"/);
  assert.match(out, /\bplaceholder="https:\/\/api\.example\.com"/);
  assert.match(out, new RegExp(`<legend class="${LEGEND_CLASS}"`));
  assert.match(out, new RegExp(`<p class="${HINT_CLASS}"`));
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

test("the island targets the engine's placeholder markup and records no values", () => {
  assert.equal(FORM_SELECTOR, "[data-variables-form]");
  assert.equal(INPUT_SELECTOR, "input[data-var]");
  assert.equal(INLINE_SELECTOR, ".placeholder[data-var]");
  assert.equal(BLOCK_SELECTOR, "[data-placeholders]");
  assert.equal(tokenOf("api_key"), "{{api_key}}");

  assert.doesNotMatch(client, /\blocalStorage\b|\bsessionStorage\b|document\.cookie|\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
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
  readonly attrs: Readonly<Record<string, string>>;

  constructor(attrs: Readonly<Record<string, string>>, children: PlaceholderNode[] = []) {
    this.attrs = attrs;
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
}

/** A page root returning the inline spans and code blocks the test made. */
class FakeRoot implements PlaceholderRoot {
  readonly inline: PlaceholderNode[];
  readonly blocks: PlaceholderNode[];

  constructor(inline: PlaceholderNode[], blocks: PlaceholderNode[]) {
    this.inline = inline;
    this.blocks = blocks;
  }

  querySelectorAll(selector: string): Iterable<PlaceholderNode> {
    if (selector === INLINE_SELECTOR) return this.inline;
    if (selector === BLOCK_SELECTOR) return this.blocks;
    return [];
  }
}

/** An input that remembers its listeners so a test can type. */
class FakeInput implements VariableInput {
  value: string;
  readonly name: string;
  readonly listeners: Array<() => void>;

  constructor(name: string, value: string) {
    this.name = name;
    this.value = value;
    this.listeners = [];
  }

  getAttribute(name: string): string | null {
    return name === "data-var" ? this.name : null;
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
    return selector === INPUT_SELECTOR ? this.inputs : [];
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
