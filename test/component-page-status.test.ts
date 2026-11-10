import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import pageStatus, {
  STATUSES,
  classNameOf,
  replacementOf,
  sinceOf,
  statusOf,
  type PageStatusProps,
} from "../components/page-status/index.ts";

type Node = {
  type: string;
  props: { class?: string; href?: string; role?: string; children?: unknown };
};

/** Render the banner the way the render host calls it: props from front matter or the directive. */
function render(props: PageStatusProps): Node | null {
  return pageStatus({ props, html: "" } as unknown as ComponentProps<PageStatusProps>) as Node | null;
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

const css = readFileSync(new URL("../components/page-status/style.css", import.meta.url), "utf8");

test("default export is the page status component", () => {
  assert.equal(typeof pageStatus, "function");
});

test("renders a banner with the status class and label for each banner status", () => {
  assert.deepEqual([...STATUSES], ["experimental", "beta", "deprecated"]);
  const labels: Record<string, string> = { experimental: "Experimental", beta: "Beta", deprecated: "Deprecated" };
  for (const status of STATUSES) {
    const node = render({ status });
    assert.ok(node, `${status} renders a banner`);
    assert.equal(node.props.class, `page-status page-status-${status}`);
    assert.equal(node.props.role, "note");
    const [label] = withClass(node, "page-status-label");
    assert.equal(textOf(label), labels[status]);
  }
});

test("a missing, blank, or unknown status renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ status: "  " }), null);
  assert.equal(render({ status: "proposed" }), null);
  assert.equal(render({ status: "superseded" }), null);
  assert.equal(render({ status: "stable" }), null);
});

test("the status is matched without case or surrounding spaces", () => {
  assert.equal(statusOf(" Beta "), "beta");
  assert.equal(statusOf("DEPRECATED"), "deprecated");
  assert.equal(statusOf(""), undefined);
  assert.equal(statusOf(undefined), undefined);
  assert.equal(statusOf(7), undefined);
  assert.equal(classNameOf("experimental"), "page-status page-status-experimental");
});

test("shows the version when the status was set", () => {
  const [since] = withClass(render({ status: "beta", since: " 0.3.0 " }) as Node, "page-status-since");
  assert.equal(textOf(since), "Since 0.3.0");
  assert.equal(sinceOf(" 0.3.0 "), "0.3.0");
});

test("omits the version when it is missing, blank, or not a string", () => {
  assert.deepEqual(withClass(render({ status: "beta" }) as Node, "page-status-since"), []);
  assert.deepEqual(withClass(render({ status: "beta", since: "   " }) as Node, "page-status-since"), []);
  assert.equal(sinceOf(42), undefined);
});

test("a deprecated page with a replacement links to it", () => {
  const [link] = withClass(
    render({ status: "deprecated", replaced_by: "/guide/new-install/" }) as Node,
    "page-status-replacement",
  );
  assert.equal(link?.type, "a");
  assert.equal(link?.props.href, "/guide/new-install/");
  assert.equal(textOf(link), "Go to the replacement");
});

test("accepts an https replacement link", () => {
  assert.equal(replacementOf(" https://example.com/new "), "https://example.com/new");
});

test("a replacement link is only kept when it is a path on this site or an https link", () => {
  assert.equal(replacementOf("javascript:alert(1)"), undefined);
  assert.equal(replacementOf("//evil.example/path"), undefined);
  assert.equal(replacementOf("/\\evil.example"), undefined);
  assert.equal(replacementOf("http://example.com/"), undefined);
  assert.equal(replacementOf("new-page"), undefined);
  assert.equal(replacementOf("/a\"><script>"), undefined);
  assert.equal(replacementOf(undefined), undefined);
  const node = render({ status: "deprecated", replaced_by: "javascript:alert(1)" }) as Node;
  assert.deepEqual(withClass(node, "page-status-replacement"), []);
});

test("no replacement link for a status other than deprecated", () => {
  for (const status of ["experimental", "beta"] as const) {
    const node = render({ status, replaced_by: "/new/" }) as Node;
    assert.deepEqual(withClass(node, "page-status-replacement"), []);
  }
});

test("each status reads its accent color from a token that exists in names.json", () => {
  const expected: Record<string, string> = {
    experimental: "--color-info",
    beta: "--color-warning",
    deprecated: "--color-danger",
  };
  for (const [status, token] of Object.entries(expected)) {
    const rule = new RegExp(
      `\\.page-status-${status}\\s*\\{[^}]*border-inline-start-color:\\s*var\\(${token}\\)`,
    );
    assert.match(css, rule, `.page-status-${status} uses var(${token})`);
    assert.ok(tokenNames.has(token.slice(2)), `${token} is a token`);
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
  assert.doesNotMatch(css, /\b(left|right):/);
});
