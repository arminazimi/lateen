import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import keyValue, {
  KEY_CLASS,
  LIST_CLASS,
  LONG_VALUE_CLASS,
  LONG_VALUE_LENGTH,
  VALUE_CLASS,
  directive,
  parseBody,
  parseItems,
  valueClassOf,
  type KeyValueProps,
} from "../components/key-value/index.ts";

/** A loose view of a Preact vnode: the element type, its props, and its children. */
type Tree = { type: unknown; props: Record<string, unknown> & { children?: unknown } };

function nodes(value: unknown): Tree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value === "object" && value !== null && "props" in value) {
    const tree = value as Tree;
    return [tree, ...nodes(tree.props.children)];
  }
  return [];
}

function render(props: KeyValueProps = {}, body = ""): Tree | null {
  const input = { props, page: {}, site: {}, html: body } as unknown as ComponentProps<KeyValueProps>;
  return keyValue(input) as Tree | null;
}

function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (typeof value === "object" && value !== null && "props" in value) {
    return textOf((value as Tree).props.children);
  }
  if (value === null || value === undefined || typeof value === "boolean") return "";
  return String(value);
}

function items(tree: Tree): Array<[string, string]> {
  return nodes(tree)
    .filter((node) => node.type === "dt" || node.type === "dd")
    .map((node) => [node.type as string, textOf(node.props.children)] as [string, string])
    .reduce<Array<[string, string]>>((pairs, [type, text]) => {
      if (type === "dt") pairs.push([text, ""]);
      else pairs[pairs.length - 1]![1] = text;
      return pairs;
    }, []);
}

const css = readFileSync(new URL("../components/key-value/style.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("default export is the key-value component and its directive is key-value", () => {
  assert.equal(typeof keyValue, "function");
  assert.equal(directive, "key-value");
});

test("the items prop reads JSON objects and pairs, in order", () => {
  assert.deepEqual(
    parseItems('[{"key":"Version","value":"1.0"},["License","MIT"],{"key":"Owner"}]'),
    [
      { key: "Version", value: "1.0" },
      { key: "License", value: "MIT" },
      { key: "Owner", value: "" },
    ],
  );
});

test("the items prop keeps duplicate keys and number values", () => {
  assert.deepEqual(parseItems('[{"key":"Port","value":8080},{"key":"Port","value":9090}]'), [
    { key: "Port", value: "8080" },
    { key: "Port", value: "9090" },
  ]);
});

test("an unreadable items prop gives no pairs, so the body can be used", () => {
  for (const raw of ["not json", '{"key":"a"}', "[]", "", undefined]) {
    assert.deepEqual(parseItems(raw), [], String(raw));
  }
});

test("the body reads one key: value per line, trimmed and in order", () => {
  assert.deepEqual(parseBody("<p>  Version: 1.0\n\n  License :  MIT </p>"), [
    { key: "Version", value: "1.0" },
    { key: "License", value: "MIT" },
  ]);
});

test("the body keeps duplicate keys, uses the first colon, and skips lines without one", () => {
  assert.deepEqual(parseBody("Port: 8080<br>Note: a: b<br>no colon\nPort: 9090"), [
    { key: "Port", value: "8080" },
    { key: "Note", value: "a: b" },
    { key: "Port", value: "9090" },
  ]);
});

test("the body decodes the character references Markdown writes", () => {
  assert.deepEqual(parseBody("Owner: A &amp; B &#39;team&#39;"), [{ key: "Owner", value: "A & B 'team'" }]);
});

test("the body ignores inline markup and empty keys", () => {
  assert.deepEqual(parseBody("<p><strong>Version</strong>: <code>1.0</code><br>: no key</p>"), [
    { key: "Version", value: "1.0" },
  ]);
});

test("the items prop wins over the body when it gives pairs", () => {
  const tree = render({ items: '[{"key":"From","value":"prop"}]' }, "<p>From: body</p>");
  assert.deepEqual(items(tree!), [["From", "prop"]]);
});

test("the body is used when the items prop gives no pairs", () => {
  const tree = render({ items: "[]" }, "<p>From: body</p>");
  assert.deepEqual(items(tree!), [["From", "body"]]);
});

test("no pairs at all renders nothing", () => {
  assert.equal(render({}, ""), null);
  assert.equal(render({ items: "[]" }, "<p>no colon here</p>"), null);
  assert.equal(render({ items: "not json" }, ""), null);
});

test("renders a semantic dl with one dt and one dd per pair, in order", () => {
  const tree = render({}, "<p>Version: 1.0\nLicense: MIT</p>");
  assert.equal(tree!.type, "dl");
  assert.equal(tree!.props.class, LIST_CLASS);

  const all = nodes(tree!);
  assert.equal(all.filter((node) => node.type === "dt").length, 2);
  assert.equal(all.filter((node) => node.type === "dd").length, 2);
  assert.deepEqual(
    all.filter((node) => node.type === "dt" || node.type === "dd").map((node) => node.type),
    ["dt", "dd", "dt", "dd"],
  );
  assert.deepEqual(items(tree!), [
    ["Version", "1.0"],
    ["License", "MIT"],
  ]);
  assert.ok(all.filter((node) => node.type === "dt").every((node) => node.props.class === KEY_CLASS));
});

test("keys and values are escaped, never parsed as markup", () => {
  const tree = render({ items: '[{"key":"<b>Key</b>","value":"<script>alert(1)</script> & more"}]' });
  const [key, value] = nodes(tree!).filter((node) => node.type === "dt" || node.type === "dd");
  assert.equal(textOf(key!.props.children), "<b>Key</b>");
  assert.equal(textOf(value!.props.children), "<script>alert(1)</script> & more");
  const all = nodes(tree!).map((node) => node.type);
  assert.ok(all.every((type) => type === "dl" || type === "dt" || type === "dd"));
});

test("a long value carries the long-value class; a short one does not", () => {
  const long = "x".repeat(LONG_VALUE_LENGTH + 1);
  assert.equal(valueClassOf(long), `${VALUE_CLASS} ${LONG_VALUE_CLASS}`);
  assert.equal(valueClassOf("short"), VALUE_CLASS);

  const tree = render({ items: JSON.stringify([{ key: "Long", value: long }]) });
  const value = nodes(tree!).find((node) => node.type === "dd");
  assert.equal(value?.props.class, `${VALUE_CLASS} ${LONG_VALUE_CLASS}`);
});

test("style.css uses a two-column grid that becomes one column on a narrow screen", () => {
  assert.match(css, /\.key-value\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*auto\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*40rem\)\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test("style.css keeps long values inside the column", () => {
  assert.match(css, /\.key-value\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(css, /\.key-value-key\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(css, /\.key-value-value\s*\{[^}]*min-inline-size:\s*0/s);
  assert.match(css, /\.key-value-value\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.key-value-long\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only, so right-to-left pages work", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):\s/);
  assert.match(css, /min-inline-size:\s*0/);
});
