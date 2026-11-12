import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps, Page } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import callout, { TITLE_CLASS, calloutKind, type CalloutProps } from "../components/callout/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/callout/style.css");
const namesPath = join(root, "tokens/names.json");

/** The parts of a preact VNode the assertions read. */
type Tree = { props: { children?: unknown; [key: string]: unknown } };
type Node = Tree | string | number | null | undefined | boolean;

function render(props: Partial<CalloutProps> & { html?: string }, lang = "en") {
  return callout(componentProps(props, pageOf(lang))) as unknown as Tree;
}

/** A page object the component can count ids against; one object per page, as the renderer does. */
function pageOf(lang = "en", html = ""): Page {
  return { lang, html } as unknown as Page;
}

function componentProps(
  props: Partial<CalloutProps> & { html?: string },
  page: Page,
): ComponentProps<CalloutProps> {
  const { html = "<p>Body</p>", ...rest } = props;
  return {
    props: rest,
    html,
    page,
    site: {} as ComponentProps["site"],
  } as ComponentProps<CalloutProps>;
}

/** The rendered markup, on the page given so repeated callouts can be counted together. */
function markup(
  props: Partial<CalloutProps> & { html?: string },
  page = pageOf(),
): string {
  return renderToString(callout(componentProps(props, page)) as never);
}

function escape(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The note's accessible name link: the title id it points at, and that title's rendered text. */
function nameOf(out: string): { titleId: string; title: string } {
  const named = /<div class="callout callout-[a-z]+" role="note" aria-labelledby="([^"]+)">/.exec(out);
  assert.ok(named, `expected a note named by aria-labelledby in ${out}`);
  const titleId = named[1]!;
  const title = new RegExp(`<p class="${TITLE_CLASS}" id="${escape(titleId)}">(.*?)</p>`).exec(out);
  assert.ok(title, `expected the title element ${titleId} in ${out}`);
  return { titleId, title: title[1]! };
}

/** Every id in the markup, in document order. */
function idsOf(out: string): string[] {
  return [...out.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
}

/** Every element in the tree, depth first, as preact VNodes. */
function elements(node: Node): Tree[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  const out: Tree[] = [node as Tree];
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list as Node[]) out.push(...elements(child));
  return out;
}

function textOf(node: Node): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node !== "object") return "";
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : [children];
  return (list as Node[]).map(textOf).join("");
}

test("default export is the callout component", () => {
  assert.equal(typeof callout, "function");
});

test("the root has role=note, an accessible name, and is not announced as an alert", () => {
  const tree = render({ type: "warning" });
  assert.equal(tree.props.role, "note");
  assert.equal(typeof tree.props["aria-labelledby"], "string");
  const title = elements(tree).find((node) => node.props.class === TITLE_CLASS);
  assert.equal(tree.props["aria-labelledby"], title?.props.id);
  const all = elements(tree);
  assert.equal(
    all.some((node) => node.props.role === "alert" || node.props["aria-live"] !== undefined),
    false,
  );
});

test("each kind gets its class and default title", () => {
  const expected: Record<string, string> = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
  };
  for (const [kind, title] of Object.entries(expected)) {
    const tree = render({ type: kind });
    assert.equal(tree.props.class, `callout callout-${kind}`);
    const heading = elements(tree).find((node) => node.props.class === "callout-title");
    assert.equal(textOf(heading), title);
  }
});

test("unknown, missing, and non-string types are notes", () => {
  assert.equal(calloutKind("info"), "note");
  assert.equal(calloutKind(undefined), "note");
  assert.equal(calloutKind(42), "note");
  assert.equal(calloutKind("constructor"), "note");
  assert.equal(render({ type: "info" }).props.class, "callout callout-note");
  assert.equal(render({}).props.class, "callout callout-note");
});

test("danger is read as caution, and type is case-insensitive", () => {
  assert.equal(calloutKind("danger"), "caution");
  assert.equal(calloutKind(" TIP "), "tip");
});

test("a custom title replaces the default; a blank one does not", () => {
  const titled = render({ type: "tip", title: "Read first" });
  const titleOf = (tree: Tree) =>
    textOf(elements(tree).find((node) => node.props.class === "callout-title"));
  assert.equal(titleOf(titled), "Read first");
  assert.equal(titleOf(render({ type: "tip", title: "   " })), "Tip");

  assert.equal(nameOf(markup({ type: "tip", title: " Read first " }, pageOf())).title, "Read first");
  assert.equal(nameOf(markup({ type: "tip", title: "   " }, pageOf())).title, "Tip");
});

test("the default title follows the page language, while an author's title stays as written", () => {
  const persian: Record<string, string> = {
    note: "یادداشت",
    tip: "نکته",
    important: "مهم",
    warning: "هشدار",
    caution: "احتیاط",
  };
  for (const [kind, title] of Object.entries(persian)) {
    const tree = render({ type: kind }, "fa");
    const heading = elements(tree).find((node) => node.props.class === "callout-title");
    assert.equal(textOf(heading), title, `fa ${kind}`);
  }

  const arabic = render({ type: "caution" }, "ar");
  assert.equal(textOf(elements(arabic).find((node) => node.props.class === "callout-title")), "تنبيه");
  assert.equal(textOf(elements(render({ type: "tip", title: "Read first" }, "fa")).find((node) => node.props.class === "callout-title")), "Read first");
});

