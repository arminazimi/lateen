import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { all, attrs, build, textOf, type BuiltSite } from "./integration-helpers.ts";

let site: BuiltSite;
let document: Document;

before(() => {
  site = build("integration");
  document = site.document("/guide/install/");
});

after(() => rmSync(site.out, { recursive: true, force: true }));

test("the whole page reads before its islands run: prose, tabs, disclosures, output, and form defaults", () => {
  const article = document.querySelector("article.doc");
  assert.ok(article);
  const text = textOf(article);
  for (const expected of [
    "Install",
    "This guide installs the widget",
    "The body of a disclosure that starts closed",
    "Finished {{project}} in 340 ms",
    "Install the widget",
    "Read the output",
    "Returns one widget",
  ]) {
    assert.ok(text.includes(expected), `the server-rendered article contains ${JSON.stringify(expected)}`);
  }

  // Every panel is in the document and visible without the island's tab machinery.
  assert.equal(all(document, ".tabs > [role='tabpanel']").length, 2);
  assert.equal(all(document, ".code-tabs-panel").length, 2);
  assert.equal(all(document, ".tabs > [role='tabpanel']:not([hidden])").length, 2);
  assert.equal(all(document, ".code-tabs-panel:not([hidden])").length, 2);
  // The tab lists are the only part the island adds; they start hidden.
  for (const list of all(document, ".tabs > [role='tablist'], .code-tabs-list")) {
    assert.equal(list.hasAttribute("hidden"), true);
  }

  const inputs = all(document, ".variables-form-input");
  assert.deepEqual(
    inputs.map((input) => [input.getAttribute("data-var"), (input as HTMLInputElement).value]),
    [
      ["api_key", "YOUR_KEY"],
      ["host", "https://api.example.com"],
    ],
  );
  for (const input of inputs) {
    const id = input.getAttribute("id");
    assert.ok(id);
    assert.equal(document.querySelector(`label[for="${id}"]`)?.textContent, input.getAttribute("data-var"));
  }
});

test("no control that needs an island is visible before hydration", () => {
  const ids = [
    "[data-search-open]",
    "[data-video-play]",
    "[data-embed-load]",
    "[data-copy-markdown-button]",
    "[data-output-copy]",
    "[data-variables-reset]",
    "[data-terminal-copy]",
  ];
  for (const selector of ids) {
    const control = document.querySelector(selector);
    assert.ok(control, `${selector} is in the page`);
    assert.equal(control.hasAttribute("hidden"), true, `${selector} starts hidden`);
  }

  // The block action is inert until the island clones it out of the template.
  const template = document.querySelector("template[data-block-actions]") as HTMLTemplateElement | null;
  assert.ok(template);
  assert.equal(template.content.querySelector("[data-block-action]")?.hasAttribute("hidden"), true);
});

