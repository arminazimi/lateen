import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import schemaTable, {
  MISSING_CLASS,
  TABLE_CLASS,
  WRAPPER_CLASS,
  directive,
  lookup,
  schemaRows,
  type SchemaRow,
  type SchemaTableProps,
} from "../components/schema-table/index.ts";

/** A loose view of a Preact vnode: the element type, its props, and its children (in `props.children`). */
type Tree = { type: unknown; props: Record<string, unknown> & { children?: unknown }; key?: unknown };

function nodes(value: unknown): Tree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value === "object" && value !== null && "props" in value) {
    const tree = value as Tree;
    return [tree, ...nodes(tree.props.children)];
  }
  return [];
}

function render(props: SchemaTableProps, data: Record<string, unknown>): Tree {
  const input = { props, page: {}, site: { data }, html: "" } as unknown as ComponentProps<SchemaTableProps>;
  return (schemaTable as unknown as (input: ComponentProps<SchemaTableProps>) => Tree)(input);
}

function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (typeof value === "object" && value !== null && "props" in value) {
    return textOf((value as Tree).props.children);
  }
  if (value === null || value === undefined || typeof value === "boolean") return "";
  return String(value);
}

const widget = {
  title: "Widget",
  type: "object",
  required: ["id", "size"],
  properties: {
    id: { type: "string", description: "Unique identifier." },
    size: { type: "integer", default: 3, description: "How many parts." },
    color: { enum: ["red", "blue"], default: "red" },
    label: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    owner: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        email: { type: "string", default: "" },
      },
    },
  },
};

function rowNamed(rows: readonly SchemaRow[], name: string): SchemaRow {
  const found = rows.find((row) => row.name === name);
  assert.ok(found, `no row named ${name}`);
  return found;
}

const css = readFileSync(new URL("../components/schema-table/style.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("default export is the schema-table component", () => {
  assert.equal(typeof schemaTable, "function");
});

test("the directive is schema-table, so ::schema-table{data=...} reaches the component", () => {
  assert.equal(directive, "schema-table");
});

test("lookup reads a top-level data file and a nested path", () => {
  const data = { widget, guides: { steps: { title: "Steps" } } };
  assert.equal(lookup(data, "widget"), widget);
  assert.deepEqual(lookup(data, "guides/steps"), { title: "Steps" });
  assert.equal(lookup(data, "missing"), undefined);
  assert.equal(lookup(data, "widget/title/deeper"), undefined);
});

test("lookup does not read inherited keys", () => {
  assert.equal(lookup({}, "toString"), undefined);
});

test("top-level rows follow the schema's property order", () => {
  const rows = schemaRows(widget);
  assert.deepEqual(
    rows.map((row) => row.name),
    ["id", "size", "color", "label", "tags", "owner"],
  );
  assert.ok(rows.every((row) => row.depth === 0));
});

test("required comes from the parent's required list", () => {
  const rows = schemaRows(widget);
  assert.equal(rowNamed(rows, "id").required, true);
  assert.equal(rowNamed(rows, "size").required, true);
  assert.equal(rowNamed(rows, "color").required, false);
});

test("default is read only when the schema has one", () => {
  const rows = schemaRows(widget);
  assert.equal(rowNamed(rows, "size").hasDefault, true);
  assert.equal(rowNamed(rows, "size").defaultValue, 3);
  assert.equal(rowNamed(rows, "id").hasDefault, false);
  assert.equal(rowNamed(rows, "owner").hasDefault, false);
  assert.equal(rowNamed(rows, "owner").children[1]?.hasDefault, true);
  assert.equal(rowNamed(rows, "owner").children[1]?.defaultValue, "");
});

test("type text covers a single type, a union, an array, and enum", () => {
  const rows = schemaRows(widget);
  assert.equal(rowNamed(rows, "id").type, "string");
  assert.equal(rowNamed(rows, "label").type, "string | null");
  assert.equal(rowNamed(rows, "tags").type, "string[]");
  assert.equal(rowNamed(rows, "color").type, "enum");
});

test("enum values are listed; a const is a single value", () => {
  const rows = schemaRows({ properties: { color: { enum: ["red", "blue"] }, kind: { const: "item" } } });
  assert.deepEqual(rowNamed(rows, "color").values, ["red", "blue"]);
  assert.deepEqual(rowNamed(rows, "kind").values, ["item"]);
});

test("description is text, or empty when the schema has none", () => {
  const rows = schemaRows(widget);
  assert.equal(rowNamed(rows, "id").description, "Unique identifier.");
  assert.equal(rowNamed(rows, "tags").description, "");
});

test("object properties nest one level deeper with their own required list", () => {
  const owner = rowNamed(schemaRows(widget), "owner");
  assert.deepEqual(
    owner.children.map((row) => [row.path, row.depth, row.required]),
    [
      ["owner.name", 1, true],
      ["owner.email", 1, false],
    ],
  );
});

