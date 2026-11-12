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

/** Class on the visible marker for a reference that was not expanded. */
export const REF_CLASS = "schema-ref";

/** Class on the resolution state word inside a reference marker. */
export const REF_STATE_CLASS = "schema-ref-state";

/**
 * How expansion treated an authored `$ref`: `resolved` read the local target; `unresolved` found no
 * target; `external` pointed outside this document; `malformed` was not a usable local pointer;
 * `cycle` looped back on itself; `depth` hit a deterministic expansion limit.
 */
export const REF_STATES = ["resolved", "unresolved", "external", "malformed", "cycle", "depth"] as const;

export type RefState = (typeof REF_STATES)[number];

/** The `$ref` a schema authored, and what expansion did with it. */
export interface SchemaRef {
  /** The reference as authored; JSON text when the value is not a string. */
  readonly value: string;
  /** How expansion treated it. */
  readonly state: RefState;
}

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
  /** Type as text: `string`, `string | null`, `string[]`, `enum`, `unknown`, or `any`. */
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
  /** The `$ref` the property authored and how it was treated, or null when it authored none. */
  readonly ref: SchemaRef | null;
  /** Properties of this property (object properties, or the properties of array `items`). */
  readonly children: readonly SchemaRow[];
  /**
   * Why expansion stopped while `children` is empty: `"cycle"` for a `$ref` already on the way down,
   * `"depth"` when the depth limit hid child properties that the schema still defines, `null` when
   * the children shown are all there are.
   */
  readonly truncated: "cycle" | "depth" | null;
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The reference as text: strings stay as written, any other JSON value becomes its JSON text. */
function authoredText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
}

