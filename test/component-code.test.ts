import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import { bundledLanguages } from "shiki/langs";
import type { ComponentProps } from "@velella/mizzen/contracts";
import code, { blockId, DEFAULT_LANGUAGES, buildTheme, highlightFences, loadGrammars, loadedLanguages, sourceText } from "../components/code/index.ts";

function render(props: Record<string, string>, html: string): string {
  const input = { props, html, page: {}, site: {} } as unknown as ComponentProps<never>;
  return renderToString(code(input as never) as never);
}

const css = readFileSync(new URL("../styles/parts-code.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;
const tokenNames = new Set(Object.entries(names).flatMap(([g, e]) => Object.keys(e).map((n) => `${g}-${n}`)));

/** WCAG 2.2 relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.2 contrast ratio between two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

test("sourceText strips tags and decodes entities", () => {
  assert.equal(sourceText('<pre><code class="language-ts">a &lt; b &amp;&amp; c\n</code></pre>'), "a < b && c");
});

test("loads the default grammars with the module, and others only when asked", async () => {
  for (const lang of DEFAULT_LANGUAGES) assert.ok(loadedLanguages().includes(lang), lang);
  assert.ok(!loadedLanguages().includes("python"));
  await loadGrammars(["python", "nope"]);
  assert.ok(loadedLanguages().includes("python"));
  assert.ok(!loadedLanguages().includes("rust"));
});

/** A promise a test settles by hand, to hold an import open while it checks what else has started. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

test("overlapping callers import each grammar once, and distinct grammars import concurrently", async () => {
  const rustGate = gate();
  const goGate = gate();
  const calls: string[] = [];
  const loaders = {
    rust: async () => {
      calls.push("rust");
      await rustGate.promise;
      return bundledLanguages.rust();
    },
    go: async () => {
      calls.push("go");
      await goGate.promise;
      return bundledLanguages.go();
    },
  };
  const first = loadGrammars(["rust", "go"], loaders);
  const second = loadGrammars(["go", "rust", "rust"], loaders);
  // Both imports started before either was allowed to finish: no serial chain, no second import.
  assert.deepEqual(calls, ["rust", "go"]);
  goGate.open(); // Settles out of request order; registration still follows the request.
  rustGate.open();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["rust", "go"]);
  const loaded = loadedLanguages();
  assert.ok(loaded.includes("rust"));
  assert.ok(loaded.includes("go"));
  assert.ok(loaded.indexOf("rust") < loaded.indexOf("go"));
});

test("a failed grammar rejects, leaves the others loaded, and is retried on the next call", async () => {
  let rubyLoads = 0;
  let luaLoads = 0;
  let offline = true;
  const loaders = {
    ruby: async () => {
      rubyLoads += 1;
      if (offline) throw new Error("ruby grammar unavailable");
      return bundledLanguages.ruby();
    },
    lua: async () => {
      luaLoads += 1;
      return bundledLanguages.lua();
    },
  };
  await assert.rejects(loadGrammars(["ruby", "lua"], loaders), /ruby grammar unavailable/);
  assert.equal(rubyLoads, 1);
  assert.ok(!loadedLanguages().includes("ruby"));
  assert.ok(loadedLanguages().includes("lua"));
  offline = false;
  await loadGrammars(["ruby", "lua"], loaders);
  assert.equal(rubyLoads, 2);
  assert.equal(luaLoads, 1);
  assert.ok(loadedLanguages().includes("ruby"));
});

test("an alias and its canonical name share one import and highlight identically", async () => {
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return bundledLanguages.kotlin();
  };
  // `kt` is a bundled alias of `kotlin`, so both names use the same loader.
  await loadGrammars(["kt", "kotlin"], { kt: loader, kotlin: loader });
  assert.equal(loads, 1);
  assert.ok(loadedLanguages().includes("kt"));
  assert.ok(loadedLanguages().includes("kotlin"));
  const inner = (lang: string) => /<code[^>]*>([\s\S]*)<\/code>/.exec(render({ lang }, "val answer = 42"))?.[1];
  assert.match(inner("kt") ?? "", /--shiki-light:#/);
  assert.equal(inner("kt"), inner("kotlin"));
});

test("the browser island never imports the highlighter", () => {
  const client = readFileSync(new URL("../chrome/code-copy/client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(client, /\bfrom\s+"shiki|import\(\s*"shiki/);
});

test("sourceText decodes numeric entities as well as named ones", () => {
  assert.equal(sourceText("Record&#x3C;string, string&#62; &amp; x"), "Record<string, string> & x");
  assert.equal(sourceText("a&#x110000;b&#99999999;c"), "a&#x110000;b&#99999999;c");
});

test("sourceText drops tags until none is left, and its text is escaped again when highlighted", () => {
  assert.equal(sourceText('<span class="line"><span>a</span> <span>b</span></span>'), "a b");
  assert.doesNotMatch(sourceText("<scr<b>ipt>alert(1)</scr</b>ipt>"), /<[^>]*>/);
  const out = highlightFences("<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;\n</code></pre>");
  assert.doesNotMatch(out, /<script/);
});

test("highlightFences highlights a plain fence, keeps data-src, and gives it a stable id", () => {
  const out = highlightFences('<p>a</p><pre data-src="a.md:3:1-5:3"><code class="language-sh">npm test\n</code></pre>');
  assert.match(out, /^<p>a<\/p><pre class="code" tabindex="0" id="code-a-md-3-1-5-3" data-lang="sh" data-src="a\.md:3:1-5:3"><code>/);
  assert.match(out, /--shiki-dark:#/);
  const plain = highlightFences("<pre><code>a &lt; b\n</code></pre>");
  assert.match(plain, /<pre class="code" tabindex="0" data-lang="text"><code>/);
  assert.match(plain, /a &#x3C; b|a &lt; b/);
  const diagram = '<pre><code class="language-mermaid">graph TD\n</code></pre>';
  assert.equal(highlightFences(diagram), diagram);
});

test("highlightFences gives an already-highlighted block its stable id once", () => {
  const block = '<pre class="code" tabindex="0" data-lang="ts" data-src="a.md:3:1-5:3"><code>x</code></pre>';
  const out = highlightFences(block);
  assert.match(out, /^<pre class="code" id="code-a-md-3-1-5-3" tabindex="0" data-lang="ts" data-src="a\.md:3:1-5:3"><code>x<\/code><\/pre>$/);
  assert.equal(highlightFences(out), out);
});

test("highlights at build time with light and dark variables, keeps data-src", async () => {
  await loadGrammars(["json"]);
  const out = render({ lang: "json", src: "docs/a.md:3" }, "{&quot;a&quot;: 1}");
  assert.match(out, /<pre class="code"[^>]*id="code-docs-a-md-3"/);
  assert.match(out, /<pre class="code"[^>]*data-src="docs\/a\.md:3"/);
  assert.match(out, /--shiki-light:#/);
  assert.match(out, /--shiki-dark:#/);
  assert.doesNotMatch(out, /<script/);
});

test("a block without its own src leaves the span to the engine, not the page start", () => {
  const input = {
    props: { lang: "ts" },
    html: "const a = 1;",
    page: { source: { file: "docs/a.md", line: 10, column: 1, endLine: 12, endColumn: 4 } },
    site: {},
  } as unknown as ComponentProps<never>;
  const out = renderToString(code(input) as never);
  assert.doesNotMatch(out, /data-src=/);
  assert.doesNotMatch(out, /id=/);
});

test("blockId turns a span into an id-safe, stable fragment and stays unique per span", () => {
  assert.equal(blockId("docs/a.md:3:1-9:12"), "code-docs-a-md-3-1-9-12");
  assert.equal(blockId("C:\\notes\\a.md:2:3"), "code-C-notes-a-md-2-3");
  assert.equal(blockId("docs/a.md:3:1-9:12"), blockId("docs/a.md:3:1-9:12"));
  assert.notEqual(blockId("docs/a.md:3:1-9:12"), blockId("docs/a.md:4:1-9:12"));
  assert.equal(blockId(":::"), "code-block");
});

test("an unloaded language renders as plain escaped text", () => {
  const out = render({ lang: "klingon" }, "a &lt; b");
  assert.match(out, /a (&lt;|&#x3C;) b/);
});

test("a recorded session fence keeps its language and source identity", () => {
  const out = render({ lang: "console", src: "docs/a.md:3:1-6:2" }, "$ npm ci\nadded 1 package");
  assert.match(out, /data-lang="console"/);
  assert.match(out, /data-src="docs\/a\.md:3:1-6:2"/);
  assert.match(out, /id="code-docs-a-md-3-1-6-2"/);
});

test("the light theme comes from code.light.json (#1095)", () => {
  const theme = buildTheme("light");
  assert.equal(theme.name, "lateen-light");
  assert.equal(theme.type, "light");
  assert.equal(theme.colors?.["editor.background"], "#e5e9f0");
  const scopes = (theme.settings ?? []).map((setting) => setting.scope).join(", ");
  for (const scope of ["comment", "keyword", "string", "constant.numeric", "entity.name.function", "entity.name.tag", "punctuation"]) {
    assert.ok(scopes.includes(scope), scope);
  }
});

test("every light theme color meets 4.5:1 on the code background (#1095)", () => {
  const theme = buildTheme("light");
  const background = theme.colors?.["editor.background"] ?? "";
  const foregrounds = new Set(
    [theme.colors?.["editor.foreground"], ...(theme.settings ?? []).map((setting) => setting.settings?.foreground)].filter(
      (color): color is string => color !== undefined,
    ),
  );
  assert.ok(foregrounds.size > 1);
  for (const color of foregrounds) assert.ok(contrast(color, background) >= 4.5, `${color} on ${background}`);
});

test("the dark theme comes from code.dark.json (#1096)", () => {
  assert.equal(buildTheme("dark").name, "lateen-dark");
  assert.equal(buildTheme("dark").colors?.["editor.background"], "#2a2a37");
  assert.ok(buildTheme("dark").settings?.some((s) => s.scope?.includes("keyword")));
});

test("styles scroll inside the block and use only known tokens", () => {
  assert.match(css, /overflow-x:\s*auto/);
  for (const [, name] of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
    if (name!.startsWith("shiki-")) continue;
    assert.ok(tokenNames.has(name!), `unknown token --${name}`);
  }
});
