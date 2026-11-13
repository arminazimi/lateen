import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { all, attrs, build, root, textOf, type BuiltSite } from "./integration-helpers.ts";

let site: BuiltSite;
let document: Document;

before(() => {
  site = build("integration");
  document = site.document("/guide/install/");
});

after(() => rmSync(site.out, { recursive: true, force: true }));

/** A source span as the engine writes it: `path:line:column-endLine:column`. */
const SPAN = /^(.*):(\d+):(\d+)-(\d+):(\d+)$/;

test("copy actions name one Markdown twin, a status region, and the same result messages", () => {
  const twin = "/guide/install/index.md";
  assert.ok(existsSync(join(site.out, "guide/install/index.md")));
  assert.equal(document.querySelector("[data-copy-markdown-button]")?.getAttribute("data-markdown"), twin);
  assert.equal(document.querySelector(".copy-markdown-link")?.getAttribute("href"), twin);
  assert.equal(document.querySelector("[data-page-agent-copy]")?.getAttribute("data-markdown"), twin);

  for (const selector of ["[data-copy-markdown-status]", "[data-page-agent-status]"]) {
    const status = document.querySelector(selector);
    assert.equal(status?.getAttribute("role"), "status");
    assert.equal(textOf(status), "");
  }

  const copied = document.querySelector("[data-copy-markdown-button]")?.getAttribute("data-copied");
  const failed = document.querySelector("[data-copy-markdown-button]")?.getAttribute("data-copy-failed");
  assert.equal(copied, "Copied");
  assert.equal(failed, "Press Ctrl+C");
  for (const selector of ["[data-page-agent-copy]", "[data-page-footer-copy]"]) {
    assert.equal(document.querySelector(selector)?.getAttribute("data-copied"), copied);
    assert.equal(document.querySelector(selector)?.getAttribute("data-copy-failed"), failed);
  }
});

test("source navigation keeps a real, exact span for every block", () => {
  const spans = all(document, "[data-src]").map((element) => element.getAttribute("data-src") ?? "");
  assert.ok(spans.length > 20, "the page carries a span for each block it renders");
  for (const span of spans) {
    const match = SPAN.exec(span);
    assert.ok(match, `${span} is a full source span`);
    const [, file, line, column, endLine, endColumn] = match as RegExpExecArray & [string, string, string, string, string, string];
    assert.ok(Number(line) >= 1 && Number(endLine) >= Number(line));
    assert.ok(Number(column) >= 1 && Number(endColumn) >= 1);
    const source = join(root, "fixtures/integration", file as string);
    assert.ok(existsSync(source), `${span} names a source file that exists`);
    const lines = readFileSync(source, "utf8").split("\n").length;
    assert.ok(Number(endLine) <= lines, `${span} ends before the source file does`);
  }

  const block = document.querySelector("pre.code[data-src]");
  assert.ok(block);
  assert.ok(block.getAttribute("data-lang"));
  assert.ok(block.getAttribute("id")?.startsWith("code-"));
  assert.ok(all(document, "pre.code code").some((code) => (code.textContent ?? "").includes("install")));
});

test("an agent action keeps source, language, and version context", () => {
  const template = document.querySelector("template[data-block-actions]");
  assert.equal(template?.getAttribute("data-lang"), "en");
  assert.equal(template?.getAttribute("data-version"), "v2");
  assert.match(template?.getAttribute("data-prompt") ?? "", /\{source\}.*\{text\}/);

  assert.match(document.querySelector("[data-page-footer-copy]")?.getAttribute("data-prompt") ?? "", /guide\/install\.md:11 \(en, v2\)/);
  assert.match(
    document.querySelector(".page-agent-menu-provider")?.getAttribute("href") ?? "",
    /page=https%3A%2F%2Fexample\.com%2Fguide%2Finstall%2F&lang=en&version=v2&source=guide%2Finstall\.md/,
  );
  assert.match(document.querySelector(".trust-panel-action")?.getAttribute("href") ?? "", /build=build-42/);
});

