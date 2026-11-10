import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Methods with their own badge color. Any other method gets the neutral badge. */
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type EndpointProps = {
  /** HTTP method in any case (`get`, `POST`). Missing or blank means no method badge. */
  method?: string;
  /** The path, with parameters as `{id}` (OpenAPI) or `:id` (Express). */
  path?: string;
};

/** One `{name}` or `:name` in a path. The capture group keeps the parameters at the odd indexes of a split. */
const PARAMETER = /(\{[^{}]+\}|:[A-Za-z_][A-Za-z0-9_]*)/;

export type PathSegment = { text: string; parameter: boolean };

/** The path cut into literal text and parameters, in order. */
export function pathSegments(path: string): PathSegment[] {
  return path.split(PARAMETER).map((text, index) => ({ text, parameter: index % 2 === 1 }));
}

/** The name of each parameter in the path, once each, in order of appearance. */
export function parameterNames(path: string): string[] {
  const names = pathSegments(path)
    .filter((segment) => segment.parameter)
    .map(({ text }) => (text.startsWith("{") ? text.slice(1, -1) : text.slice(1)));
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

/**
 * An API endpoint for a reference page: the method badge, the path with its parameters highlighted,
 * the parameters the path names, and the body (descriptions and request or response samples).
 * The body arrives already rendered to HTML.
 */
export default function endpoint({ props, html }: ComponentProps<EndpointProps>) {
  const method = methodOf(props.method);
  const path = typeof props.path === "string" ? props.path : "";
  const names = parameterNames(path);

  return h(
    "div",
    { class: "endpoint" },
    h(
      "div",
      { class: "endpoint-line" },
      method === undefined ? null : h("span", { class: methodClassOf(method) }, method),
      h(
        "code",
        { class: "endpoint-path", dir: "ltr" },
        pathSegments(path).map(({ text, parameter }) =>
          parameter ? h("span", { class: "endpoint-param" }, text) : text,
        ),
      ),
    ),
    names.length === 0
      ? null
      : h(
          "ul",
          { class: "endpoint-params" },
          names.map((name) => h("li", null, h("code", { class: "endpoint-param", dir: "ltr" }, name))),
        ),
    html === ""
      ? null
      : h("div", { class: "endpoint-body", dangerouslySetInnerHTML: { __html: html } }),
  );
}
