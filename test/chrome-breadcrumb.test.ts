import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, NavLink, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import breadcrumb from "../chrome/breadcrumb/index.ts";

const pos: SourcePos = { file: "docs/guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

const config: SiteConfig = {
  title: "Example",
  base: "/example",
  lang: "en",
  dir: "ltr",
  languages: [],
  source: ".",
  include: [],
  exclude: [],
  navigation: "_data/navigation.yml",
  defaults: [],
  theme: { options: {} },
  search: { text: 300 },
  redirects: {},
  outputs: {},
};

const page: Page = {
  url: "/example/guide/install/",
  source: pos,
  frontMatter: { title: "Install" },
  title: "Install",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const pager: Pager = {};

const install: NavLink = { title: "Install", url: "/example/guide/install/" };
const guides: NavLink = { title: "Guides", url: "/example/guide/" };
const gettingStarted: NavLink = { title: "Getting started", url: "/example/guide/getting-started/" };
const fullTrail: Trail = [guides, gettingStarted, install];

function props(trail: Trail, lang = "en"): ChromeProps {
  const localized: Page = { ...page, lang, dir: lang === "en" ? "ltr" : "rtl" };
  const site: Site = { config, pages: [localized], nav: {}, data: {} };
  return { site, page: localized, trail, pager };
}

/** The rendered markup for a trail; an empty or single-crumb trail renders nothing at all. */
function render(trail: Trail, lang = "en"): string {
  return renderToString(breadcrumb(props(trail, lang)) as never);
}

/** Count the non-overlapping matches of `pattern` in `text`. */
function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("renders nothing when the page has no trail", () => {
  assert.equal(breadcrumb(props([])), null);
});

test("renders nothing when the trail has only the current page", () => {
  assert.equal(breadcrumb(props([install])), null);
});

test("the trail is one ordered list with exactly one item per crumb", () => {
  const out = render(fullTrail);
  assert.match(out, /^<nav class="breadcrumb" aria-label="Breadcrumbs"><ol class="breadcrumb-list">/);
  assert.equal(count(out, /<ol class="breadcrumb-list">/g), 1);
  assert.equal(count(out, /<li class="breadcrumb-item">/g), fullTrail.length);
  assert.ok(out.endsWith("</li></ol></nav>"), out);

  // Source order is the reading order: Guides, then Getting started, then Install.
  assert.ok(out.indexOf("Guides") < out.indexOf("Getting started"));
  assert.ok(out.indexOf("Getting started") < out.indexOf("Install"));
});

test("ancestors are ordinary links with unchanged URLs; the current page is not a link", () => {
  const out = render(fullTrail);
  assert.match(out, /<a href="\/example\/guide\/"><bdi class="breadcrumb-title">Guides<\/bdi><\/a>/);
  assert.match(
    out,
    /<a href="\/example\/guide\/getting-started\/"><bdi class="breadcrumb-title">Getting started<\/bdi><\/a>/,
  );
  assert.match(out, /<span aria-current="page"><bdi class="breadcrumb-title">Install<\/bdi><\/span>/);

  // The current page's URL never becomes a link, and every ancestor keeps its own real href.
  assert.doesNotMatch(out, /href="\/example\/guide\/install\/"/);
  assert.equal(count(out, /<a href="/g), fullTrail.length - 1);
});

test("the accessible name follows the page language", () => {
  const trail: Trail = [guides, install];
  assert.match(render(trail, "en"), /^<nav class="breadcrumb" aria-label="Breadcrumbs">/);
  assert.match(render(trail, "fa"), /^<nav class="breadcrumb" aria-label="مسیر یابی">/);
  assert.match(render(trail, "ar"), /^<nav class="breadcrumb" aria-label="مسار التنقل">/);
});

test("separators sit between the crumbs and stay out of the accessibility tree", () => {
  const out = render(fullTrail);
  assert.equal(count(out, /<svg class="breadcrumb-sep" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/g), 2);

  // Every chevron is hidden and unfocusable, so assistive technology counts crumbs but reads no arrows.
  assert.equal(count(out, /aria-hidden="true"/g), 2);
  assert.equal(count(out, /focusable="false"/g), 2);
  assert.equal(count(out, /<svg(?![^>]*aria-hidden="true")/g), 0);

  // Each separator lives inside a list item, never as a stray child of the list, and only after the first crumb.
  assert.equal(count(out, /<ol class="breadcrumb-list"><svg/g), 0);
  assert.equal(count(out, /<li class="breadcrumb-item"><svg/g), fullTrail.length - 1);
  assert.ok(out.indexOf("breadcrumb-sep") > out.indexOf("Guides"));
  assert.ok(out.indexOf("breadcrumb-sep") < out.indexOf("Install"));
});

test("mixed-direction titles are isolated one per crumb and never reorder the trail", () => {
  const mixed: Trail = [
    { title: "راهنما", url: "/example/fa/" },
    { title: "الأدلة", url: "/example/ar/" },
    { title: "Guides", url: "/example/en/" },
    { title: "v1.2.3", url: "/example/neutral/" },
    install,
  ];
  const out = render(mixed, "fa");

  // One isolating <bdi> per authored title, including a neutral-only run like a version string.
  assert.equal(count(out, /<bdi class="breadcrumb-title">/g), mixed.length);
  for (const crumb of mixed) {
    assert.ok(out.includes(`<bdi class="breadcrumb-title">${crumb.title}</bdi>`), crumb.title);
  }

  // The list keeps the authored order despite the mixed directions.
  assert.ok(out.indexOf("راهنما") < out.indexOf("الأدلة"));
  assert.ok(out.indexOf("الأدلة") < out.indexOf("Guides"));
  assert.ok(out.indexOf("Guides") < out.indexOf("v1.2.3"));
  assert.ok(out.indexOf("v1.2.3") < out.indexOf("Install"));
});

test("titles are escaped and URLs are left unchanged", () => {
  const tricky: Trail = [
    { title: 'A & "B" <i>', url: "/example/a&b/" },
    install,
  ];
  const out = render(tricky);

  // Markup, quotes and symbols in an authored title become escaped text, never a live element.
  assert.ok(out.includes('<bdi class="breadcrumb-title">A &amp; &quot;B&quot; &lt;i></bdi>'), out);
  assert.doesNotMatch(out, /<i>/);

  // The href carries the URL through verbatim; only the serializer's `&` becomes `&amp;`.
  assert.ok(out.includes('<a href="/example/a&amp;b/">'), out);
});

test("separators mirror under dir=rtl and titles are isolated in style.css", () => {
  const css = readFileSync(new URL("../chrome/breadcrumb/style.css", import.meta.url), "utf8");
  assert.match(css, /\[dir="rtl"\] \.breadcrumb-sep \{\n {2}transform: scaleX\(-1\);\n\}/);
  assert.match(css, /\.breadcrumb-title\s*\{\n {2}unicode-bidi:\s*isolate;\n\}/);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/breadcrumb/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
