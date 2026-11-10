import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import endpoint, {
  METHODS,
  methodClassOf,
  methodOf,
  parameterNames,
  pathSegments,
  type EndpointProps,
} from "../components/endpoint/index.ts";

type Node = { type: string; props: { class?: string; dir?: string; children?: unknown; dangerouslySetInnerHTML?: { __html: string } } };

/** Render the endpoint the way the render host calls it: props from the directive plus the body HTML. */
function render(props: EndpointProps, html = ""): Node {
  return endpoint({ props, html } as unknown as ComponentProps<EndpointProps>) as unknown as Node;
}

/** Every element in a rendered tree, depth first. Text and empty children are skipped. */
function elements(node: unknown): Node[] {
  if (node === null || typeof node !== "object" || !("type" in node)) return [];
  const element = node as Node;
  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
  return [element, ...children.flatMap((child) => elements(child))];
}

/** The elements whose class list includes the given class. */
function withClass(node: Node, name: string): Node[] {
  return elements(node).filter((element) => element.props.class?.split(" ").includes(name));
}

/** The text of a node: strings and nested string children, concatenated. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (value !== null && typeof value === "object" && "props" in value) {
    return textOf((value as Node).props.children);
  }
  return "";
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/endpoint/style.css", import.meta.url), "utf8");

test("default export is the endpoint component", () => {
  assert.equal(typeof endpoint, "function");
});

test("renders a wrapper with the method badge and the path", () => {
  const node = render({ method: "POST", path: "/api/v1/users" });
  assert.equal(node.props.class, "endpoint");
  const [badge] = withClass(node, "endpoint-method");
  assert.equal(textOf(badge), "POST");
  const [path] = withClass(node, "endpoint-path");
  assert.equal(textOf(path), "/api/v1/users");
  assert.equal(path?.props.dir, "ltr");
});

test("upper-cases the method and trims it", () => {
  assert.equal(methodOf(" get "), "GET");
  assert.equal(methodOf("Delete"), "DELETE");
  assert.equal(methodOf(""), undefined);
  assert.equal(methodOf("   "), undefined);
  assert.equal(methodOf(7), undefined);
  assert.equal(textOf(withClass(render({ method: "patch", path: "/a" }), "endpoint-method")[0]), "PATCH");
});

test("a missing or blank method renders no method badge", () => {
  assert.deepEqual(withClass(render({ path: "/a" }), "endpoint-method"), []);
  assert.deepEqual(withClass(render({ method: "  ", path: "/a" }), "endpoint-method"), []);
});

test("each known method gets its own badge class", () => {
  assert.deepEqual([...METHODS], ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  for (const method of METHODS) {
    assert.equal(methodClassOf(method), `endpoint-method endpoint-method-${method.toLowerCase()}`);
    const [badge] = withClass(render({ method, path: "/a" }), "endpoint-method");
    assert.equal(badge?.props.class, `endpoint-method endpoint-method-${method.toLowerCase()}`);
  }
});

test("an unknown method gets the neutral badge class and keeps its text", () => {
  assert.equal(methodClassOf("PROPFIND"), "endpoint-method endpoint-method-other");
  const [badge] = withClass(render({ method: "propfind", path: "/a" }), "endpoint-method");
  assert.equal(badge?.props.class, "endpoint-method endpoint-method-other");
  assert.equal(textOf(badge), "PROPFIND");
});

test("highlights OpenAPI and Express parameters in the path", () => {
  assert.deepEqual(pathSegments("/users/{id}/posts/:postId/"), [
    { text: "/users/", parameter: false },
    { text: "{id}", parameter: true },
    { text: "/posts/", parameter: false },
    { text: ":postId", parameter: true },
    { text: "/", parameter: false },
  ]);
  const highlighted = withClass(render({ method: "GET", path: "/users/{id}/posts/:postId" }), "endpoint-param");
  const inPath = highlighted.filter((element) => element.type === "span");
  assert.deepEqual(inPath.map(textOf), ["{id}", ":postId"]);
});

test("a path without parameters has no highlight and no parameter list", () => {
  const node = render({ method: "GET", path: "/health" });
  assert.deepEqual(withClass(node, "endpoint-param"), []);
  assert.deepEqual(withClass(node, "endpoint-params"), []);
});

test("lists each parameter of the path once, in order", () => {
  assert.deepEqual(parameterNames("/a/{id}/b/:id/{slug}"), ["id", "slug"]);
  assert.deepEqual(parameterNames("/health"), []);
  const [list] = withClass(render({ method: "GET", path: "/a/{id}/b/:slug" }), "endpoint-params");
  assert.ok(list, "parameter list rendered");
  const items = elements(list).filter((element) => element.type === "li");
  assert.deepEqual(items.map((item) => textOf(item)), ["id", "slug"]);
});

test("renders the body HTML when there is one", () => {
  const node = render({ method: "GET", path: "/a" }, "<p>Returns a user.</p>");
  const [body] = withClass(node, "endpoint-body");
  assert.deepEqual(body?.props.dangerouslySetInnerHTML, { __html: "<p>Returns a user.</p>" });
});

test("renders no body element when the body is empty", () => {
  assert.deepEqual(withClass(render({ method: "GET", path: "/a" }), "endpoint-body"), []);
});

test("a missing path renders an empty path without failing", () => {
  const node = render({ method: "GET" });
  assert.equal(textOf(withClass(node, "endpoint-path")[0]), "");
  assert.deepEqual(withClass(node, "endpoint-params"), []);
});

test("each method color reads from a token that exists in names.json", () => {
  const expected: Record<string, string> = {
    get: "--color-info",
    post: "--color-success",
    put: "--color-warning",
    patch: "--color-warning",
    delete: "--color-danger",
  };
  for (const [method, token] of Object.entries(expected)) {
    const rule = new RegExp(`\\.endpoint-method-${method}\\b[^{]*\\{[^}]*color:\\s*var\\(${token}\\)`);
    assert.match(css, rule, `.endpoint-method-${method} uses var(${token})`);
  }
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(top|bottom)\b/);
});
