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
  relationOf,
  sourcePositionOf,
  withBase,
  type LinkCardProps,
  type LinkCardRecord,
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

function render(props: LinkCardProps, base = "") {
  return linkCard({
    props,
    html: "",
    page: {} as ComponentProps["page"],
    site: { config: { base } } as ComponentProps["site"],
  } as ComponentProps<LinkCardProps>);
}

function output(props: LinkCardProps, base = ""): string {
  return html(render(props, base));
}

/** The anchor in a rendered card; a card is one link beside its inert record. */
function anchorOf(node: unknown): VNode {
  const anchor = (Array.isArray(node) ? node : [node]).find((child): child is VNode => isVNode(child) && child.type === "a");
  assert.ok(anchor, "expected the card to be a link");
  return anchor;
}

/** The inert JSON record a rendered card publishes. */
function recordOf(out: string): LinkCardRecord {
  const match = /<script type="application\/json" data-link-card(?:="")?>([\s\S]*?)<\/script>/.exec(out);
  assert.ok(match, "expected an inert JSON record");
  return JSON.parse(match[1] ?? "") as LinkCardRecord;
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
    description: "Put Mizzen in a project.",
    icon: "<svg><path d=\"M1 1\"></path></svg>",
  });

  const anchor = out.slice(0, out.indexOf("<script"));
  assert.equal(
    anchor,
    `<a class="${LINK_CARD_CLASS}" href="/guide/install/">` +
      `<span class="${ICON_CLASS}" aria-hidden="true"><svg><path d="M1 1"></path></svg></span>` +
      `<span class="${TITLE_CLASS}">Install</span>` +
      `<span class="${DESCRIPTION_CLASS}">Put Mizzen in a project.</span>` +
      `</a>`,
  );
  assert.equal((out.match(/<a\b/g) ?? []).length, 1);
  assert.equal((out.match(/<\/a>/g) ?? []).length, 1);
});

test("optional icon and description are omitted when not given", () => {
  const out = output({ href: "/", title: "Home" });
  const anchor = out.slice(0, out.indexOf("<script"));
  assert.equal(anchor, `<a class="${LINK_CARD_CLASS}" href="/"><span class="${TITLE_CLASS}">Home</span></a>`);
  assert.doesNotMatch(out, /aria-hidden/);
  assert.equal("description" in recordOf(out), false);
});

test("values are trimmed before they render", () => {
  const out = output({ href: "  /guide/  ", title: "  Guides  ", description: "  Read on.  ", icon: "  →  " });
  assert.match(out, /href="\/guide\/"/);
  assert.match(out, />Guides</);
  assert.match(out, />Read on\.</);
  assert.match(out, /aria-hidden="true">→<\/span>/);
  const record = recordOf(out);
  assert.equal(record.title, "Guides");
  assert.equal(record.description, "Read on.");
  assert.equal(record.href, "/guide/");
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
  const node = anchorOf(render({ href: "/guide/", title: "Guides" }));
  assert.equal(node.type, "a");
  assert.equal(node.props.href, "/guide/");
  assert.equal(node.props.tabindex, undefined);
});

test("a root-relative card resolves the site base exactly once", () => {
  assert.equal(withBase("", "/guide/"), "/guide/");
  assert.equal(withBase("/", "/guide/"), "/guide/");
  assert.equal(withBase("/lateen", "/guide/"), "/lateen/guide/");
  assert.equal(withBase("/lateen/", "/guide/"), "/lateen/guide/");
  assert.equal(withBase("/lateen", "/"), "/lateen/");

  assert.equal(withBase("/lateen", "/lateen/guide/"), "/lateen/guide/");
  assert.equal(withBase("/lateen", "/lateen"), "/lateen");
  assert.equal(withBase("/lateen", "/lateenish/guide/"), "/lateen/lateenish/guide/");

  const out = output({ href: "/lateen/guide/", title: "Guides" }, "/lateen");
  assert.match(out, /href="\/lateen\/guide\/"/);
  assert.equal(recordOf(out).href, "/lateen/guide/");
});

test("the card at a domain root and under a subpath point at the same page", () => {
  const atRoot = output({ href: "/guide/", title: "Guides" }, "");
  const underBase = output({ href: "/guide/", title: "Guides" }, "/lateen");

  assert.match(atRoot, /href="\/guide\/"/);
  assert.match(underBase, /href="\/lateen\/guide\/"/);
  assert.equal(recordOf(atRoot).href, "/guide/");
  assert.equal(recordOf(underBase).href, "/lateen/guide/");
});