test("an array of objects shows the item fields under the array row", () => {
  const rows = schemaRows({
    properties: {
      steps: { type: "array", items: { type: "object", required: ["title"], properties: { title: { type: "string" } } } },
    },
  });
  const steps = rowNamed(rows, "steps");
  assert.equal(steps.type, "object[]");
  assert.deepEqual(
    steps.children.map((row) => [row.name, row.required]),
    [["title", true]],
  );
});

test("a $ref to #/$defs is followed, and keywords next to it win", () => {
  const schema = {
    $defs: { name: { type: "string", description: "A name." } },
    properties: {
      first: { $ref: "#/$defs/name" },
      second: { $ref: "#/$defs/name", description: "Overridden." },
    },
  };
  const rows = schemaRows(schema);
  assert.equal(rowNamed(rows, "first").type, "string");
  assert.equal(rowNamed(rows, "first").description, "A name.");
  assert.equal(rowNamed(rows, "second").description, "Overridden.");
});

test("a recursive $ref shows the row once and does not expand it forever", () => {
  const schema = {
    properties: {
      child: { type: "object", properties: { next: { $ref: "#" } } },
    },
  };
  const rows = schemaRows(schema);
  const child = rowNamed(rows, "child");
  const next = child.children[0];
  assert.equal(next?.name, "next");
  // The schema loops back to `child` once, then the repeated `$ref` is shown but not expanded.
  const again = next?.children[0];
  assert.equal(again?.name, "child");
  const looped = again?.children[0];
  assert.equal(looped?.name, "next");
  assert.deepEqual(looped?.children, []);
});

test("a deep schema stops expanding at the depth limit", () => {
  let schema: Record<string, unknown> = { type: "string" };
  for (let i = 0; i < 20; i++) schema = { type: "object", properties: { level: schema } };
  const walk = (rows: readonly SchemaRow[]): number =>
    rows.reduce((max, row) => Math.max(max, row.depth, walk(row.children)), 0);
  assert.ok(walk(schemaRows(schema)) <= 8);
});

test("the component renders a table with one row per property, and nested rows indented", () => {
  const tree = render({ data: "widget" }, { widget });
  assert.equal(tree.type, "div");
  assert.equal(tree.props.class, WRAPPER_CLASS);
  assert.equal(tree.props.tabIndex, 0);
  assert.equal(tree.props.role, "region");
  assert.equal(tree.props["aria-label"], "Properties");

  const all = nodes(tree);
  assert.ok(all.some((node) => node.props.class === TABLE_CLASS));
  const rows = all.filter((node) => node.type === "tr" && node.props.class !== undefined);
  // Six top-level rows plus two nested rows under owner, plus the array row's nothing extra.
  assert.equal(rows.filter((row) => String(row.props.class).includes("schema-row")).length, 8);
  assert.ok(rows.some((row) => row.props.class === "schema-row schema-depth-1"));
});

test("the component writes a header row with the five columns", () => {
  const headers = nodes(render({ data: "widget" }, { widget }))
    .filter((node) => node.type === "th" && node.props.scope === "col")
    .map((node) => textOf(node.props.children));
  assert.deepEqual(headers, ["Name", "Type", "Required", "Default", "Description"]);
});

test("the component uses the label prop as the accessible name", () => {
  const tree = render({ data: "widget", label: "Config keys" }, { widget });
  assert.equal(tree.props["aria-label"], "Config keys");
});

test("a data path that is missing renders a note, not a table", () => {
  const tree = render({ data: "missing" }, { widget });
  assert.equal(tree.type, "p");
  assert.equal(tree.props.class, MISSING_CLASS);
  assert.equal(tree.props.role, "note");
  assert.match(textOf(tree.props.children), /No schema in _data at "missing"/);
});

test("a missing data attribute renders a note that says what to write", () => {
  const tree = render({}, { widget });
  assert.equal(tree.props.class, MISSING_CLASS);
  assert.match(textOf(tree.props.children), /needs data=/);
});

test("a schema with no properties renders a note, not an empty table", () => {
  const tree = render({ data: "empty" }, { empty: { type: "object" } });
  assert.equal(tree.props.class, MISSING_CLASS);
  assert.match(textOf(tree.props.children), /has no properties/);
});

test("style.css styles the wrapper, the table, and the depth classes", () => {
  assert.match(css, /\.schema-table-scroll\s*\{/);
  assert.match(css, /\.schema-table\s+th,\s*\.schema-table\s+td/);
  assert.match(css, /\.schema-depth-1\s*>\s*th\s*\{/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical spacing and borders", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):\s/);
});

test("style.css keeps code values left-to-right inside right-to-left text", () => {
  assert.match(css, /unicode-bidi:\s*isolate/);
});
