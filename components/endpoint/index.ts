import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Methods with their own badge color. Any other method gets the neutral badge. */
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type EndpointProps = {
  /** HTTP method in any case (`get`, `POST`). Missing or blank means no method badge. */
  method?: string;
  /** The path, with parameters as `{id}` (OpenAPI) or `:id` (Express). */
  path?: string;
  /** Id of the endpoint block. Give one when two endpoints share a method and path. */
  id?: string;
  /**
   * JSON array of path parameter metadata:
   * `[{"name":"id","type":"string","required":true,"description":"The user id."}]`.
   * Only names the path contains are used, and the first entry for a name wins.
   */
  parameters?: string;
};

/** One path parameter, with the metadata authors may give for it. */
export interface EndpointParameter {
  readonly name: string;
  /** The authored type, or `string` when none is given. */
  readonly type: string;
  /** A path parameter is required unless the author explicitly says otherwise. */
  readonly required: boolean;
  /** The authored description, or an empty string. */
  readonly description: string;
}

/** What automation reads from an endpoint without parsing its badges or highlight marks. */
export interface EndpointOperation {
  /** The endpoint's stable id. */
  readonly id: string;
  /** The upper-case method, or null when the endpoint has none. */
  readonly method: string | null;
  readonly path: string;
  readonly parameters: readonly EndpointParameter[];
}

/** The type a parameter has when the author gives none: every path parameter is text in the URL. */
const DEFAULT_TYPE = "string";

/** One `{name}` or `:name` in a path. The capture group keeps the parameters at the odd indexes of a split. */
const PARAMETER = /(\{[^{}]+\}|:[A-Za-z_][A-Za-z0-9_]*)/;

export type PathSegment = { text: string; parameter: boolean };

/** The path cut into literal text and parameters, in order. */
export function pathSegments(path: string): PathSegment[] {
  return path.split(PARAMETER).map((text, index) => ({ text, parameter: index % 2 === 1 }));
}

/** The name inside one parameter token: `{id}` or `:id` gives `id`. */
function nameOf(token: string): string {
  return token.startsWith("{") ? token.slice(1, -1) : token.slice(1);
}

/** The name of each parameter in the path, once each, in order of appearance. */
export function parameterNames(path: string): string[] {
  const names = pathSegments(path)
    .filter((segment) => segment.parameter)
    .map(({ text }) => nameOf(text));
  return [...new Set(names)];
}

/** The method in upper case, or undefined when there is none. */
export function methodOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const method = value.trim().toUpperCase();
  return method === "" ? undefined : method;
}

/** Class names of the method badge: `endpoint-method` plus a color per known method, or `-other`. */
export function methodClassOf(method: string): string {
  const known = (METHODS as readonly string[]).includes(method);
  return `endpoint-method endpoint-method-${known ? method.toLowerCase() : "other"}`;
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

/**
 * The id of an endpoint block: the `id` prop when given, otherwise the method and path, so the same
 * endpoint keeps the same anchor across builds.
 */
export function idOf(props: EndpointProps): string {
  const given = slugOf(typeof props.id === "string" ? props.id : "");
  if (given !== "") return given;
  const method = methodOf(props.method)?.toLowerCase() ?? "";
  const path = slugOf(typeof props.path === "string" ? props.path : "");
  const stem = [method, path].filter((part) => part !== "").join("-");
  return stem === "" ? "endpoint" : `endpoint-${stem}`;
}

/** The canonical request line a link or a copy action takes, without the badge's styling. */
export function requestLineOf(method: string | undefined, path: string): string {
  return method === undefined ? path : `${method} ${path}`.trim();
}

/** The id of one entry in the parameter list. */
export function parameterId(base: string, name: string): string {
  return `${base}-param-${slugOf(name) || "parameter"}`;
}

/** One metadata entry, or undefined when it has no usable name. Unknown keys are ignored. */
function parameterOf(raw: unknown): EndpointParameter | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") return undefined;
  const type = typeof record.type === "string" ? record.type.trim() : "";
  return {
    name,
    type: type === "" ? DEFAULT_TYPE : type,
    required: typeof record.required === "boolean" ? record.required : true,
    description: typeof record.description === "string" ? record.description.trim() : "",
  };
}

/**
 * Authored parameter metadata by name. Unreadable JSON, a value that is not an array, and entries without
 * a name give no metadata; the first entry for a name wins, so duplicates cannot change the result.
 */