test("slow media stays local and makes no provider request until the reader asks", () => {
  assert.equal(all(document, "iframe").length, 0, "no iframe is inserted before a click");
  const imgs = all(document, "img").map((img) => img.getAttribute("src") ?? "");
  assert.deepEqual(imgs, ["/poster.svg"], "the only image is the local poster");
  assert.ok(!imgs.some((src) => /youtube|ytimg|vimeo/i.test(src)));

  const video = document.querySelector("[data-video]");
  assert.ok(video);
  assert.match(video.getAttribute("data-embed") ?? "", /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  assert.match(document.querySelector(".video-link")?.getAttribute("href") ?? "", /^https:\/\/www\.youtube\.com\/watch/);
  assert.equal(document.querySelector(".video-play")?.getAttribute("aria-label"), "Play video: Widget walkthrough");

  const embed = document.querySelector("[data-embed-state]");
  assert.equal(embed?.getAttribute("data-embed-state"), "idle");
  assert.match(document.querySelector(".embed-link")?.getAttribute("href") ?? "", /^https:\/\/www\.youtube\.com\/watch/);
});

test("the diagram is a server-rendered image with its source, not a client render", () => {
  const diagram = document.querySelector("figure.mermaid svg[role='img']");
  assert.ok(diagram);
  assert.equal(diagram.querySelector("title")?.textContent, "The page asks the widget service and receives a response");
  assert.equal(diagram.getAttribute("aria-label"), "The page asks the widget service and receives a response");
  assert.ok(diagram.querySelector("path, g"), "the diagram has drawn content");

  const source = document.querySelector("figure.mermaid script[data-mermaid-record]");
  assert.ok(source, "the source stays on the page for a reader or agent");
  const payload = JSON.parse(source.textContent ?? "{}") as { source?: string; alt?: { text?: string } };
  assert.match(payload.source ?? "", /flowchart LR/);
  assert.equal(payload.alt?.text, "The page asks the widget service and receives a response");
  assert.equal(document.querySelector("script[src*='mermaid']"), null, "the browser never loads Mermaid");
});

test("the Mermaid build cache reuses a render across builds and leaves the output the same", () => {
  const cache = mkdtempSync(join(tmpdir(), "lateen-mermaid-cache-"));
  const first = build("integration", { ...process.env, LATEEN_MERMAID_CACHE_DIR: cache });
  const second = build("integration", { ...process.env, LATEEN_MERMAID_CACHE_DIR: cache });
  try {
    const firstHtml = first.html("/guide/install/");
    const secondHtml = second.html("/guide/install/");
    assert.equal(secondHtml, firstHtml, "a cache hit writes the same page, including the SVG id");
    const files = readdirSync(cache, { recursive: true }).map(String);
    assert.ok(files.some((file) => file.endsWith(".json")), "the cache records an entry");
  } finally {
    rmSync(first.out, { recursive: true, force: true });
    rmSync(second.out, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("a failed hydration cannot remove the main content, and the stylesheets keep the no-script layout", () => {
  // jsdom without `runScripts` is the failed-hydration state: the document is parsed, no island runs.
  const text = textOf(document.querySelector("article.doc"));
  assert.ok(text.length > 2_000);
  assert.ok(text.includes("npm install @example/widget"));

  const html = site.html("/guide/install/");
  const firstScript = html.indexOf("<script type=\"module\"");
  assert.ok(firstScript > 0);
  assert.ok(html.indexOf("This guide installs the widget") < firstScript, "content precedes the island scripts");

  const cssHrefs = all(document, "link[rel='stylesheet']").map((link) => link.getAttribute("href") ?? "");
  assert.ok(cssHrefs.length > 0);
  const css = cssHrefs.map((href) => site.file(href.replace(/^\//, ""))).join("\n");
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none/, "hidden panels and controls stay hidden before an island");
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*9/, "media frames keep their ratio while the player is absent");
});

test("the static Markdown twin carries the same content as the page", () => {
  const markdown = site.file("guide/install/index.md");
  for (const expected of ["This guide installs the widget", "npm install @example/widget", "Finished {{project}} in 340 ms"]) {
    assert.ok(markdown.includes(expected), `the Markdown twin carries ${JSON.stringify(expected)}`);
  }
  assert.equal(document.querySelector(".copy-markdown-link")?.getAttribute("href"), "/guide/install/index.md");
  assert.equal(document.querySelector("[data-copy-markdown-button]")?.getAttribute("data-markdown"), "/guide/install/index.md");
});

test("all island entry points are modules, so a blocked module leaves the document readable", () => {
  const scripts = all(document, "script[type='module']");
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.ok(script.getAttribute("src")?.startsWith("/assets/theme/islands/"));
  for (const script of all(document, "script:not([src]):not([type])")) {
    assert.match(script.textContent ?? "", /data-theme|prefers-color-scheme/, "the only inline script is the theme's pre-paint choice");
  }
  const data = attrs(document, "script[data-output-evidence]", "type");
  assert.deepEqual(data, ["application/json"]);
});
