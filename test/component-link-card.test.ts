import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "@velella/mizzen/contracts";
import linkCard, {
  DESCRIPTION_CLASS,
  ICON_CLASS,
  LINK_CARD_CLASS,
  LINK_CARD_GRID_CLASS,
  TITLE_CLASS,
  directive,
  hrefOf,
  type LinkCardProps,
} from "../components/link-card/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/link-card/style.css");

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === true || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";

  const { children, dangerouslySetInnerHTML, ...attrs } = node.props;
  const attrText = Object.entries(attrs)
    .filter(([, value]) => value != null && value !== false)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`))
    .join("");
  const inner =
    typeof dangerouslySetInnerHTML === "object" && dangerouslySetInnerHTML !== null
      ? String((dangerouslySetInnerHTML as { __html?: unknown }).__html ?? "")
      : html(children);
  return typeof node.type === "string" ? `<${node.type}${attrText}>${inner}</${node.type}>` : inner;
}

function render(props: LinkCardProps) {
  return linkCard({ props, html: "", page: {} as ComponentProps["page"], site: {} as ComponentProps["site"] } as ComponentProps<LinkCardProps>);
}

function output(props: LinkCardProps): string {
  return html(render(props));
}

const css = readFileSync(stylePath, "utf8");

const names = JSON.parse(readFileSync(join(root, "tokens/names.json"), "utf8")) as Record<string, Record<string, unknown>>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("default export is the link card, bound to the link-card directive", () => {
  assert.equal(typeof linkCard, "function");
  assert.equal(directive, "link-card");
});

test("the whole card is one link with its title, description, and icon", () => {
  const out = output({
    href: "/guide/install/",
    title: "Install",
    description: "Put Slipway in a project.",
    icon: "<svg><path d=\"M1 1\"></path></svg>",
  });

  assert.equal(
    out,
    `<a class="${LINK_CARD_CLASS}" href="/guide/install/">` +
      `<span class="${ICON_CLASS}" aria-hidden="true"><svg><path d="M1 1"></path></svg></span>` +
      `<span class="${TITLE_CLASS}">Install</span>` +
      `<span class="${DESCRIPTION_CLASS}">Put Slipway in a project.</span>` +
      `</a>`,
  );
  assert.equal((out.match(/<a\b/g) ?? []).length, 1);
  assert.equal((out.match(/<\/a>/g) ?? []).length, 1);
});

test("optional icon and description are omitted when not given", () => {
  assert.equal(output({ href: "/", title: "Home" }), `<a class="${LINK_CARD_CLASS}" href="/"><span class="${TITLE_CLASS}">Home</span></a>`);
  assert.doesNotMatch(output({ href: "/", title: "Home" }), /aria-hidden/);
});

test("values are trimmed before they render", () => {
  const out = output({ href: "  /guide/  ", title: "  Guides  ", description: "  Read on.  ", icon: "  →  " });
  assert.match(out, /href="\/guide\/"/);
  assert.match(out, />Guides</);
  assert.match(out, />Read on\.</);
  assert.match(out, /aria-hidden="true">→<\/span>/);
});

test("a missing, blank, or unsafe href renders nothing", () => {
  const unsafe = [
    undefined,
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:docs@example.com",
    "//evil.example/path",
    "/\\evil.example/path",
    "relative/path",
    "https://example.com/a b",
    'https://example.com/"onmouseover="alert(1)',
  ];
  for (const href of unsafe) {
    assert.equal(render({ href, title: "Guide" } as LinkCardProps), null, String(href));
  }
});

test("a missing, blank, or non-string title renders nothing", () => {
  for (const title of [undefined, "", "   "]) {
    assert.equal(render({ href: "/guide/", title } as LinkCardProps), null, String(title));
  }
  assert.equal(render({ href: "/guide/", title: 42 as unknown as string }), null);
});

test("hrefOf accepts root-relative and http(s) addresses and refuses the rest", () => {
  assert.equal(hrefOf("/guide/install/"), "/guide/install/");
  assert.equal(hrefOf("  https://example.com/docs  "), "https://example.com/docs");
  assert.equal(hrefOf("http://example.com/docs"), "http://example.com/docs");
  assert.equal(hrefOf("javascript:alert(1)"), undefined);
  assert.equal(hrefOf("//evil.example/"), undefined);
  assert.equal(hrefOf("/\\evil.example/"), undefined);
  assert.equal(hrefOf("/a b"), undefined);
});

test("title and description are escaped, never parsed as markup", () => {
  const out = output({ href: "/x/", title: "<b>Bold</b>", description: "a & b <i>italic</i>" });
  assert.match(out, /&lt;b&gt;Bold&lt;\/b&gt;/);
  assert.match(out, /a &amp; b &lt;i&gt;italic&lt;\/i&gt;/);
  assert.doesNotMatch(out, /<b>|<i>/);
});

test("the link is focusable as written, with no negative tabindex", () => {
  const node = render({ href: "/guide/", title: "Guides" });
  assert.ok(isVNode(node));
  assert.equal(node.type, "a");
  assert.equal(node.props.href, "/guide/");
  assert.equal(node.props.tabindex, undefined);
});

test("style.css shows a focus ring on the whole link", () => {
  assert.match(css, /\.link-card:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
});

test("style.css lays several cards out in a responsive grid", () => {
  assert.match(css, new RegExp(`\\.${LINK_CARD_GRID_CLASS}\\s*\\{[^}]*display:\\s*grid`, "s"));
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*16rem\),\s*1fr\)\)/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});
