import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { Heading, LayoutProps, Page, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import tutorial, { slugOf, stepsOf } from "../layouts/tutorial.ts";

const pos: SourcePos = { file: "guide/tutorial.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "",
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
    ...overrides,
  };
}

function heading(depth: 1 | 2 | 3, text: string, id = text.toLowerCase()): Heading {
  return { depth, text, id, pos };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/tutorial/",
    source: pos,
    frontMatter: {},
    title: "Build a widget",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "<p>Run the build.</p>",
    markdown: "Run the build.",
    kind: "doc",
    ...overrides,
  };
}

function layoutProps(page: Page, nav: Site["nav"]["main"] = []): LayoutProps {
  const site: Site = { config: configWith(), pages: [page], nav: { main: nav }, data: {} };
  return {
    site,
    page,
    trail: [],
    pager: { prev: { title: "Overview", url: "/guide/" }, next: { title: "Configure", url: "/guide/configure/" } },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands: [],
  };
}

const out = (page: Page, nav: Site["nav"]["main"] = []): string =>
  renderToString(tutorial(layoutProps(page, nav)) as never);

const THREE_STEPS_HTML = [
  "<p>Before you start.</p>",
  '<h2 id="pick-a-mode">Pick a mode</h2><p>Choose one.</p>',
  '<h2 id="install">Install</h2><p>Run it.</p>',
  '<h2 id="finish">Finish</h2><p>Done.</p>',
].join("");

function threeSteps(): Page {
  return pageWith({
    headings: [heading(2, "Pick a mode", "pick-a-mode"), heading(2, "Install"), heading(2, "Finish")],
    html: THREE_STEPS_HTML,
  });
}

test("depth-2 headings become a numbered progress list of anchors", () => {
  const page = out(threeSteps());

  assert.match(page, /<article class="doc tutorial" data-pagefind-body="true">/);
  assert.match(page, /<nav class="tutorial-progress" aria-label="Tutorial steps">/);
  assert.match(page, /<ol class="tutorial-step-list">/);
  assert.match(page, /<a class="tutorial-step-link" href="#pick-a-mode"><span class="tutorial-step-count">Step 1 of 3<\/span><span class="tutorial-step-title">Pick a mode<\/span><\/a>/);
  assert.match(page, /href="#install"><span class="tutorial-step-count">Step 2 of 3<\/span>/);
  assert.match(page, /href="#finish"><span class="tutorial-step-count">Step 3 of 3<\/span>/);
});

test("front matter steps win over headings, and an id-less step gets a slug anchor", () => {
  const page = out(
    pageWith({
      frontMatter: {
        steps: [
          { title: "Set up", id: "setup" },
          { title: "Deploy!" },
        ],
      },
      headings: [heading(2, "Ignored", "ignored")],
      html: '<p>Intro.</p><h2 id="setup">Set up</h2><p>A</p><h2 id="deploy">Deploy</h2><p>B</p>',
    }),
  );

  assert.match(page, /href="#setup"><span class="tutorial-step-count">Step 1 of 2<\/span><span class="tutorial-step-title">Set up<\/span>/);
  assert.match(page, /href="#deploy"><span class="tutorial-step-count">Step 2 of 2<\/span><span class="tutorial-step-title">Deploy!<\/span>/);
  assert.doesNotMatch(page, /Ignored/);
  assert.doesNotMatch(page, /href="#ignored"/);
});

test("each step carries the step number and the total as text", () => {
  const page = out(threeSteps());

  assert.equal(page.match(/Step 1 of 3/g)?.length, 2, "progress list and first step");
  assert.equal(page.match(/Step 2 of 3/g)?.length, 2, "progress list and second step");
  assert.equal(page.match(/Step 3 of 3/g)?.length, 2, "progress list and last step");
  assert.match(page, /<p class="tutorial-step-progress">Step 2 of 3<\/p>/);
});

test("previous and next step links point at the adjacent heading ids", () => {
  const page = out(threeSteps());

  assert.match(
    page,
    /<section class="tutorial-step" data-step="2"><p class="tutorial-step-progress">Step 2 of 3<\/p><div class="tutorial-step-body"><h2 id="install">Install<\/h2>/,
  );
  assert.match(
    page,
    /<a class="tutorial-step-link tutorial-step-prev" href="#pick-a-mode" rel="prev"><span class="tutorial-step-nav-label">Previous step<\/span><span class="tutorial-step-nav-title">Pick a mode<\/span><\/a>/,
  );
  assert.match(
    page,
    /<a class="tutorial-step-link tutorial-step-next" href="#finish" rel="next"><span class="tutorial-step-nav-label">Next step<\/span><span class="tutorial-step-nav-title">Finish<\/span><\/a>/,
  );

  const first = /<section class="tutorial-step" data-step="1">([\s\S]*?)<\/section>/.exec(page);
  assert.ok(first, "first step section present");
  assert.doesNotMatch(first[1] ?? "", /rel="prev"/);
  assert.match(first[1] ?? "", /rel="next"/);

  const last = /<section class="tutorial-step" data-step="3">([\s\S]*?)<\/section>/.exec(page);
  assert.ok(last, "last step section present");
  assert.doesNotMatch(last[1] ?? "", /rel="next"/);
  assert.match(last[1] ?? "", /rel="prev"/);
});

