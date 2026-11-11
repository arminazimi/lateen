import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import cards, { card, CARD_CLASS, GRID_CLASS, hrefOf } from "../components/cards/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/cards/style.css");
const namesPath = join(root, "tokens/names.json");

type VNode = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function isVNode(node: unknown): node is VNode {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal Preact vnode → HTML string for assertions (no render-to-string dependency). */
function html(node: unknown): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return escape(String(node));
  if (Array.isArray(node)) return node.map(html).join("");
  if (!isVNode(node)) return "";

  const { children, ...attrs } = node.props;
  const attrText = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escape(String(value))}"`)
    .join("");
  const inner = html(children);
  return typeof node.type === "string" ? `<${node.type}${attrText}>${inner}</${node.type}>` : inner;
}

test("default export is the grid component", () => {
  assert.equal(typeof cards, "function");
  const out = html(cards({ children: [card({ href: "/a/", title: "A" })] }));
  assert.match(out, new RegExp(`^<div class="${GRID_CLASS}">`));
});

test("card is one link with its title, description, and icon", () => {
  const out = html(
    card({
      href: "/guide/install/",
      title: "Install",
      description: "Put Mizzen in a project.",
      icon: "i",
    }),
  );

  assert.equal(
    out,
    `<a class="${CARD_CLASS}" href="/guide/install/">` +
      `<span class="card-icon" aria-hidden="true">i</span>` +
      `<span class="card-title">Install</span>` +
      `<span class="card-description">Put Mizzen in a project.</span>` +
      `</a>`,
  );
});

test("optional icon and description are omitted when not given", () => {
  const out = html(card({ href: "/", title: "Home" }));
  assert.equal(out, `<a class="${CARD_CLASS}" href="/"><span class="card-title">Home</span></a>`);
});

test("a grid of cards has no nested links: one anchor per card", () => {
  const out = html(
    cards({
      children: [
        card({ href: "/one/", title: "One", description: "First" }),
        card({ href: "/two/", title: "Two", description: "Second" }),
        card({ href: "/three/", title: "Three", icon: "3" }),
      ],
    }),
  );

  const opens = out.match(/<a\b/g) ?? [];
  const closes = out.match(/<\/a>/g) ?? [];
  assert.equal(opens.length, 3);
  assert.equal(closes.length, 3);
  assert.doesNotMatch(out, /<a\b[^>]*>(?:(?!<\/a>).)*<a\b/s);
});

test("title and description are escaped, never parsed as markup", () => {
  const out = html(card({ href: "/x/", title: "<b>Bold</b>", description: "a & b" }));
  assert.match(out, /&lt;b&gt;Bold&lt;\/b&gt;/);
  assert.match(out, /a &amp; b/);
});

test("unsafe, protocol-relative, malformed, and blank hrefs never become anchors", () => {
  const bad = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//evil.example/phish",
    "/\\evil.example",
    "",
    "   ",
    "/ok path with space",
  ];
  for (const href of bad) {
    const out = html(card({ href, title: "Click", description: "Body." }));
    assert.doesNotMatch(out, /<a\b/, `href ${JSON.stringify(href)} must not render an anchor`);
    assert.match(out, new RegExp(`^<div class="${CARD_CLASS}">`));
    assert.match(out, /<span class="card-title">Click<\/span>/);
    assert.match(out, /<span class="card-description">Body\.<\/span>/);
  }
});

test("valid internal and web links keep their destination, trimmed", () => {
  assert.equal(hrefOf("/guide/install/"), "/guide/install/");
  assert.equal(hrefOf("  https://example.com/a  "), "https://example.com/a");
  assert.equal(hrefOf("http://example.com"), "http://example.com");
  assert.equal(hrefOf("javascript:alert(1)"), undefined);
  assert.equal(hrefOf("//evil.example"), undefined);
  assert.equal(hrefOf(undefined), undefined);

  const out = html(card({ href: " https://example.com/x ", title: "Ext" }));
  assert.match(out, /^<a class="card" href="https:\/\/example.com\/x">/);
});

test("blank or whitespace-only titles never produce an unnamed control", () => {
  for (const title of ["", "   ", "\n\t"]) {
    const out = html(card({ href: "/ok/", title, description: "Still readable." }));
    assert.doesNotMatch(out, /<a\b/);
    assert.match(out, /^<div class="card">/);
    assert.match(out, /<span class="card-description">Still readable\.<\/span>/);
  }
});

test("a valid card keeps exactly one link and no nested interactive content", () => {
  const out = html(card({ href: "/ok/", title: "Safe", description: "Desc", icon: "svg-icon" }));
  assert.equal((out.match(/<a\b/g) ?? []).length, 1);
  assert.doesNotMatch(out, /<(?:button|input|select|textarea)\b/);
  assert.match(out, /aria-hidden="true"/);
  // Only href/title/description/icon are read: extra children-like props are never rendered.
  const extra = card({ href: "/ok/", title: "Safe", children: "nested" } as Parameters<typeof card>[0]);
  assert.doesNotMatch(html(extra), /nested/);
});

test("malformed cards render as static text without JavaScript", () => {
  const out = html(card({ href: "javascript:void(0)", title: "Docs", description: "Read this." }));
  assert.doesNotMatch(out, /<a\b|href=|onclick=|tabindex=/);
  assert.match(out, /Docs/);
  assert.match(out, /Read this\./);
});

test("unicode titles are kept and escaped as text, never markup", () => {
  const out = html(card({ href: "/café/", title: "Досье ☕ <em>é</em>", description: "日本語 & ©" }));
  assert.match(out, /Досье ☕ &lt;em&gt;é&lt;\/em&gt;/);
  assert.match(out, /日本語 &amp; ©/);
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

test("style.css lays cards out in a responsive grid", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.cards\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/);
});

test("style.css shows a focus ring on the whole card and uses logical properties only", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.card:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.doesNotMatch(css, /\b(margin|padding|border|inset)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});
