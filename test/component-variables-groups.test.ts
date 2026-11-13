import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import variablesForm, {
  ERROR_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  GROUP_EXPLICIT_ATTRIBUTE,
  INVALID_ATTRIBUTE,
  RESET_TEXT_ATTRIBUTE,
  TYPE_ATTRIBUTE,
  type VariablesFormProps,
} from "../components/variables-form/index.ts";
import {
  BLOCK_SELECTOR,
  ERROR_SELECTOR,
  FORM_SELECTOR,
  INLINE_SELECTOR,
  INPUT_SELECTOR,
  OUTPUT_DEPENDENCY_SELECTOR,
  RESET_SELECTOR,
  STATUS_SELECTOR,
  TERMINAL_BUTTON_SELECTOR,
  TERMINAL_STATUS_SELECTOR,
  activate,
  type PlaceholderNode,
  type PlaceholderRoot,
  type ResetButton,
  type VariableForm,
  type VariableInput,
} from "../components/variables-form/client.ts";

function render(props: VariablesFormProps = {}): string {
  const input = {
    props: { variables: '[{"name":"host"}]', ...props },
    page: { lang: "en", frontMatter: {} },
    site: { data: {} },
    html: "",
  } as unknown as ComponentProps<VariablesFormProps>;
  return renderToString(variablesForm(input) as never) ?? "";
}

class Text implements PlaceholderNode {
  readonly nodeType = 3;
  textContent: string | null;
  readonly childNodes = undefined;

  constructor(value: string) {
    this.textContent = value;
  }

  getAttribute(): string | null {
    return null;
  }
}

class Element implements PlaceholderNode {
  readonly nodeType = 1;
  readonly childNodes: PlaceholderNode[];
  readonly attrs: Record<string, string>;
  hidden = false;
  disabled = false;