test("every kind and the danger alias names its note after its visible title", () => {
  const expected: Record<string, string> = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
    danger: "Caution",
  };
  const shared = pageOf();
  const ids: string[] = [];
  for (const [type, title] of Object.entries(expected)) {
    const out = markup({ type }, shared);
    const name = nameOf(out);
    assert.equal(name.title, title, type);
    ids.push(...idsOf(out));
  }
  assert.equal(new Set(ids).size, ids.length, "no duplicate ids across the variants");
});

test("a named note in Persian or Arabic points at the localized title it shows", () => {
  const persian: Record<string, string> = {
    note: "یادداشت",
    tip: "نکته",
    important: "مهم",
    warning: "هشدار",
    caution: "احتیاط",
  };
  const shared = pageOf("fa");
  for (const [kind, title] of Object.entries(persian)) {
    assert.equal(nameOf(markup({ type: kind }, shared)).title, title, `fa ${kind}`);
  }
  assert.equal(nameOf(markup({ type: "caution" }, pageOf("ar"))).title, "تنبيه");

  const authored = nameOf(markup({ type: "tip", title: "خواندن اول" }, shared));
  assert.equal(authored.title, "خواندن اول");
  assert.equal(authored.titleId, "callout-tip-title-2");
});

test("a mixed-direction authored title stays intact and names only its own note", () => {
  const mixed = "Check גבהים 12 px قبل از build";
  const shared = pageOf("fa");
  const first = markup({ type: "warning", title: mixed }, shared);
  const second = markup({ type: "warning", title: "گام دوم" }, shared);

  assert.equal(nameOf(first).title, mixed);
  assert.equal(nameOf(second).title, "گام دوم");
  assert.notEqual(nameOf(first).titleId, nameOf(second).titleId);
});

test("an authored title is escaped, so it cannot inject markup or attributes", () => {
  const hostile = `<img src=x onerror="alert(1)"> & "quoted"`;
  const out = markup({ type: "note", title: hostile });
  const name = nameOf(out);

  assert.equal(name.title, "&lt;img src=x onerror=&quot;alert(1)&quot;> &amp; &quot;quoted&quot;");
  assert.doesNotMatch(out, /<img/);
  assert.doesNotMatch(out, /onerror="alert/);
});

test("repeated callouts of one kind get distinct title ids, each naming its own title", () => {
  const shared = pageOf();
  const first = nameOf(markup({ type: "note", title: "First" }, shared));
  const other = nameOf(markup({ type: "tip", title: "Other" }, shared));
  const second = nameOf(markup({ type: "note" }, shared));
  const third = nameOf(markup({ type: "note", title: "Third" }, shared));

  assert.equal(first.titleId, "callout-note-title");
  assert.equal(other.titleId, "callout-tip-title");
  assert.equal(second.titleId, "callout-note-title-2");
  assert.equal(third.titleId, "callout-note-title-3");
  assert.deepEqual(
    [first.title, second.title, third.title],
    ["First", "Note", "Third"],
  );
  const all = [first.titleId, other.titleId, second.titleId, third.titleId];
  assert.equal(new Set(all).size, all.length, "no duplicate title ids");
});

test("no callout becomes an alert, the icon stays hidden, and the body is unchanged", () => {
  const body = "<p>Keep <code>npm ci</code>.</p>";
  for (const type of ["note", "tip", "important", "warning", "caution", "danger"]) {
    const out = markup({ type, html: body });
    assert.equal(nameOf(out).titleId.length > 0, true, type);
    assert.doesNotMatch(out, /role="alert"|aria-live/, type);
    assert.match(out, /<svg class="callout-icon"[^>]*aria-hidden="true"/, type);
    assert.ok(out.includes(`<div class="callout-body">${body}</div>`), type);
  }
});

test("the rendered body is passed through as HTML", () => {
  const tree = render({ type: "note", html: "<p>Remember <code>npm ci</code>.</p>" });
  const body = elements(tree).find((node) => node.props.class === "callout-body");
  assert.deepEqual(body?.props.dangerouslySetInnerHTML, {
    __html: "<p>Remember <code>npm ci</code>.</p>",
  });
});

test("the icon is decorative", () => {
  const icon = elements(render({ type: "caution" })).find((node) => node.props.class === "callout-icon");
  assert.equal(icon?.props["aria-hidden"], "true");
});

test("style.css uses only token custom properties from names.json", () => {
  const names = JSON.parse(readFileSync(namesPath, "utf8")) as Record<string, Record<string, unknown>>;
  const allowed = new Set<string>();
  for (const [group, entries] of Object.entries(names)) {
    for (const key of Object.keys(entries)) allowed.add(`--${group}-${key}`);
  }

  const css = readFileSync(stylePath, "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !allowed.has(name));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties, so it reads correctly under dir=rtl", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.doesNotMatch(css, /\b(?:margin|padding|border)-(?:left|right)\b/);
  assert.doesNotMatch(css, /\b(?:left|right)\s*:/);
  assert.match(css, /border-inline-start-color/);
});
