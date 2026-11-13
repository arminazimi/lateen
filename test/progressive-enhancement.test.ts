// Issue #12: a full page must read and navigate without JavaScript. This suite renders the doc layout
// and the components that enhance it, then checks that everything a reader needs is in the first
// response, that no island script produces or wraps that content, and that the performance budget is
// wired to the committed fixture routes. It is deliberately an integration test: each component's own
// unit tests live next to it and are not repeated here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type {
  ComponentProps,
  LayoutProps,
  Page,
  Site,
  SiteConfig,
  SourcePos,
} from "@velella/mizzen/contracts";
import doc from "../layouts/doc.ts";
import tabs, { type TabsProps } from "../components/tabs/index.ts";
import embed, { type EmbedProps } from "../components/embed/index.ts";
import video, { type VideoProps } from "../components/video/index.ts";
import mermaid, { type MermaidProps, type MermaidRecord } from "../components/mermaid/index.ts";

const pos: SourcePos = { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

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

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
    source: pos,
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

function siteWith(page: Page): Site {
  return { config: configWith(), pages: [page], nav: {}, data: {} };
}

type DocOptions = {
  readonly nav?: Site["nav"]["main"];
  readonly trail?: LayoutProps["trail"];
  readonly islands?: LayoutProps["islands"];
};

/** The doc layout's whole document, with fake contract props and a body the caller supplies. */
function renderDoc(body: string, { nav = [], trail = [], islands = [] }: DocOptions = {}): string {
  const page = pageWith({ html: body });
  const props: LayoutProps = {
    site: {
      config: configWith(),
      pages: [page],
      nav: { main: nav },
      data: {},
    },
    page,
    trail,
    pager: { prev: { title: "Overview", url: "/guide/" }, next: { title: "Configure", url: "/guide/configure/" } },
    head: { title: `${page.title} · Example`, meta: [], links: [], jsonLd: [] },
    islands,
  };
  return renderToString(doc(props) as never);
}

/** A component rendered with fake contract props, the way the engine hosts it. */
function renderComponent<P extends Readonly<Record<string, unknown>>>(
  unit: (input: ComponentProps<P>) => unknown,
  props: P,
  body = "",
): string {
  const page = pageWith();
  return renderToString(unit({ props, html: body, page, site: siteWith(page) }) as never);
}

/** The article element alone, so two renders can be compared for content parity. */
function articleOf(html: string): string {
  const match = /<article class="doc"[\s\S]*?<\/article>/.exec(html);
  assert.ok(match, "the doc article is present");
  return match[0];
}

/** The module scripts a page ends with, in document order. */
function moduleScripts(html: string): string[] {
  return [...html.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((match) => match[0]);
}

test("the doc layout serves prose, a code block, and a table with no island script", () => {
  const body = [
    '<h2 id="install">Install</h2>',
    "<p>Run the <strong>installer</strong> and restart the server.</p>",
    '<pre data-src="guide/install.md:5:1-7:3"><code class="language-shell">bun add lateen</code></pre>',
    "<table><thead><tr><th>Flag</th></tr></thead><tbody><tr><td>--dry-run</td></tr></tbody></table>",
  ].join("\n");
  const html = renderDoc(body);

  assert.match(html, /<main id="main" tabindex="-1"><article class="doc" data-pagefind-body="true">/);
  assert.match(html, /<h2 id="install">Install<\/h2>/);
  assert.match(html, /<p>Run the <strong>installer<\/strong> and restart the server\.<\/p>/);
  assert.match(html, /<table><thead><tr><th>Flag<\/th><\/tr><\/thead><tbody><tr><td>--dry-run<\/td><\/tr><\/tbody><\/table>/);

  // A plain Markdown fence is highlighted at build time, not in the browser.
  assert.match(html, /<pre class="code" tabindex="0" id="code-guide-install-md-5-1-7-3" data-lang="shell"/);
  assert.ok(html.includes("bun") && html.includes("lateen"), "the code text survives highlighting");

  // Nothing on the page needs a module to be readable.
  assert.deepEqual(moduleScripts(html), []);
  assert.ok(html.includes("Run the"), "the prose is server HTML, not a script's output");
});

test("every tabs panel ships in the first response while the tablist starts hidden", () => {
  const body = [
    "<h3>npm</h3><p>npm install lateen</p>",
    "<h3>pnpm</h3><p>pnpm add lateen</p>",
    "<h3>bun</h3><p>bun add lateen</p>",
  ].join("\n");
  const html = renderDoc(renderComponent(tabs, { group: "install" }, body));

  for (const panel of ["npm install lateen", "pnpm add lateen", "bun add lateen"]) {
    assert.ok(html.includes(panel), `${panel} is in the first response`);
    assert.ok(html.indexOf(panel) < html.indexOf("</article>"), `${panel} is inside the article`);
  }

  assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 3, "one panel per section");
  assert.match(html, /<div role="tablist" hidden>/, "the tab list waits for the island");
  assert.doesNotMatch(html, /role="tabpanel"[^>]*\shidden/, "no panel is hidden before hydration");
});

test("an embed ships its placeholder and provider link, and requests nothing remote", () => {
  const watch = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  const html = renderComponent(embed, { src: watch, title: "Big Buck Bunny" });
  const page = renderDoc(html);

  assert.match(html, /class="embed-placeholder"/);
  assert.match(html, /<span class="embed-title">Big Buck Bunny<\/span>/);
  assert.ok(
    html.includes(
      '<a class="embed-link" href="https://www.youtube.com/watch?v=aqz-KE-bpKQ" target="_blank" rel="noopener noreferrer">Open on YouTube</a>',
    ),
    "the provider link is plain markup",
  );

  // The embed address is data until the reader asks for the frame.
  assert.match(html, /data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ"/);
  assert.doesNotMatch(html, /\ssrc=/, "no element loads anything");
  assert.doesNotMatch(page, /<(?:iframe|object|embed|frame)\b/);
  assert.doesNotMatch(page, /\ssrc="https?:/, "the whole page requests nothing remote");
});

test("a video requests no player before consent and keeps its captions, transcript, and provider link", () => {
  const watch = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  const html = renderComponent(
    video,
    {
      src: watch,
      title: "Big Buck Bunny",
      captions: "/media/captions.vtt",
      captions_label: "English captions",
      transcript_label: "Transcript",
    },
    "<p>The bunny wakes up.</p>",
  );
  const page = renderDoc(html);

  // No player, thumbnail, track, or poster is requested before the click.
  assert.doesNotMatch(html, /<(?:iframe|video|audio|source|track|img)\b/);
  assert.doesNotMatch(html, /\ssrc=/, "the player address stays in data-embed until consent");
  assert.match(html, /data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ"/);

  // The alternatives are static markup and survive a blocked or missing island.
  assert.ok(html.includes(">Watch on YouTube</a>"), "the provider link survives");
  assert.ok(
    html.includes('<a href="/media/captions.vtt" rel="noopener">English captions</a>'),
    "the captions link survives",
  );
  assert.ok(
    html.includes(
      '<details class="video-transcript" data-video-transcript="true"><summary>Transcript</summary><div class="video-transcript-body"><p>The bunny wakes up.</p></div></details>',
    ),
    "the transcript disclosure survives",
  );
  assert.doesNotMatch(page, /<(?:iframe|video|track)\b/);
});

test("a Mermaid diagram ships rendered with its source disclosure and inert record", () => {
  const source = "flowchart TD\n  A[Start] --> B[End]";
  const html = renderDoc(renderComponent(mermaid, { source, alt: "Start goes to end" }));

  // The diagram is SVG in the first response, so no renderer runs in the browser.
  assert.match(html, /<svg[^>]*role="img"/);
  assert.match(html, /<title>Start goes to end<\/title>/);
  assert.match(html, /Start<\/tspan>/);
  assert.match(html, /End<\/tspan>/);

  const figure = /<figure class="mermaid">([\s\S]*?)<\/figure>/.exec(html);
  assert.ok(figure, "the diagram figure is present");

  // The source disclosure keeps the original diagram text, even when the SVG is the only visual.
  assert.ok(html.includes('<details class="mermaid-source">'));
  assert.ok(html.includes(`<code class="language-mermaid">${source}</code>`), "the original source is kept");

  // The record is data for agents and consumers, not executable JavaScript.
  const scripts = [...(figure[1] ?? "").matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(scripts.length, 1, "the figure holds one script");
  assert.match(scripts[0] ?? "", /^<script type="application\/json" data-mermaid-record/);

  const recordMatch = /<script type="application\/json" data-mermaid-record[^>]*>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(recordMatch, "the diagram record is present");
  const record = JSON.parse(recordMatch[1] ?? "") as MermaidRecord;
  assert.equal(record.source, source);
  assert.equal(record.render, "rendered");
});

test("a missing island run leaves content outside the scripts and navigation on real links", () => {
  const nav = [{ title: "Guides", children: [{ title: "Install", url: "/guide/install/" }] }];
  const trail = [
    { title: "Guides", url: "/guide/" },
    { title: "Install", url: "/guide/install/" },
  ];
  const body = '<h2 id="install">Install</h2><p>Server-rendered paragraph.</p>';
  const islands = [
    { name: "tabs", src: "/assets/theme/islands/components/tabs/client.js" },
    { name: "toc", src: "/assets/theme/islands/chrome/toc/client.js" },
  ];

  const withIslands = renderDoc(body, { nav, trail, islands });
  const withoutIslands = renderDoc(body, { nav, trail });

  // The island scripts are empty modules at the end of the body; they neither wrap nor produce content.
  const scripts = moduleScripts(withIslands);
  assert.equal(scripts.length, 2);
  assert.equal([...withIslands.matchAll(/<script type="module"/g)].length, scripts.length, "no module carries inline code");
  for (const script of scripts) assert.match(script, /^<script type="module" src="\/assets\/theme\/islands\//);
  assert.ok(withIslands.indexOf("Server-rendered paragraph.") < withIslands.indexOf('<script type="module"'));
  assert.ok(withIslands.indexOf("</main>") < withIslands.indexOf('<script type="module"'));
  assert.equal(articleOf(withIslands), articleOf(withoutIslands), "islands change no article markup");

  // The same content and the same navigation work with no script at all.
  assert.deepEqual(moduleScripts(withoutIslands), []);
  assert.match(withoutIslands, /<a href="\/guide\/install\/" aria-current="page">Install<\/a>/);
  assert.match(withoutIslands, /<a href="\/guide\/">/);
  assert.match(withoutIslands, /class="pager-link pager-prev" href="\/guide\/" rel="prev"/);
  assert.match(withoutIslands, /class="pager-link pager-next" href="\/guide\/configure\/" rel="next"/);
  assert.match(withoutIslands, /<a class="header-home" href="\/">/);
});

test("the performance budget is documented and covers the three fixture routes", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(pkg.scripts?.["test:performance"], "node scripts/performance-budget.ts");

  const budget = JSON.parse(readFileSync(new URL("../fixtures/performance/budget.json", import.meta.url), "utf8")) as {
    routes: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(budget.routes).sort(), ["/", "/guide/", "/reference/"]);
});
