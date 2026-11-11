import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import endpoint, {
  METHODS,
  idOf,
  methodClassOf,
  methodOf,
  operationJson,
  operationOf,
  parameterId,
  parameterList,
  parameterNames,
  parseParameters,
  pathSegments,
  requestLineOf,
  type EndpointOperation,
  type EndpointProps,
} from "../components/endpoint/index.ts";

type Node = {
  type: string;
  props: {
    class?: string;
    dir?: string;
    children?: unknown;
    dangerouslySetInnerHTML?: { __html: string };
    [key: string]: unknown;
  };
};

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

/** The operation descriptor from the inert JSON script the component publishes. */
function operationOfNode(node: Node): EndpointOperation {
  const [script] = elements(node).filter(
    (element) => element.type === "script" && element.props["data-endpoint-operation"] !== undefined,
  );
  assert.ok(script, "operation script rendered");
  return JSON.parse(script.props.dangerouslySetInnerHTML?.__html ?? "") as EndpointOperation;
}

/** One parameter's list item by name. */
function parameterItem(node: Node, name: string): Node {
  const [item] = withClass(node, "endpoint-params").flatMap((list) =>
    elements(list).filter((element) => element.type === "li" && element.props["data-param"] === name),
  );
  assert.ok(item, `no parameter item named ${name}`);
  return item;
}

