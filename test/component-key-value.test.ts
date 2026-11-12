import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import keyValue, {
  KEY_CLASS,
  LIST_CLASS,
  LONG_VALUE_CLASS,
  LONG_VALUE_LENGTH,
  VALUE_CLASS,
  directive,
  displayOf,
  pairsJson,
  pairsPayloadOf,
  parseBody,
  parseItems,
  valueClassOf,
  valueTypeOf,
  type KeyValuePayload,
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

/** The inert pairs script, parsed back into the published payload. */
function payloadOf(tree: Tree): KeyValuePayload {
  const [script] = nodes(tree).filter(
    (node) => node.type === "script" && node.props["data-key-value-pairs"] !== undefined,
  );
  assert.ok(script, "pairs script rendered");
  const html = (script.props.dangerouslySetInnerHTML as { __html: string } | undefined)?.__html;
  assert.ok(html, "script carries the payload");
  return JSON.parse(html) as KeyValuePayload;
}

/** The raw text of the published script, before parsing. */
function rawJson(tree: Tree): string {
  const [script] = nodes(tree).filter(
    (node) => node.type === "script" && node.props["data-key-value-pairs"] !== undefined,
  );
  assert.ok(script, "pairs script rendered");
  return (script.props.dangerouslySetInnerHTML as { __html: string }).__html ?? "";
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

test("the items prop keeps duplicate keys and number values as numbers", () => {
  assert.deepEqual(parseItems('[{"key":"Port","value":8080},{"key":"Port","value":9090}]'), [
    { key: "Port", value: 8080 },
    { key: "Port", value: 9090 },
  ]);
});

test("the items prop keeps objects, arrays, booleans, null, and strings as supplied", () => {
  const raw = JSON.stringify([
    { key: "Text", value: "1.0" },
    { key: "Object", value: { b: [1, null], a: "x" } },
    { key: "List", value: ["a", 2, true] },
    { key: "Yes", value: true },
    { key: "No", value: false },
    { key: "Nothing", value: null },
  ]);
  assert.deepEqual(parseItems(raw), [
    { key: "Text", value: "1.0" },
    { key: "Object", value: { b: [1, null], a: "x" } },
    { key: "List", value: ["a", 2, true] },
    { key: "Yes", value: true },
    { key: "No", value: false },
    { key: "Nothing", value: null },
  ]);
});

test("an unreadable items prop gives no pairs, so the body can be used", () => {
  for (const raw of ["not json", '{"key":"a"}', "[]", "", undefined]) {
    assert.deepEqual(parseItems(raw), [], String(raw));
  }
});

test("malformed item arrays give only the usable pairs, in order", () => {
  assert.deepEqual(
    parseItems('[null,5,"x",{"key":""},{"value":"no key"},["OnlyKey"],{"key":7,"value":"seven"}]'),
    [
      { key: "OnlyKey", value: "" },
      { key: "7", value: "seven" },
    ],
  );
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

test("structured values display as JSON, while ordinary text is unchanged", () => {
  assert.equal(displayOf("plain text"), "plain text");
  assert.equal(displayOf("<b>text</b>"), "<b>text</b>");
  assert.equal(displayOf(8080), "8080");
  assert.equal(displayOf(1.5), "1.5");
  assert.equal(displayOf(true), "true");
  assert.equal(displayOf(false), "false");
  assert.equal(displayOf(null), "null");
  assert.equal(displayOf([1, "a", null]), '[1,"a",null]');
  assert.equal(displayOf({ b: 1, a: [true] }), '{"b":1,"a":[true]}');

  const tree = render({
    items: '[{"key":"Text","value":"1.0"},{"key":"Count","value":8080},{"key":"List","value":[1,2]},{"key":"Obj","value":{"a":1}}]',
  });
  assert.deepEqual(items(tree!), [
    ["Text", "1.0"],
    ["Count", "8080"],
    ["List", "[1,2]"],
    ["Obj", '{"a":1}'],
  ]);
});

test("valueTypeOf names every JSON type the payload publishes", () => {
  assert.equal(valueTypeOf("x"), "string");
  assert.equal(valueTypeOf(0), "number");
  assert.equal(valueTypeOf(false), "boolean");
  assert.equal(valueTypeOf([]), "array");
  assert.equal(valueTypeOf({}), "object");
  assert.equal(valueTypeOf(null), "null");
});

test("an absent value is an empty string; an explicit null stays null", () => {
  const tree = render({ items: '[{"key":"Absent"},{"key":"Null","value":null},{"key":"Blank","value":""}]' });
  assert.deepEqual(payloadOf(tree!).pairs, [
    { key: "Absent", value: "", type: "string" },
    { key: "Null", value: null, type: "null" },
    { key: "Blank", value: "", type: "string" },
  ]);
  assert.deepEqual(items(tree!), [
    ["Absent", ""],
    ["Null", "null"],
    ["Blank", ""],
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
  const evil = '</script><script>alert(1)</script> & "more"';
  const tree = render({ items: JSON.stringify([{ key: "<b>Key</b>", value: evil }]) });
  const [key, value] = nodes(tree!).filter((node) => node.type === "dt" || node.type === "dd");
  assert.equal(textOf(key!.props.children), "<b>Key</b>");
  assert.equal(textOf(value!.props.children), evil);
  const all = nodes(tree!)
    .map((node) => node.type)
    .filter((type) => type !== "script");
  assert.ok(all.every((type) => type === "dl" || type === "dt" || type === "dd"));

  const html = renderToString(tree! as never);
  assert.equal((html.match(/<script/gi) ?? []).length, 1, "only the payload opens a script");
  assert.ok(!html.includes("<script>alert(1)</script>"), "the value never becomes markup");
  assert.ok(html.includes("&lt;b>Key&lt;/b>"), "the key renders escaped");
  assert.ok(!rawJson(tree!).toLowerCase().includes("</script"), "the raw payload closes no script tag");
  assert.equal(payloadOf(tree!).pairs[0]!.value, evil);
});

test("structured values with markup stay escaped JSON in the element and the script", () => {
  const evil = "</script><b>bold</b>";
  const tree = render({ items: JSON.stringify([{ key: "Obj", value: { [evil]: [evil] } }]) });
  const value = nodes(tree!).find((node) => node.type === "dd");
  assert.equal(textOf(value!.props.children), JSON.stringify({ [evil]: [evil] }));

  const html = renderToString(tree! as never);
  assert.equal((html.match(/<script/gi) ?? []).length, 1, "only the payload opens a script");
  assert.ok(!rawJson(tree!).toLowerCase().includes("</script"), "the raw payload closes no script tag");
  assert.deepEqual(payloadOf(tree!).pairs[0]!.value, { [evil]: [evil] });
});

test("a long value carries the long-value class; a short one does not", () => {
  const long = "x".repeat(LONG_VALUE_LENGTH + 1);
  assert.equal(valueClassOf(long), `${VALUE_CLASS} ${LONG_VALUE_CLASS}`);
  assert.equal(valueClassOf("short"), VALUE_CLASS);

  const tree = render({ items: JSON.stringify([{ key: "Long", value: long }]) });
  const value = nodes(tree!).find((node) => node.type === "dd");
  assert.equal(value?.props.class, `${VALUE_CLASS} ${LONG_VALUE_CLASS}`);
});

test("a long structured value is long by its displayed JSON, not its type name", () => {
  const long = { list: Array.from({ length: 10 }, (_value, index) => `item-${index}`) };
  const tree = render({ items: JSON.stringify([{ key: "Long", value: long }]) });
  const value = nodes(tree!).find((node) => node.type === "dd");
  assert.equal(value?.props.class, `${VALUE_CLASS} ${LONG_VALUE_CLASS}`);
  assert.deepEqual(JSON.parse(textOf(value!.props.children)), long);
  assert.deepEqual(payloadOf(tree!).pairs[0]!.value, long);
});

test("the list publishes an inert versioned JSON payload with ordered pairs and duplicate keys", () => {
  const tree = render({
    items: '[{"key":"Port","value":8080},{"key":"Port","value":9090},{"key":"Host","value":"a.example"}]',
  });
  const [script] = nodes(tree!).filter((node) => node.type === "script" && node.props["data-key-value-pairs"] !== undefined);
  assert.ok(script);
  assert.equal(script.props.type, "application/json");
  assert.equal(script.props.src, undefined, "the payload is inline, not fetched");

  const payload = payloadOf(tree!);
  assert.equal(payload.component, "key-value");
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.pairs, [
    { key: "Port", value: 8080, type: "number" },
    { key: "Port", value: 9090, type: "number" },
    { key: "Host", value: "a.example", type: "string" },
  ]);
});

test("the payload pairs mirror the displayed list, in order", () => {
  const tree = render({
    items: '[{"key":"Text","value":"1.0"},{"key":"List","value":[1,2]},{"key":"Nothing","value":null}]',
  });
  assert.deepEqual(
    payloadOf(tree!).pairs.map((pair) => [pair.key, displayOf(pair.value)]),
    items(tree!),
  );
});

test("body pairs are published as strings, in order, and keep empty values", () => {
  const tree = render({}, "<p>Version: 1.0\nEmpty:\nPort: 8080</p>");
  assert.deepEqual(payloadOf(tree!).pairs, [
    { key: "Version", value: "1.0", type: "string" },
    { key: "Empty", value: "", type: "string" },
    { key: "Port", value: "8080", type: "string" },
  ]);
});

test("a malformed items prop publishes exactly the pairs the list shows", () => {
  const tree = render({ items: '[null,5,"x",{"key":""},{"value":"no key"},["OnlyKey"],{"key":7,"value":"seven"}]' });
  assert.deepEqual(items(tree!), [
    ["OnlyKey", ""],
    ["7", "seven"],
  ]);
  assert.deepEqual(payloadOf(tree!).pairs, [
    { key: "OnlyKey", value: "", type: "string" },
    { key: "7", value: "seven", type: "string" },
  ]);
});

test("pairsJson escapes every angle bracket and round-trips every type", () => {
  const items = [
    { key: "Text", value: "<b>text</b>" },
    { key: "Count", value: 2 },
    { key: "Yes", value: true },
    { key: "Nothing", value: null },
    { key: "List", value: ["</script>", 1] },
    { key: "Obj", value: { "</script>": "<b>" } },
  ];
  const raw = pairsJson(pairsPayloadOf(items));
  assert.ok(!raw.includes("<"), "the writer escapes every angle bracket");
  assert.deepEqual((JSON.parse(raw) as KeyValuePayload).pairs, pairsPayloadOf(items).pairs);
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