test("external destinations stay unchanged and are marked external", () => {
  assert.equal(withBase("/lateen", "https://example.com/docs"), "https://example.com/docs");
  assert.equal(withBase("/lateen", "http://example.com/docs"), "http://example.com/docs");
  assert.equal(relationOf("https://example.com/docs"), "external");
  assert.equal(relationOf("http://example.com/docs"), "external");
  assert.equal(relationOf("/guide/"), "internal");

  const out = output({ href: "https://example.com/docs", title: "Docs" }, "/lateen");
  assert.match(out, /href="https:\/\/example\.com\/docs"/);
  assert.equal(recordOf(out).href, "https://example.com/docs");
  assert.equal(recordOf(out).relation, "external");
});

test("the JSON record matches the visible card and final href", () => {
  const out = output(
    {
      href: "/guide/install/",
      title: "Install",
      description: "Put Lateen in a project.",
      icon: "→",
      src: "docs/guide/install.md:4:1-4:80",
    },
    "/lateen",
  );

  assert.deepEqual(recordOf(out), {
    component: "link-card",
    version: 1,
    title: "Install",
    description: "Put Lateen in a project.",
    href: "/lateen/guide/install/",
    relation: "internal",
    src: "docs/guide/install.md:4:1-4:80",
  });
  assert.match(out, /href="\/lateen\/guide\/install\/"/);
  assert.match(out, />Install</);
  assert.match(out, />Put Lateen in a project\.</);
  assert.doesNotMatch(JSON.stringify(recordOf(out)), /"icon"/);
});

test("a card with only a title records no description", () => {
  const record = recordOf(output({ href: "/guide/", title: "Guides" }));
  assert.deepEqual(record, {
    component: "link-card",
    version: 1,
    title: "Guides",
    href: "/guide/",
    relation: "internal",
  });
});

test("source positions are validated, never invented", () => {
  assert.equal(sourcePositionOf("docs/guide/install.md:4:1-4:80"), "docs/guide/install.md:4:1-4:80");
  assert.equal(sourcePositionOf("  docs/guide/install.md:4:1  "), "docs/guide/install.md:4:1");
  assert.equal(sourcePositionOf("docs/guide/install.md:4"), "docs/guide/install.md:4");
  assert.equal(sourcePositionOf("C:/docs/guide.md:4:1"), "C:/docs/guide.md:4:1");

  for (const src of [undefined, "", "   ", 42, "docs/guide.md", ":4:1", "docs/guide.md:0:1", "docs/guide.md:4:2-4:1"]) {
    assert.equal(sourcePositionOf(src), undefined, String(src));
  }

  const withEvidence = output({ href: "/guide/", title: "Guides", src: "docs/guide.md:4:1" });
  assert.equal(recordOf(withEvidence).src, "docs/guide.md:4:1");

  const malformed = output({ href: "/guide/", title: "Guides", src: "docs/guide.md:4:2-4:1" });
  assert.equal("src" in recordOf(malformed), false);
  assert.match(malformed, /href="\/guide\/"/);
});

test("the record cannot close its script element or inject markup", () => {
  const out = output({
    href: "/x/",
    title: "</script><b>Bold</b>",
    description: "a & b </script><img src=x onerror=alert(1)>",
  });

  const script = /<script type="application\/json" data-link-card(?:="")?>([\s\S]*?)<\/script>/.exec(out)?.[1] ?? "";
  assert.doesNotMatch(script, /<\/script/i);
  assert.match(script, /\\u003c\/script>/);
  assert.equal(recordOf(out).title, "</script><b>Bold</b>");
  assert.equal(recordOf(out).description, "a & b </script><img src=x onerror=alert(1)>");
  assert.match(out, /&lt;\/script&gt;&lt;b&gt;Bold&lt;\/b&gt;/);
  assert.equal((out.match(/<a\b/g) ?? []).length, 1);
});

test("the card stays one link with an inert record and no client JavaScript", () => {
  const out = output({ href: "/guide/", title: "Guides" });
  assert.equal((out.match(/<a\b/g) ?? []).length, 1);
  assert.match(out, /<script type="application\/json" data-link-card(?:="")?>/);
  assert.doesNotMatch(out, /<script[^>]*\ssrc=/i);
  assert.doesNotMatch(out, /onclick=/i);
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