test("variable substitution connects the form, code, terminal, and recorded output", () => {
  const formNames = attrs(document, ".variables-form-input", "data-var");
  assert.deepEqual(formNames, ["api_key", "host"]);

  const placeholders = JSON.parse(document.querySelector("code[data-placeholders]")?.getAttribute("data-placeholders") ?? "[]") as {
    name: string;
  }[];
  assert.deepEqual(
    placeholders.map((entry) => entry.name),
    ["api_key", "host"],
  );

  const deps = JSON.parse(document.querySelector("[data-output-deps]")?.getAttribute("data-output-deps") ?? "[]") as {
    name: string;
  }[];
  assert.deepEqual(
    deps.map((entry) => entry.name),
    ["project"],
  );

  const terminal = document.querySelector("script[data-terminal-commands]");
  assert.ok(terminal);
  const commands = JSON.parse(terminal.textContent ?? "[]") as { input: string; output: string[] }[];
  assert.equal(commands[0]?.input, "widget check");
  assert.deepEqual(commands[0]?.output, ["ok 3 - the examples pass"]);

  // The recorded output keeps its text; only the stale marker is the island's to change.
  assert.match(textOf(document.querySelector(".output-block-body")), /Finished \{\{project\}\} in 340 ms/);
  assert.equal(document.querySelector(".output-block")?.getAttribute("data-output-deps") !== undefined, true);
});

test("technical reference blocks expose canonical values and machine-readable fields", () => {
  const endpoint = document.querySelector(".endpoint");
  assert.equal(endpoint?.getAttribute("id"), "endpoint-get-widgets-id");
  assert.equal(endpoint?.getAttribute("data-copy-value"), "GET /widgets/{id}");
  assert.equal(endpoint?.getAttribute("data-path"), "/widgets/{id}");
  assert.equal(endpoint?.querySelector(".endpoint-method")?.textContent, "GET");

  const fields = JSON.parse(document.querySelector("script[data-schema-fields]")?.textContent ?? "{}") as {
    component: string;
    fields: { path: string; copyValue: string; type: string }[];
  };
  assert.equal(fields.component, "schema-table");
  assert.deepEqual(
    fields.fields.map((field) => [field.path, field.type, field.copyValue]),
    [
      ["name", "string", "name: string"],
      ["size", "enum", "size: enum"],
      ["nested", "object", "nested: object"],
    ],
  );
  assert.equal(document.querySelector(".schema-table-scroll")?.getAttribute("role"), "region");
  assert.equal(document.querySelector(".schema-table-scroll")?.getAttribute("aria-label"), "Widget options");
});

test("keyboard and pointer meet the same native controls, with no duplicate ids or shortcut", () => {
  const ids = all(document, "[id]").map((element) => element.getAttribute("id") ?? "");
  assert.equal(new Set(ids).size, ids.length, "no id is repeated");

  const shortcuts = attrs(document, "[aria-keyshortcuts]", "aria-keyshortcuts");
  assert.deepEqual(shortcuts, ["m"], "one page action owns the one character shortcut");
  const shortcutRows = all(document, ".shortcuts-list .shortcut-action").map(textOf);
  assert.deepEqual(shortcutRows, ["SearchNeeds JavaScript", "Copy page as MarkdownNeeds JavaScript", "Show this dialogNeeds JavaScript"]);

  // Pointer and keyboard reach the same elements because they are native controls.
  for (const control of all(document, "button")) {
    const name = control.getAttribute("aria-label") ?? textOf(control);
    assert.notEqual(name, "", `${control.outerHTML.slice(0, 80)} has an accessible name`);
  }
  for (const link of all(document, "a[href]")) {
    const name = link.getAttribute("aria-label") ?? textOf(link);
    assert.notEqual(name, "", `${link.outerHTML.slice(0, 80)} has an accessible name`);
    assert.doesNotMatch(link.getAttribute("href") ?? "", /^javascript:/i);
  }
  for (const summary of all(document, "summary")) assert.notEqual(textOf(summary), "");
});

test("the action contracts and clipboard limits are documented", () => {
  const doc = readFileSync(join(root, "docs/agent-ux.md"), "utf8");
  for (const expected of ["data-source", "data-version", "data-prompt", "role=\"status\"", "clipboard", "secure context", "javascript:", "executes a command", "provider"]) {
    assert.ok(doc.includes(expected), `docs/agent-ux.md covers ${JSON.stringify(expected)}`);
  }
  assert.match(doc, /shortcut|keyboard/i);
});