/** The tokens of a local JSON pointer, with `~1` and `~0` decoded; undefined when it is not one. */
function pointerParts(ref: string): string[] | undefined {
  if (!ref.startsWith("#")) return undefined;
  const fragment = ref.slice(1);
  if (fragment === "") return [];
  if (!fragment.startsWith("/")) return undefined;
  const parts = fragment.slice(1).split("/");
  // A `~` must be followed by `0` or `1`; anything else is not a JSON pointer.
  if (parts.some((part) => /~(?:[^01]|$)/.test(part))) return undefined;
  return parts.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** True when a local reference uses pointer syntax but one of its `~` escapes is invalid. */
function malformedPointer(ref: string): boolean {
  const fragment = ref.slice(1);
  if (!fragment.startsWith("/")) return false;
  return fragment
    .slice(1)
    .split("/")
    .some((part) => /~(?:[^01]|$)/.test(part));
}

/** Follows the JSON pointer `#/$defs/name` (or `#/definitions/name`) inside the same document. */
function pointerTarget(root: Json, ref: string): unknown {
  const parts = pointerParts(ref);
  if (parts === undefined) return undefined;
  let node: unknown = root;
  for (const key of parts) {
    if (!isJson(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/** A schema with its `$ref` chain applied, and the reference the row authored. */
interface Resolution {
  readonly schema: Json;
  readonly ref: SchemaRef | null;
}

/** The schema without its own `$ref`, keeping the keywords written next to it. */
function withoutRef(schema: Json): Json {
  if (!Object.hasOwn(schema, "$ref")) return schema;
  const { $ref: _ref, ...local } = schema;
  return local;
}

/**
 * Resolves a local `$ref` chain and reports exactly how it ended. The target's keywords are
 * overridden by any keyword the referring schema sets next to the `$ref`. External, malformed,
 * missing, cyclic, and limit-cut references are never fetched or guessed at.
 */
function resolve(schema: Json, root: Json, hops = 0, seen: ReadonlySet<string> = new Set()): Resolution {
  if (!Object.hasOwn(schema, "$ref")) return { schema, ref: null };
  const authored = schema.$ref;
  const value = authoredText(authored);
  const ended = (state: RefState): Resolution => ({ schema: withoutRef(schema), ref: { value, state } });

  if (typeof authored !== "string") return ended("malformed");
  if (!authored.startsWith("#")) return ended("external");
  if (seen.has(authored)) return ended("cycle");
  if (hops > MAX_HOPS) return ended("depth");
  if (malformedPointer(authored)) return ended("malformed");
  // A plain-name fragment such as `#notes` is local but not a pointer this reader can follow.
  if (pointerParts(authored) === undefined) return ended("unresolved");
  const target = pointerTarget(root, authored);
  if (!isJson(target)) return ended("unresolved");

  const next = resolve(target, root, hops + 1, new Set([...seen, authored]));
  return {
    schema: { ...next.schema, ...withoutRef(schema) },
    ref: { value, state: next.ref?.state ?? "resolved" },
  };
}

/** The schema with its `$ref` applied. Non-resolving references contribute no keywords. */
function view(schema: Json, root: Json, hops = 0): Json {
  return resolve(schema, root, hops).schema;
}

/** The values a schema allows: its `enum`, or its single `const`. */
function valuesOf(schema: Json): readonly unknown[] {
  if (Array.isArray(schema.enum)) return schema.enum;
  if (Object.hasOwn(schema, "const")) return [schema.const];
  return [];
}

/**
 * The schema's type as text. Arrays read as `item[]`; unions join with `|`. A reference that did not
 * resolve reads `unknown`, never a bare `any` that would claim the field is unconstrained.
 */
function typeOf(schema: Json, root: Json, depth = 0): string {
  if (depth > MAX_HOPS) return "unknown";
  const resolved = resolve(schema, root);
  const own = resolved.schema;
  if (typeof own.type === "string") {
    if (own.type === "array" && isJson(own.items)) {
      return `${typeOf(own.items, root, depth + 1)}[]`;
    }
    return own.type;
  }
  if (Array.isArray(own.type)) return own.type.map(String).join(" | ");
  const members = [
    ...(Array.isArray(own.anyOf) ? own.anyOf : []),
    ...(Array.isArray(own.oneOf) ? own.oneOf : []),
  ];
  const memberTypes = members.filter(isJson).map((member) => typeOf(member, root, depth + 1));
  if (memberTypes.length > 0) return memberTypes.join(" | ");
  if (Object.hasOwn(own, "enum") || Object.hasOwn(own, "const")) return "enum";
  if (resolved.ref !== null && resolved.ref.state !== "resolved") return "unknown";
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

/**
 * Whether a schema still defines child rows one level down (its own properties, or those of array
 * `items`). A shallow read: it never recurses, so it stays safe at the depth limit.
 */
function mayHaveChildren(schema: Json, root: Json): boolean {
  const listsProperties = (owner: Json): boolean =>
    isJson(owner.properties) && Object.values(owner.properties).some(isJson);
  if (listsProperties(schema)) return true;
  return isJson(schema.items) && listsProperties(view(schema.items, root));
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
  const authored = typeof prop.$ref === "string" ? prop.$ref : undefined;
  // A `$ref` already on the way down is a cycle: show the row, but do not expand it again.
  const cyclic = authored !== undefined && active.has(authored);
  const nested = authored === undefined ? active : new Set([...active, authored]);
  const resolution = resolve(prop, root);
  const resolved = resolution.schema;
  const atDepthLimit = depth + 1 > MAX_DEPTH;
  const truncated = cyclic ? "cycle" : atDepthLimit && mayHaveChildren(resolved, root) ? "depth" : null;
  // An unresolved reference keeps its own state; a resolved one says whether expansion was cut off.
  const ref: SchemaRef | null =
    resolution.ref === null
      ? null
      : {
          value: resolution.ref.value,
          state:
            cyclic
              ? "cycle"
              : resolution.ref.state !== "resolved"
                ? resolution.ref.state
                : truncated === "depth"
                  ? "depth"
                  : "resolved",
        };
  const children =
    cyclic || atDepthLimit ? [] : childRows(resolved, root, depth + 1, nested, path);

  return {
    path,
    name,
    type: typeOf(prop, root),
    required,
    hasDefault: Object.hasOwn(resolved, "default"),
    defaultValue: resolved.default,
    description: typeof resolved.description === "string" ? resolved.description : "",
    values: valuesOf(resolved),
    depth,
    ref,
    children,
    truncated,
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

/** One visible field as published evidence: everything the row shows, in a machine-readable shape. */
export interface SchemaFieldNode {
  /** Dotted path from the root, unique within the table. */
  readonly path: string;
  /** The property name as written in the schema. */
  readonly name: string;
  /** The id of the field's row in the table, so the JSON and the DOM point at each other. */
  readonly anchor: string;
  /** 0 for top-level properties, 1 for their properties, and so on. */
  readonly depth: number;
  /** Type as text, exactly the table shows it: `string`, `string | null`, `string[]`, `enum`, `unknown`, `any`. */
  readonly type: string;
  /** The row's current copy value, `path: type`, unchanged. */
  readonly copyValue: string;
  /** True when the parent schema lists the property in `required`. */
  readonly required: boolean;
  /** The default: `present` is the `default` keyword, `hasValue` separates an explicit null from absent. */
  readonly default: {
    readonly present: boolean;
    readonly hasValue: boolean;
    readonly value?: unknown;
  };
  /** Allowed values from `enum`, or the single `const` value; empty when the schema lists none. */
  readonly values: readonly unknown[];
  /** The `description` text, or an empty string. */
  readonly description: string;
  /** The `$ref` the field authored and how it was treated, or null when it authored none. */
  readonly ref: SchemaRef | null;
  /** `"cycle"` or `"depth"` when expansion stopped early; `null` when `children` is the full story. */
  readonly truncated: "cycle" | "depth" | null;
  /** Fields nested under this one, in schema order; empty when `truncated` explains why. */
  readonly children: readonly SchemaFieldNode[];
}

/** The whole payload one table publishes for automation: the schema's path and its visible fields. */
export interface SchemaFieldsPayload {
  /** Names the component, so a consumer knows how to read the rest. */
  readonly component: "schema-table";
  /** Shape version; bumped when the meaning of a field changes. Version 2 adds `ref` and `unknown` types. */
  readonly version: 2;
  /** The schema's path under `_data`, as the directive wrote it. */
  readonly data: string;
  /** Top-level fields in table order, nested fields under each as `children`. */
  readonly fields: readonly SchemaFieldNode[];
}

/** One row's evidence, ready for JSON: the SchemaRow's facts with the row's anchor and copy value. */
export function fieldNodeOf(row: SchemaRow, base: string): SchemaFieldNode {
  return {
    path: row.path,
    name: row.name,
    anchor: fieldId(base, row.path),
    depth: row.depth,
    type: row.type,
    copyValue: copyValueOf(row),
    required: row.required,
    default: {
      present: row.hasDefault,
      hasValue: row.hasDefault && row.defaultValue !== undefined,
      value: row.defaultValue,
    },
    values: [...row.values],
    description: row.description,
    ref: row.ref,
    truncated: row.truncated,
    children: row.children.map((child) => fieldNodeOf(child, base)),
  };
}

/** The payload for one table: every visible field, with nesting and order kept as the table shows them. */
export function fieldsPayloadOf(data: string, base: string, rows: readonly SchemaRow[]): SchemaFieldsPayload {
  return { component: "schema-table", version: 2, data, fields: rows.map((row) => fieldNodeOf(row, base)) };
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
export function fieldsJson(payload: SchemaFieldsPayload): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/** A value as the table shows it: JSON, so strings keep their quotes and `null` and numbers read as written. */
function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function flatten(rows: readonly SchemaRow[]): SchemaRow[] {
  return rows.flatMap((row) => [row, ...flatten(row.children)]);
}

/** The visible marker for a reference that was not expanded: its authored value and how it ended. */
function refNode(ref: SchemaRef) {
  return h(
    "span",
    { class: REF_CLASS, dir: "ltr" },
    h("code", null, `$ref ${ref.value}`),
    " ",
    h("span", { class: REF_STATE_CLASS }, ref.state),
  );
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
      ...(row.ref === null ? {} : { "data-ref": row.ref.value, "data-ref-state": row.ref.state }),
    },
    h("th", { scope: "row", class: "schema-name", id: ownHeader, ...headerHeaders }, h("code", { dir: "ltr" }, row.name)),
    h(
      "td",
      { ...headersOf("type") },
      h("code", { class: "schema-type", dir: "ltr" }, row.type),
      row.ref !== null && row.ref.state !== "resolved" ? refNode(row.ref) : null,
    ),
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
 * headers and messages come from the page language's catalog. An inert JSON script publishes the same
 * fields — paths, types, required state, defaults, allowed values, descriptions, hierarchy, authored
 * references with their resolution state, and honest truncation marks — so agents read the evidence
 * without scraping formatted cells.
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
  const payload = fieldsPayloadOf(path, base, schemaRows(schema));

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
    h("script", {
      type: "application/json",
      "data-schema-fields": "",
      dangerouslySetInnerHTML: { __html: fieldsJson(payload) },
    }),
  );
}