export function parseParameters(raw: unknown): Map<string, EndpointParameter> {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return new Map();
    try {
      value = JSON.parse(raw);
    } catch {
      return new Map();
    }
  }
  if (!Array.isArray(value)) return new Map();
  const parameters = new Map<string, EndpointParameter>();
  for (const entry of value) {
    const parameter = parameterOf(entry);
    if (parameter !== undefined && !parameters.has(parameter.name)) parameters.set(parameter.name, parameter);
  }
  return parameters;
}

/**
 * The metadata for each parameter the path names, in path order. Authored metadata is matched by name;
 * entries for names the path does not name are ignored, and the rest get the defaults.
 */
export function parameterList(path: string, raw: unknown): EndpointParameter[] {
  const authored = parseParameters(raw);
  return parameterNames(path).map(
    (name) => authored.get(name) ?? { name, type: DEFAULT_TYPE, required: true, description: "" },
  );
}

/** The structured operation an endpoint publishes: its id, method, path, and typed parameters. */
export function operationOf(props: EndpointProps): EndpointOperation {
  const method = methodOf(props.method);
  const path = typeof props.path === "string" ? props.path : "";
  return { id: idOf(props), method: method ?? null, path, parameters: parameterList(path, props.parameters) };
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
export function operationJson(operation: EndpointOperation): string {
  return JSON.stringify(operation).replace(/</g, "\\u003c");
}

/**
 * An API endpoint for a reference page: the method badge, the path with its parameters highlighted,
 * the parameters the path names, and the body (descriptions and request or response samples).
 * The body arrives already rendered to HTML. Parameter labels and yes/no answers come from the page
 * language's catalog, while types and the location value stay machine tokens. An inert JSON script
 * publishes the same operation for automation, so agents do not have to read the badge or the
 * highlight marks.
 */
export default function endpoint({ props, html, page }: ComponentProps<EndpointProps>) {
  const operation = operationOf(props);
  const { method, path, id } = operation;
  const lang = page.lang;
  const authored = parseParameters(props.parameters);

  return h(
    "div",
    {
      class: "endpoint",
      id,
      "data-method": method ?? undefined,
      "data-path": path,
      "data-copy-value": requestLineOf(method ?? undefined, path),
    },
    h(
      "div",
      { class: "endpoint-line" },
      method === null ? null : h("span", { class: methodClassOf(method) }, method),
      h(
        "code",
        { class: "endpoint-path", dir: "ltr" },
        pathSegments(path).map(({ text, parameter }) =>
          parameter ? h("span", { class: "endpoint-param", "data-param": nameOf(text) }, text) : text,
        ),
      ),
    ),
    operation.parameters.length === 0
      ? null
      : h(
          "ul",
          { class: "endpoint-params" },
          operation.parameters.map((parameter) =>
            h(
              "li",
              { id: parameterId(id, parameter.name), "data-param": parameter.name },
              h("code", { class: "endpoint-param", dir: "ltr" }, parameter.name),
              authored.has(parameter.name) ? parameterMeta(parameter, lang) : null,
            ),
          ),
        ),
    h("script", {
      type: "application/json",
      "data-endpoint-operation": "",
      dangerouslySetInnerHTML: { __html: operationJson(operation) },
    }),
    html === ""
      ? null
      : h("div", { class: "endpoint-body", dangerouslySetInnerHTML: { __html: html } }),
  );
}

/** The accessible details of one parameter: type, required state, path association, and description. */
function parameterMeta(parameter: EndpointParameter, lang: string) {
  const rows = [
    h("dt", null, t(lang, "type")),
    h("dd", null, h("code", { class: "endpoint-param-type", dir: "ltr" }, parameter.type)),
    h("dt", null, t(lang, "required")),
    h("dd", { class: "endpoint-param-required" }, t(lang, parameter.required ? "yes" : "no")),
    h("dt", null, t(lang, "endpoint_in")),
    h("dd", { class: "endpoint-param-in", dir: "ltr" }, "path"),
  ];
  if (parameter.description !== "") {
    rows.push(
      h("dt", null, t(lang, "description")),
      h("dd", { class: "endpoint-param-description" }, parameter.description),
    );
  }
  return h("dl", { class: "endpoint-param-meta" }, rows);
}
