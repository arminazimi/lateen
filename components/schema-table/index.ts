import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::schema-table{data="widget"}`. */
export const directive = "schema-table";

/** Scroll region around the table, keyboard-focusable so wide tables can be scrolled without a pointer. */
export const WRAPPER_CLASS = "schema-table-scroll";

/** Class on the table element. `style.css` styles it. */
export const TABLE_CLASS = "schema-table";

/** Shown when the directive gives no `data` or the `_data` path holds no schema. */
export const MISSING_CLASS = "schema-table-missing";

/** Rows nested deeper than this are not expanded, so a recursive schema cannot loop forever. */
const MAX_DEPTH = 8;

/** Rows indented beyond this depth share the deepest indent class. */
const MAX_INDENT = 3;

/** Hops allowed when following `$ref` chains, and when describing nested `items`. */
const MAX_HOPS = 16;

export type SchemaTableProps = {
  /** Path of the schema in `_data`, without the extension: `widget` or `guides/steps`. */
  data?: string;
  /** Accessible name of the table. */
  label?: string;
  /** Id of the table's region. Give one when two tables read the same schema. */
  id?: string;
};

/** A JSON value read from `_data`. Checked at runtime, so it is `unknown` rather than a fixed type. */
type Json = Readonly<Record<string, unknown>>;

/** One row of the table: a property, with the rows nested under it. */
export interface SchemaRow {
  /** Dotted path from the root, unique within the table; used as the row key. */
  readonly path: string;
  /** The property name as written in the schema. */
  readonly name: string;
  /** Type as text: `string`, `string | null`, `string[]`, `enum`, or `any`. */
  readonly type: string;
  /** True when the parent schema lists the property in `required`. */
  readonly required: boolean;
  /** True when the schema has a `default` keyword. */
  readonly hasDefault: boolean;
  /** The `default` value; read only when `hasDefault` is true. */
  readonly defaultValue: unknown;
  /** The `description` text, or an empty string. */
  readonly description: string;
  /** Allowed values from `enum`, or the single `const` value. */
  readonly values: readonly unknown[];
  /** 0 for top-level properties, 1 for their properties, and so on. */
  readonly depth: number;
  /** Properties of this property (object properties, or the properties of array `items`). */
  readonly children: readonly SchemaRow[];
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Follows the JSON pointer `#/$defs/name` (or `#/definitions/name`) inside the same document. */
function pointerTarget(root: Json, ref: string): unknown {
  if (!ref.startsWith("#")) return undefined;
  const parts = ref.slice(1).split("/").filter((part) => part !== "");
  let node: unknown = root;
  for (const raw of parts) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isJson(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * The schema with its `$ref` applied: the target's keywords, overridden by any keyword the referring
 * schema sets next to the `$ref`. A `$ref` that does not resolve in this document is ignored.
 */
function view(schema: Json, root: Json, hops = 0): Json {
  if (typeof schema.$ref !== "string" || hops > MAX_HOPS) return schema;
  const { $ref, ...local } = schema;
  const target = pointerTarget(root, $ref);
  return { ...(isJson(target) ? view(target, root, hops + 1) : {}), ...local };
}

/** The values a schema allows: its `enum`, or its single `const`. */
function valuesOf(schema: Json): readonly unknown[] {
  if (Array.isArray(schema.enum)) return schema.enum;
  if (Object.hasOwn(schema, "const")) return [schema.const];
  return [];
}

/** The schema's type as text. Arrays read as `item[]`; unions join with `|`. */
function typeOf(schema: Json, root: Json, depth = 0): string {
  if (depth > MAX_HOPS) return "any";
  if (typeof schema.type === "string") {
    if (schema.type === "array" && isJson(schema.items)) {
      return `${typeOf(view(schema.items, root), root, depth + 1)}[]`;
    }
    return schema.type;
  }
  if (Array.isArray(schema.type)) return schema.type.map(String).join(" | ");
  const members = [
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
  ];
  const memberTypes = members.filter(isJson).map((member) => typeOf(view(member, root), root, depth + 1));
  if (memberTypes.length > 0) return memberTypes.join(" | ");
  if (Object.hasOwn(schema, "enum") || Object.hasOwn(schema, "const")) return "enum";
  return "any";
}

/** Rows for the properties of one schema object, in the order the schema lists them. */
function propertyRows(schema: Json, root: Json, depth: number, active: ReadonlySet<string>, prefix: string): SchemaRow[] {
  if (!isJson(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return Object.entries(schema.properties).flatMap(([name, child]) =>
    isJson(child) ? [rowOf(name, child, required.has(name), depth, root, active, prefix)] : [],
  );
}

/**
 * Rows for everything one schema describes: its own properties, then the properties of its array
 * `items` (so an array of objects shows the fields of each item).
 */
function childRows(schema: Json, root: Json, depth: number, active: ReadonlySet<string>, prefix: string): SchemaRow[] {
  const own = view(schema, root);
  const rows = propertyRows(own, root, depth, active, prefix);
  if (isJson(own.items)) {
    rows.push(...propertyRows(view(own.items, root), root, depth, active, prefix));
  }
  return rows;
}

function rowOf(
  name: string,
  prop: Json,
  required: boolean,
  depth: number,
  root: Json,
  active: ReadonlySet<string>,
  prefix: string,
): SchemaRow {
  const path = prefix === "" ? name : `${prefix}.${name}`;
  const ref = typeof prop.$ref === "string" ? prop.$ref : undefined;
  // A `$ref` already on the way down is a cycle: show the row, but do not expand it again.
  const cyclic = ref !== undefined && active.has(ref);
  const nested = ref === undefined ? active : new Set([...active, ref]);
  const resolved = view(prop, root);
  const children =
    cyclic || depth + 1 > MAX_DEPTH ? [] : childRows(resolved, root, depth + 1, nested, path);

  return {
    path,
    name,
    type: typeOf(resolved, root),
    required,
    hasDefault: Object.hasOwn(resolved, "default"),
    defaultValue: resolved.default,
    description: typeof resolved.description === "string" ? resolved.description : "",
    values: valuesOf(resolved),
    depth,
    children,
  };
}

/** The rows of a whole schema: one per top-level property, with nested rows under each. */
export function schemaRows(schema: Json): SchemaRow[] {
  return childRows(schema, schema, 0, new Set(), "");
}

/** The value at a `_data` path such as `widget` or `guides/steps`, or undefined when there is none. */
export function lookup(data: Readonly<Record<string, unknown>>, path: string): unknown {
  let node: unknown = data;
  for (const key of path.split("/").filter((part) => part !== "")) {
    if (!isJson(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/** A value reduced to letters, digits, `-` and `_`, so it can go in an id. */
function slugOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The id prefix of the table: the `id` prop, or the schema's `_data` path. */
export function idBase(raw: unknown, path: string): string {
  const given = slugOf(typeof raw === "string" ? raw : "");
  if (given !== "") return given;
  const data = slugOf(path);
  return data === "" ? "schema-table" : `schema-${data}`;
}

/** The id of one field row. The dotted path keeps every property in the table unique. */
export function fieldId(base: string, path: string): string {
  return `${base}-field-${slugOf(path) || "field"}`;
}

/** The id of a column's header cell. */
export function columnId(base: string, column: string): string {
  return `${base}-col-${column}`;
}

/** The paths of a field's ancestors, outermost first: `a.b.c` gives `a` and `a.b`. */
export function ancestorPaths(path: string): string[] {
  const parts = path.split(".");
  return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join("."));
}

/** What a copy action takes for a field: its dotted path and its type, without the table's decoration. */
export function copyValueOf(row: SchemaRow): string {
  return `${row.path}: ${row.type}`;
}

/** A value as the table shows it: JSON, so strings keep their quotes and `null` and numbers read as written. */
function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function flatten(rows: readonly SchemaRow[]): SchemaRow[] {
  return rows.flatMap((row) => [row, ...flatten(row.children)]);
}

function rowNode(row: SchemaRow, base: string, lang: string) {
  const indent = row.depth === 0 ? "schema-row" : `schema-row schema-depth-${Math.min(row.depth, MAX_INDENT)}`;
  const ownHeader = `${fieldId(base, row.path)}-name`;
  const ancestors = ancestorPaths(row.path).map((path) => `${fieldId(base, path)}-name`);
  // A nested row belongs to its parent's header and to its column's header, so `headers` names both.
  // A top-level row keeps the table's implicit association with the column headers.
  const headersOf = (column: string) =>
    ancestors.length === 0 ? {} : { headers: [...ancestors, ownHeader, columnId(base, column)].join(" ") };
  const headerHeaders = ancestors.length === 0 ? {} : { headers: [...ancestors, columnId(base, "name")].join(" ") };
  return h(
    "tr",
    {
      key: row.path,
      class: indent,
      id: fieldId(base, row.path),
      "data-field": row.path,
      "data-copy-value": copyValueOf(row),
    },
    h("th", { scope: "row", class: "schema-name", id: ownHeader, ...headerHeaders }, h("code", { dir: "ltr" }, row.name)),
    h("td", { ...headersOf("type") }, h("code", { class: "schema-type", dir: "ltr" }, row.type)),
    h("td", { class: "schema-required", ...headersOf("required") }, row.required ? t(lang, "required") : null),
    h(
      "td",
      { class: "schema-default", ...headersOf("default") },
      row.hasDefault ? h("code", { dir: "ltr" }, show(row.defaultValue)) : null,
    ),
    h(
      "td",
      { class: "schema-description", ...headersOf("description") },
      row.description === "" ? null : h("span", null, row.description),
      row.values.length === 0
        ? null
        : h(
            "ul",
            { class: "schema-values" },
            row.values.map((value) => h("li", null, h("code", { dir: "ltr" }, show(value)))),
          ),
    ),
  );
}

/**
 * `::schema-table{data="widget"}` renders a JSON Schema from `_data/widget.json` (or `.yml`) as a table of
 * properties: name, type, required, default, and description, with nested properties indented under their
 * parent. `data` is the file's path under `_data` without its extension; `guides/steps` reads
 * `_data/guides/steps.yml`. The table needs no JavaScript and reads the same in right-to-left text; its
 * headers and messages come from the page language's catalog.
 */
export default function schemaTable({ props, site, page }: ComponentProps<SchemaTableProps>) {
  const lang = page.lang;
  const path = typeof props.data === "string" ? props.data.trim() : "";
  const label = typeof props.label === "string" && props.label.trim() !== "" ? props.label : t(lang, "schema_properties");

  if (path === "") {
    return h("p", { class: MISSING_CLASS, role: "note" }, t(lang, "schema_missing_data"));
  }
  const schema = lookup(site.data, path);
  if (!isJson(schema)) {
    return h("p", { class: MISSING_CLASS, role: "note" }, t(lang, "schema_missing_schema", { path }));
  }

  const rows = flatten(schemaRows(schema));
  if (rows.length === 0) {
    return h("p", { class: MISSING_CLASS, role: "note" }, t(lang, "schema_empty", { path }));
  }

  const base = idBase(props.id, path);

  return h(
    "div",
    { class: WRAPPER_CLASS, id: base, tabIndex: 0, role: "region", "aria-label": label, "data-schema": path },
    h(
      "table",
      { class: TABLE_CLASS },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", { scope: "col", id: columnId(base, "name") }, t(lang, "name")),
          h("th", { scope: "col", id: columnId(base, "type") }, t(lang, "type")),
          h("th", { scope: "col", id: columnId(base, "required") }, t(lang, "required")),
          h("th", { scope: "col", id: columnId(base, "default") }, t(lang, "default")),
          h("th", { scope: "col", id: columnId(base, "description") }, t(lang, "description")),
        ),
      ),
      h("tbody", null, rows.map((row) => rowNode(row, base, lang))),
    ),
  );
}