  constructor(attrs: Record<string, string>, children: PlaceholderNode[] = []) {
    this.attrs = { ...attrs };
    this.childNodes = children;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent ?? "").join("");
  }

  set textContent(value: string) {
    this.childNodes.length = 0;
    this.childNodes.push(new Text(value));
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

class Input implements VariableInput {
  value: string;
  readonly attrs: Record<string, string>;
  readonly listeners: Array<() => void> = [];
  accepted = true;

  constructor(name: string, value: string, type = "string", attrs: Record<string, string> = {}) {
    this.value = value;
    this.attrs = { "data-var": name, "data-default": attrs["data-default"] ?? value, [TYPE_ATTRIBUTE]: type, ...attrs };
  }

  get validity(): { readonly valid: boolean } {
    return { valid: this.accepted };
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

  addEventListener(_type: "input", listener: () => void): void {
    this.listeners.push(listener);
  }

  type(value: string): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}

class Reset implements ResetButton {
  hidden = true;
  readonly listeners: Array<() => void> = [];

  addEventListener(_type: "click", listener: () => void): void {
    this.listeners.push(listener);
  }

  click(): void {
    for (const listener of this.listeners) listener();
  }
}

class Form implements VariableForm {
  readonly attrs: Record<string, string>;
  readonly inputs: Input[];
  readonly reset: Reset | undefined;
  readonly errors: Element[];
  readonly status: Element;
  readonly listeners: Array<() => void> = [];
  hidden = true;
  disabled = false;

  constructor(group: string | undefined, inputs: Input[], options: { explicit?: boolean; reset?: Reset } = {}) {
    this.inputs = inputs;
    this.reset = options.reset;
    this.attrs = group === undefined ? {} : { [GROUP_ATTRIBUTE]: group };
    if (options.explicit === true) this.attrs[GROUP_EXPLICIT_ATTRIBUTE] = "true";
    this.attrs[RESET_TEXT_ATTRIBUTE] = "Values reset.";
    this.errors = inputs
      .filter((input) => (input.getAttribute(TYPE_ATTRIBUTE) ?? "string") !== "string")
      .map((input) => new Element({ [ERROR_ATTRIBUTE]: input.getAttribute("data-var") ?? "", hidden: "" }));
    for (const error of this.errors) error.hidden = true;
    this.status = new Element({});
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

  querySelectorAll(selector: string): Iterable<unknown> {
    if (selector === INPUT_SELECTOR) return this.inputs;
    if (selector === ERROR_SELECTOR) return this.errors;
    return [];
  }

  querySelector(selector: string): unknown {
    if (selector === RESET_SELECTOR) return this.reset ?? null;
    if (selector === STATUS_SELECTOR) return this.status;
    return null;
  }
}

class Root implements PlaceholderRoot {
  readonly forms: Form[];
  readonly inline: PlaceholderNode[] = [];
  readonly blocks: Element[] = [];
  readonly outputs: Element[] = [];
  readonly buttons: Element[] = [];
  readonly statuses: Element[] = [];

  constructor(forms: Form[]) {
    this.forms = forms;
  }

  querySelectorAll(selector: string): Iterable<PlaceholderNode> {
    if (selector === FORM_SELECTOR) return this.forms as unknown as PlaceholderNode[];
    if (selector === INLINE_SELECTOR) return this.inline;
    if (selector === BLOCK_SELECTOR) return this.blocks;
    if (selector === OUTPUT_DEPENDENCY_SELECTOR) return this.outputs;
    if (selector === TERMINAL_BUTTON_SELECTOR) return this.buttons;
    if (selector === TERMINAL_STATUS_SELECTOR) return this.statuses;
    return [];
  }
}

function terminal(group: string): { block: Element; button: Element; status: Element } {
  const button = new Element({ "data-terminal-copy": "", [GROUP_ATTRIBUTE]: group });
  const status = new Element({ "data-terminal-status": "", "data-invalid-text": "Fix the values first.", [GROUP_ATTRIBUTE]: group });
  const block = new Element({ "data-placeholders": '[{"name":"host"}]', [GROUP_ATTRIBUTE]: group }, [new Text("{{host}}")]);
  return { block, button, status };
}

function output(deps: readonly string[], group: string, staleText = "Run the command again."): Element {
  return new Element(
    {
      "data-output-deps": JSON.stringify(deps.map((name) => ({ name }))),
      "data-stale-text": staleText,
      [GROUP_ATTRIBUTE]: group,
    },
    [new Text("200 OK"), new Element({ "data-output-stale-note": "" })],
  );
}

test("markup: a derived group needs no explicit marker, an authored one is marked", () => {
  assert.match(render(), /data-variable-group="variables-form"/);
  assert.doesNotMatch(render(), /data-variable-group-explicit/);

  const authored = render({ group: "install" });
  assert.match(authored, /data-variable-group="install"/);
  assert.match(authored, /data-variable-group-explicit="true"/);

  const malformed = render({ group: "not a group" });
  assert.match(malformed, /data-variable-group="variables-form"/);
  assert.doesNotMatch(malformed, /data-variable-group-explicit/);
});

test("markup: a typed variable is a text input with a message and a status region", () => {
  const out = render({ variables: '[{"name":"host","default":"/v1","type":"url"}]' });
  assert.match(out, /type="text"[^>]*data-type="url"/);
  assert.match(out, /aria-describedby="variables-form-hint variables-form-host-1-error"/);
  assert.match(out, /class="variables-form-error"[^>]*data-error-for="host"[^>]*hidden/);
  assert.match(out, /role="status" data-variables-status/);
});

test("island: a group updates only its own terminal", () => {
  const first = new Input("host", "https://a.example.com");
  const second = new Input("host", "https://b.example.com");
  const formA = new Form("a", [first]);
  const formB = new Form("b", [second]);
  const root = new Root([formA, formB]);
  const a = terminal("a");
  const b = terminal("b");
  root.blocks.push(a.block, b.block);
  root.buttons.push(a.button, b.button);
  root.statuses.push(a.status, b.status);

  activate(root, formA);
  activate(root, formB);
  assert.equal(a.block.textContent, "https://a.example.com");
  assert.equal(b.block.textContent, "https://b.example.com");

  first.type("https://changed.example.com");
  assert.equal(a.block.textContent, "https://changed.example.com");
  assert.equal(b.block.textContent, "https://b.example.com", "the other group is untouched");
});

test("island: with two forms, an ungrouped terminal is left alone", () => {
  const formA = new Form("a", [new Input("host", "https://a.example.com")]);
  const formB = new Form("b", [new Input("host", "https://b.example.com")]);
  const root = new Root([formA, formB]);
  const loose = new Element({ "data-placeholders": '[{"name":"host"}]' }, [new Text("{{host}}")]);
  root.blocks.push(loose);

  activate(root, formA);
  activate(root, formB);
  assert.equal(loose.textContent, "{{host}}");
});

test("island: one form with no authored group keeps the page-wide behavior", () => {
  const form = new Form(undefined, [new Input("host", "https://a.example.com")]);
  const root = new Root([form]);
  const loose = new Element({ "data-placeholders": '[{"name":"host"}]' }, [new Text("{{host}}")]);
  const span = new Element({ "data-var": "host" }, [new Text("{{host}}")]);
  root.blocks.push(loose);
  root.inline.push(span);

  activate(root, form);
  assert.equal(loose.textContent, "https://a.example.com");
  assert.equal(span.textContent, "https://a.example.com");
});

test("island: an authored group turns the legacy behavior off for ungrouped examples", () => {
  const form = new Form("install", [new Input("host", "https://a.example.com")], { explicit: true });
  const root = new Root([form]);
  const loose = new Element({ "data-placeholders": '[{"name":"host"}]' }, [new Text("{{host}}")]);
  root.blocks.push(loose);

  activate(root, form);
  assert.equal(loose.textContent, "{{host}}");
});

test("island: validation follows url, number, and boolean, and clears on a valid value", () => {
  const cases = [
    { type: "url", good: "/v1/status", bad: "//host/path" },
    { type: "number", good: "-1.5e3", bad: "1,000" },
    { type: "boolean", good: "TRUE", bad: "yes" },
  ] as const;

  for (const item of cases) {
    const input = new Input("value", item.good, item.type);
    const form = new Form("g", [input]);
    const root = new Root([form]);
    const term = terminal("g");
    root.blocks.push(term.block);
    root.buttons.push(term.button);
    root.statuses.push(term.status);

    activate(root, form);
    assert.equal(term.button.disabled, false, `${item.type}: a valid default does not block copy`);

    input.type(item.bad);
    assert.equal(input.getAttribute("aria-invalid"), "true", `${item.type}: invalid is marked`);
    assert.equal(form.getAttribute(INVALID_ATTRIBUTE), "true");
    assert.equal(form.errors[0]!.hidden, false, `${item.type}: the message is visible`);
    assert.equal(term.button.disabled, true, `${item.type}: terminal copy is blocked`);
    assert.equal(term.status.textContent, "Fix the values first.", `${item.type}: the reason is announced`);

    input.type(item.good);
    assert.equal(input.getAttribute("aria-invalid"), null);
    assert.equal(form.getAttribute(INVALID_ATTRIBUTE), null);
    assert.equal(form.errors[0]!.hidden, true);
    assert.equal(term.button.disabled, false);
    assert.equal(term.status.textContent, "");
  }
});

test("island: an invalid default is marked and blocks copy before any typing", () => {
  const input = new Input("host", "not a url", "url");
  const form = new Form("g", [input]);
  const root = new Root([form]);
  const term = terminal("g");
  root.blocks.push(term.block);
  root.buttons.push(term.button);
  root.statuses.push(term.status);

  activate(root, form);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(term.button.disabled, true);
  assert.equal(term.block.textContent, "{{host}}", "an invalid default never reaches the example");
});

test("island: only the group's output goes stale, and an invalid input keeps it stale", () => {
  const host = new Input("host", "https://a.example.com", "url");
  const formA = new Form("a", [host]);
  const formB = new Form("b", [new Input("host", "https://b.example.com", "url")]);
  const root = new Root([formA, formB]);
  const a = output(["host"], "a");
  const b = output(["host"], "b");
  root.outputs.push(a, b);

  activate(root, formA);
  activate(root, formB);
  host.type("https://changed.example.com");
  assert.equal(a.getAttribute("data-output-stale"), "true");
  assert.equal(b.getAttribute("data-output-stale"), null, "the other group stays fresh");

  host.type("not a url");
  assert.equal(a.getAttribute("data-output-stale"), "true");
  assert.equal(b.getAttribute("data-output-stale"), null);

  host.type("https://a.example.com");
  assert.equal(a.getAttribute("data-output-stale"), null, "returning to the recorded value clears the state");
});

test("island: reset restores one group, clears its stale output, and announces itself", () => {
  const hostA = new Input("host", "https://a.example.com", "url");
  const hostB = new Input("host", "https://b.example.com", "url");
  const resetA = new Reset();
  const formA = new Form("a", [hostA], { reset: resetA });
  const formB = new Form("b", [hostB]);
  const root = new Root([formA, formB]);
  const a = output(["host"], "a");
  root.outputs.push(a);

  activate(root, formA);
  activate(root, formB);
  hostA.type("https://changed.example.com");
  assert.equal(a.getAttribute("data-output-stale"), "true");
  assert.equal(resetA.hidden, false);

  resetA.click();
  assert.equal(hostA.value, "https://a.example.com");
  assert.equal(hostB.value, "https://b.example.com", "the other form keeps its value");
  assert.equal(a.getAttribute("data-output-stale"), null);
  assert.equal(formA.status.textContent, "Values reset.");
});

test("island: reset revalidates an invalid default and keeps copy blocked", () => {
  const host = new Input("host", "not a url", "url");
  const reset = new Reset();
  const form = new Form("a", [host], { reset });
  const root = new Root([form]);
  const term = terminal("a");
  root.blocks.push(term.block);
  root.buttons.push(term.button);
  root.statuses.push(term.status);

  activate(root, form);
  reset.click();
  assert.equal(host.getAttribute("aria-invalid"), "true");
  assert.equal(term.button.disabled, true, "a reset never makes an invalid default copyable");
});