/** The detail rows of a parameter item: label to value, in order. */
function metaOf(item: Node): [string, string][] {
  const [meta] = withClass(item, "endpoint-param-meta");
  if (meta === undefined) return [];
  const rows = elements(meta).filter((element) => element.type === "dt" || element.type === "dd");
  return rows.reduce<[string, string][]>((pairs, element, index) => {
    if (element.type === "dt") pairs.push([textOf(element), ""]);
    else if (pairs.length > 0) pairs[pairs.length - 1]![1] = textOf(element);
    return pairs;
  }, []);
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

test("the endpoint gets a deterministic id from its method and path", () => {
  assert.equal(idOf({ method: "get", path: "/users/{id}" }), "endpoint-get-users-id");
  assert.equal(idOf({ method: "POST", path: "/users" }), "endpoint-post-users");
  assert.equal(idOf({ path: "/health" }), "endpoint-health");
  assert.equal(idOf({}), "endpoint");
  assert.equal(idOf({ method: "get", path: "/users/{id}" }), idOf({ method: "GET", path: "/users/{id}" }));

  const node = render({ method: "GET", path: "/users/{id}" });
  assert.equal(node.props.id, "endpoint-get-users-id");
});

test("an explicit id wins and is reduced to a safe value", () => {
  assert.equal(idOf({ id: "Get user by id", method: "GET", path: "/users/{id}" }), "get-user-by-id");
  assert.equal(render({ id: "custom", method: "GET", path: "/a" }).props.id, "custom");
});

test("the block exposes the method, path, and canonical request line for agents", () => {
  const node = render({ method: "get", path: "/users/{id}" });
  assert.equal(node.props["data-method"], "GET");
  assert.equal(node.props["data-path"], "/users/{id}");
  assert.equal(node.props["data-copy-value"], "GET /users/{id}");
  assert.equal(requestLineOf("DELETE", "/users/{id}"), "DELETE /users/{id}");
  assert.equal(requestLineOf(undefined, "/health"), "/health");
  assert.equal(requestLineOf("GET", ""), "GET");
});

test("each parameter gets an id and its own value", () => {
  assert.equal(parameterId("endpoint-get-a", "userId"), "endpoint-get-a-param-userid");
  assert.equal(parameterId("base", ""), "base-param-parameter");
  const [list] = withClass(render({ method: "GET", path: "/a/{userId}/b/:slug" }), "endpoint-params");
  const items = elements(list).filter((element) => element.type === "li");
  assert.deepEqual(
    items.map((item) => [item.props.id, item.props["data-param"], textOf(item)]),
    [
      ["endpoint-get-a-userid-b-slug-param-userid", "userId", "userId"],
      ["endpoint-get-a-userid-b-slug-param-slug", "slug", "slug"],
    ],
  );
});

test("merges authored metadata with both path syntaxes, in path order", () => {
  const parameters = JSON.stringify([
    { name: "postId", type: "integer", required: true, description: "The post id." },
    { name: "id", type: "uuid", description: "The user id." },
    { name: "extra", type: "boolean", required: false, description: "Not in the path." },
  ]);
  const node = render({ method: "get", path: "/users/{id}/posts/:postId", parameters });

  assert.deepEqual(
    operationOfNode(node).parameters.map((parameter) => parameter.name),
    ["id", "postId"],
  );
  assert.deepEqual(metaOf(parameterItem(node, "id")), [
    ["Type", "uuid"],
    ["Required", "Yes"],
    ["In", "path"],
    ["Description", "The user id."],
  ]);
  assert.deepEqual(metaOf(parameterItem(node, "postId")), [
    ["Type", "integer"],
    ["Required", "Yes"],
    ["In", "path"],
    ["Description", "The post id."],
  ]);
});

test("unauthored parameters get typed defaults and unknown metadata is ignored", () => {
  const node = render({
    method: "GET",
    path: "/a/{id}/:slug",
    parameters: '[{"name":"id","type":"  ","required":false},{"name":"missing","description":"Ignored."}]',
  });

  assert.deepEqual(operationOfNode(node).parameters, [
    { name: "id", type: "string", required: false, description: "" },
    { name: "slug", type: "string", required: true, description: "" },
  ]);
  assert.deepEqual(metaOf(parameterItem(node, "id")), [
    ["Type", "string"],
    ["Required", "No"],
    ["In", "path"],
  ]);
  assert.deepEqual(metaOf(parameterItem(node, "slug")), []);
});

test("metadata treats the first duplicate name as the one entry", () => {
  const parameters = JSON.stringify([
    { name: "id", type: "uuid", required: true, description: "First." },
    { name: "id", type: "integer", required: false, description: "Second." },
  ]);
  const parsed = parseParameters(parameters);
  assert.deepEqual([...parsed.values()], [{ name: "id", type: "uuid", required: true, description: "First." }]);
  assert.deepEqual(
    parameterList("/a/{id}", parameters).map((parameter) => parameter.description),
    ["First."],
  );
});

test("unreadable or malformed metadata gives no entries and never throws", () => {
  for (const raw of [
    "",
    "   ",
    "{not json",
    "{}",
    '"id"',
    "null",
    JSON.stringify([null, 7, "id", [], {}, { name: "" }, { name: "  " }]),
    JSON.stringify([{ name: "ok", type: 7, required: "yes", description: null, extra: "ignored" }]),
  ]) {
    assert.doesNotThrow(() => parseParameters(raw));
  }

  assert.deepEqual([...parseParameters("{not json").values()], []);
  assert.deepEqual([...parseParameters("null").values()], []);
  assert.deepEqual([...parseParameters([{ name: "id" }]).values()], [
    { name: "id", type: "string", required: true, description: "" },
  ]);
  assert.deepEqual([...parseParameters([{ name: "ok", type: 7, required: "yes", description: null }]).values()], [
    { name: "ok", type: "string", required: true, description: "" },
  ]);
});

test("invalid JSON preserves the existing list, copy value, and body", () => {
  const node = render(
    { method: "GET", path: "/users/{id}", parameters: "{broken" },
    "<p>Returns a user.</p>",
  );
  const [list] = withClass(node, "endpoint-params");
  assert.deepEqual(
    elements(list).filter((element) => element.type === "li").map(textOf),
    ["id"],
  );
  assert.deepEqual(withClass(node, "endpoint-param-meta"), []);
  assert.equal(node.props["data-copy-value"], "GET /users/{id}");
  assert.deepEqual(withClass(node, "endpoint-body")[0]?.props.dangerouslySetInnerHTML, {
    __html: "<p>Returns a user.</p>",
  });
  assert.deepEqual(operationOfNode(node).parameters, [
    { name: "id", type: "string", required: true, description: "" },
  ]);
});

test("the operation descriptor exposes the stable id, method, path, and typed parameters", () => {
  const node = render({
    method: "get",
    path: "/users/{id}",
    parameters: '[{"name":"id","type":"uuid","required":true,"description":"The user id."}]',
  });
  assert.deepEqual(operationOfNode(node), {
    id: "endpoint-get-users-id",
    method: "GET",
    path: "/users/{id}",
    parameters: [{ name: "id", type: "uuid", required: true, description: "The user id." }],
  });
  assert.deepEqual(operationOf({ path: "/health" }), {
    id: "endpoint-health",
    method: null,
    path: "/health",
    parameters: [],
  });
});

test("readers get parameter metadata and path associations in both directions", () => {
  const node = render({
    method: "GET",
    path: "/users/{id}/posts/:postId",
    parameters: JSON.stringify([
      { name: "id", type: "uuid", required: true, description: "The user id." },
      { name: "postId", type: "integer", required: false, description: "The post id." },
    ]),
  });

  const tokens = withClass(node, "endpoint-param").filter((element) => element.type === "span");
  assert.deepEqual(
    tokens.map((token) => token.props["data-param"]),
    ["id", "postId"],
  );
  const [pathCode] = withClass(node, "endpoint-path");
  assert.equal(pathCode?.props.dir, "ltr", "the path stays left to right under RTL");

  const item = parameterItem(node, "id");
  assert.equal(item.props.id, parameterId(node.props.id as string, "id"));
  const [nameCode] = withClass(item, "endpoint-param");
  assert.equal(textOf(nameCode), "id");
  const [typeCode] = withClass(item, "endpoint-param-type");
  assert.equal(textOf(typeCode), "uuid");
  for (const code of [...withClass(item, "endpoint-param"), ...withClass(item, "endpoint-param-type")]) {
    assert.equal(code.props.dir, "ltr");
  }

  const [description] = withClass(parameterItem(node, "postId"), "endpoint-param-description");
  assert.equal(textOf(description), "The post id.");
  assert.equal(description?.props.dir, undefined, "the description follows the page direction");

  const [required] = withClass(parameterItem(node, "postId"), "endpoint-param-required");
  assert.equal(textOf(required), "No");
  const [path] = withClass(parameterItem(node, "postId"), "endpoint-param-in");
  assert.equal(textOf(path), "path");
});

test("unsafe metadata stays text and the descriptor cannot close its script", () => {
  const hostile = "</script><img src=x onerror=alert(1)>";
  const parameters = JSON.stringify([
    { name: "id", type: "<b>uuid</b>", description: hostile },
    { name: "<img src=x>", type: "string", description: "Not in the path." },
  ]);
  const node = render({ method: "GET", path: "/users/{id}", parameters });

  const [description] = withClass(parameterItem(node, "id"), "endpoint-param-description");
  assert.equal(textOf(description), hostile);
  assert.equal(description?.props.dangerouslySetInnerHTML, undefined);
  const [type] = withClass(parameterItem(node, "id"), "endpoint-param-type");
  assert.equal(textOf(type), "<b>uuid</b>");
  assert.equal(type?.props.dangerouslySetInnerHTML, undefined);

  const operation = operationOfNode(node);
  assert.deepEqual(operation.parameters, [{ name: "id", type: "<b>uuid</b>", required: true, description: hostile }]);
  const json = operationJson(operation);
  assert.ok(!json.includes("<"), "every < is escaped inside the script");
  assert.ok(!json.includes("</script>"));
});

test("an endpoint without metadata keeps its original list and body", () => {
  const node = render({ method: "GET", path: "/a/{id}/b/:slug" }, "<p>Body.</p>");
  assert.equal(node.props["data-method"], "GET");
  assert.equal(node.props["data-path"], "/a/{id}/b/:slug");
  assert.equal(node.props["data-copy-value"], "GET /a/{id}/b/:slug");
  assert.deepEqual(withClass(node, "endpoint-param-meta"), []);
  const [list] = withClass(node, "endpoint-params");
  assert.deepEqual(
    elements(list).filter((element) => element.type === "li").map((item) => [item.props["data-param"], textOf(item)]),
    [
      ["id", "id"],
      ["slug", "slug"],
    ],
  );
  assert.deepEqual(withClass(node, "endpoint-body")[0]?.props.dangerouslySetInnerHTML, { __html: "<p>Body.</p>" });
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