test("a single step shows Step 1 of 1 and no previous/next step links", () => {
  const page = out(pageWith({ headings: [heading(2, "Only step", "only-step")], html: '<h2 id="only-step">Only step</h2><p>Do it.</p>' }));

  assert.match(page, /<span class="tutorial-step-count">Step 1 of 1<\/span>/);
  assert.match(page, /<p class="tutorial-step-progress">Step 1 of 1<\/p>/);
  assert.doesNotMatch(page, /class="tutorial-step-nav"/);
  assert.doesNotMatch(page, /class="tutorial-step-prev"/);
  assert.doesNotMatch(page, /class="tutorial-step-next"/);
});

test("a page with no steps renders its body whole and no progress list", () => {
  const page = out(pageWith());

  assert.doesNotMatch(page, /class="tutorial-progress"/);
  assert.doesNotMatch(page, /tutorial-step/);
  assert.match(page, /<div class="doc-body"><p>Run the build.<\/p><\/div>/);
  assert.match(page, /<nav class="pager" aria-label="Previous and next pages">/);
});

test("the page pager still follows the last step", () => {
  const page = out(threeSteps());

  assert.match(page, /data-step="3"[\s\S]*<\/section><\/div><div class="page-footer">/);
  assert.match(page, /<nav class="pager" aria-label="Previous and next pages"><a class="pager-link pager-prev" href="\/guide\/" rel="prev">/);
});

test("the progress text is localised and the page keeps its direction", () => {
  const page = out(
    pageWith({
      lang: "fa",
      dir: "rtl",
      headings: [heading(2, "نصب", "install"), heading(2, "پایان", "finish")],
      html: '<h2 id="install">نصب</h2><p>الف</p><h2 id="finish">پایان</h2><p>ب</p>',
    }),
  );

  assert.match(page, /^<html lang="fa" dir="rtl"/);
  assert.match(page, /<span class="tutorial-step-count">گام 1 از 2<\/span>/);
  assert.match(page, /aria-label="گام‌های آموزش"/);
  assert.match(page, /<span class="tutorial-step-nav-label">گام بعدی<\/span>/);
});

test("step titles are escaped, never parsed as markup", () => {
  const page = out(
    pageWith({
      frontMatter: { steps: [{ title: "<em>Set up</em>", id: 'a"b' }] },
    }),
  );

  assert.match(page, /&lt;em>Set up&lt;\/em>/);
  assert.doesNotMatch(page, /<em>Set up<\/em>/);
  assert.match(page, /href="#a&quot;b"/);
});

test("stepsOf and slugOf read only usable values", () => {
  assert.equal(slugOf("  Set Up! "), "set-up");
  assert.equal(slugOf("نصب"), "نصب");
  assert.deepEqual(stepsOf(pageWith({ frontMatter: { steps: [{ title: "" }, { title: "One" }, { title: "Two", id: "one" }, { title: "One" }] } })), [{ title: "One", id: "one" }]);
});

const css = readFileSync(new URL("../layouts/tutorial.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `--${group}-${name}`)),
);

test("style.css styles the progress list and the step links with token names only", () => {
  for (const selector of [".tutorial-progress", ".tutorial-step-list", ".tutorial-step-count", ".tutorial-step-nav", ".tutorial-step-prev", ".tutorial-step-next"]) {
    assert.ok(css.includes(selector), `tutorial.css should style ${selector}`);
  }

  const used = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(tokenNames.has(name), `unknown token ${name}`);
});

test("style.css uses logical properties only", () => {
  const physical =
    /\b(margin|padding|border|inset|scroll-margin|scroll-padding)-(left|right|top|bottom)\b|\bborder-(top|bottom)-(left|right)-radius\b|\b(text-align|float|clear)\s*:\s*(left|right)\b|(^|[;{\s])(left|right|top|bottom)\s*:/;
  assert.doesNotMatch(css, physical);
  assert.match(css, /text-align: end/);
});
