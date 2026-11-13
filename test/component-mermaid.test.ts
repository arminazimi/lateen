import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import mermaid, {
  altFromSource,
  CHILD_BOOT,
  clearDiagramCache,
  diagramKey,
  diagramRenderCount,
  normalizeSource,
  RENDER_OPTIONS,
  renderDiagram,
  type MermaidProps,
} from "../components/mermaid/index.ts";
import {
  CACHE_DIR_ENV,
  diagramCacheDir,
  diagramCachePath,
  MAX_ENTRY_BYTES,
  MERMAID_CACHE_FORMAT,
  readDiagramCache,
} from "../components/mermaid/cache.ts";

function render(props: MermaidProps, lang = "en"): string {
  const input = {
    props,
    html: "",
    page: { lang } as ComponentProps["page"],
    site: {} as ComponentProps["site"],
  } as ComponentProps<MermaidProps>;
  const node = mermaid(input);
  return node === null ? "" : renderToString(node as never);
}

const css = readFileSync(new URL("../components/mermaid/style.css", import.meta.url), "utf8");
const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;
const tokenNames = new Set(Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)));

const FLOWCHART = "flowchart TD\n  A[Start] --> B[End]";

const MERMAID_MODULE = new URL("../components/mermaid/index.ts", import.meta.url).href;
const CACHE_MODULE = new URL("../components/mermaid/cache.ts", import.meta.url).href;

/** Runs `run` with the persistent cache pointed at `dir`, restoring the environment afterwards. */
function withCacheDir<T>(dir: string, run: () => T): T {
  const previous = process.env[CACHE_DIR_ENV];
  process.env[CACHE_DIR_ENV] = dir;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env[CACHE_DIR_ENV];
    else process.env[CACHE_DIR_ENV] = previous;
  }
}

interface Probe {
  renders: number;
  result: { ok: boolean; svg?: string; error?: string };
}

/** Renders `source` in a fresh build process with the persistent cache at `dir`. */
function renderInFreshProcess(dir: string, source: string): Probe {
  const script = `
    const mermaid = await import(${JSON.stringify(MERMAID_MODULE)});
    const result = mermaid.renderDiagram(${JSON.stringify(source)});
    process.stdout.write(JSON.stringify({ renders: mermaid.diagramRenderCount(), result }));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, [CACHE_DIR_ENV]: dir },
    encoding: "utf8",
  });
  assert.equal(child.status, 0, typeof child.stderr === "string" ? child.stderr : String(child.error));
  return JSON.parse(typeof child.stdout === "string" ? child.stdout : "") as Probe;
}

/** Runs a module script in a separate Node process and resolves when it exits. */
function runProcess(script: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`child exited with ${String(code)}: ${stderr}`));
    });
  });
}

/** A temporary cache directory removed when the test ends. */
function tempCacheDir(): { dir: string; clean: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "lateen-mermaid-cache-"));
  return { dir, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the child renderer strips types for a query-versioned module under node_modules", () => {
  const root = mkdtempSync(join(tmpdir(), "lateen-mermaid-query-"));
  try {
    const packageDir = join(root, "node_modules");
    mkdirSync(packageDir, { recursive: true });
    const probe = join(packageDir, "query-probe.ts");
    writeFileSync(probe, 'process.stdout.write("loaded\\n");\n');
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD_BOOT], {
      env: { ...process.env, LATEEN_MERMAID_MODULE: `${pathToFileURL(probe).href}?v=abc` },
      encoding: "utf8",
    });
    assert.equal(child.status, 0, typeof child.stderr === "string" ? child.stderr : String(child.error));
    assert.equal(child.stdout, "loaded\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a small flowchart renders inline SVG at build time, with its source kept", () => {
  const out = render({ source: FLOWCHART, alt: "Start goes to end" });
  assert.match(out, /<figure class="mermaid"/);
  assert.match(out, /<svg[^>]*role="img"/);
  assert.match(out, /<text[^>]*>/);
  assert.match(out, /Start/);
  assert.match(out, /<title>Start goes to end<\/title>/);
  assert.match(out, /aria-label="Start goes to end"/);
  assert.match(out, /<details class="mermaid-source">/);
  assert.match(out, /<code class="language-mermaid">flowchart TD/);
  assert.doesNotMatch(out, /<script/i);
});

test("alt text may start as a Mermaid comment", () => {
  const source = `%% alt: A tiny flow\n${FLOWCHART}`;
  assert.equal(altFromSource(source), "A tiny flow");
  const out = render({ source });
  assert.match(out, /<title>A tiny flow<\/title>/);
  assert.match(out, /aria-label="A tiny flow"/);
});

test("normalization gives equivalent sources one cache key", () => {
  assert.equal(normalizeSource("\r\nflowchart TD  \r\n  A --> B\t\r\n\r\n"), "flowchart TD\n  A --> B");
  assert.equal(diagramKey(FLOWCHART), diagramKey("\r\nflowchart TD \r\n  A[Start] --> B[End]\r\n"));
  assert.notEqual(diagramKey(FLOWCHART), diagramKey("flowchart TD\n  A[Start] --> B[Done]"));
  assert.notEqual(diagramKey(FLOWCHART), diagramKey(FLOWCHART, { ...RENDER_OPTIONS, theme: "dark" }));
});

test("an unchanged diagram is not rendered twice", () => {
  const first = render({ source: FLOWCHART, alt: "Start goes to end" });
  const renders = diagramRenderCount();
  const variant = render({ source: "flowchart TD\r\n  A[Start] --> B[End]  \r\n\r\n", alt: "Start goes to end" });
  assert.equal(diagramRenderCount(), renders);
  assert.equal(variant, first);
});

test("a changed source or render option renders a new diagram", () => {
  renderDiagram(FLOWCHART);
  const afterBase = diagramRenderCount();

  const changed = renderDiagram("flowchart TD\n  A[Start] --> B[Done]");
  assert.equal(diagramRenderCount(), afterBase + 1);
  assert.ok(changed.ok);
  assert.match(changed.svg, /Done/);

  const dark = renderDiagram(FLOWCHART, { ...RENDER_OPTIONS, theme: "dark" });
  assert.equal(diagramRenderCount(), afterBase + 2);
  assert.ok(dark.ok);
  const base = renderDiagram(FLOWCHART);
  assert.ok(base.ok);
  assert.notEqual(dark.svg, base.svg);
});

test("the figure can keep a source position", () => {
  const out = render({ source: FLOWCHART, src: "docs/flow.md:3:1-6:3" });
  assert.match(out, /data-src="docs\/flow.md:3:1-6:3"/);
});

test("an invalid diagram falls back without throwing and keeps the source", () => {
  const props: MermaidProps = { source: "flowchart TD\n  A -->", alt: "Broken" };
  const renders = diagramRenderCount();
  const node = mermaid({ props, html: "", page: { lang: "en" }, site: {} } as unknown as ComponentProps<MermaidProps>);
  const out = renderToString(node as never);
  assert.equal(diagramRenderCount(), renders + 1);
  assert.match(out, /class="mermaid-fallback"/);
  assert.match(out, /role="note"/);
  assert.match(out, /<code class="language-mermaid">flowchart TD/);
  assert.doesNotMatch(out, /<svg/);

  // The page around a failed diagram still renders, and the failure is cached instead of retried.
  const page = renderToString(h("div", null, node, h("p", null, "after")) as never);
  assert.match(page, /<\/figure><p>after<\/p>/);
  assert.equal(render(props), out);
  assert.equal(diagramRenderCount(), renders + 1);
});

test("the same diagram has the same output in a fresh cache", () => {
  const first = render({ source: FLOWCHART, alt: "Start goes to end" });
  clearDiagramCache();
  assert.equal(render({ source: FLOWCHART, alt: "Start goes to end" }), first);
});

test("a second build process reuses an unchanged diagram without rendering it", () => {
  const { dir, clean } = tempCacheDir();
  try {
    const first = renderInFreshProcess(dir, FLOWCHART);
    assert.equal(first.renders, 1);
    assert.ok(first.result.ok);

    // A different but equivalent source: normalization is part of the key, so it is the same entry.
    const second = renderInFreshProcess(dir, "flowchart TD\r\n  A[Start] --> B[End]  \r\n\r\n");
    assert.equal(second.renders, 0);
    assert.deepEqual(second.result, first.result, "the same diagram has the same SVG in another process");
  } finally {
    clean();
  }
});

test("source, options, and cache format invalidate exactly their own entry", () => {
  const { dir, clean } = tempCacheDir();
  try {
    withCacheDir(dir, () => {
      const changedSource = "flowchart TD\n  A[Start] --> B[Done]";
      const dark = { ...RENDER_OPTIONS, theme: "dark" as const };
      clearDiagramCache();
      const first = renderDiagram(FLOWCHART);
      assert.ok(first.ok);
      assert.ok(renderDiagram(changedSource).ok);
      assert.ok(renderDiagram(FLOWCHART, dark).ok);
      const rendered = diagramRenderCount();

      // A fresh process's memory: every unchanged entry is a hit.
      clearDiagramCache();
      const hits = renderDiagram(FLOWCHART);
      assert.equal(diagramRenderCount(), rendered);
      assert.deepEqual(hits, first);

      // Its own key is unaffected: each unchanged entry is still a hit.
      assert.ok(renderDiagram(changedSource).ok);
      const darkHit = renderDiagram(FLOWCHART, dark);
      assert.ok(darkHit.ok);
      assert.equal(diagramRenderCount(), rendered);

      // A changed source and a changed option are different entries, with different SVGs.
      const changed = renderDiagram(changedSource);
      assert.ok(changed.ok);
      assert.match(changed.svg, /Done/);
      assert.notEqual(darkHit.svg, first.svg);

      // An entry written by an older cache format is never read, even at the current path.
      const key = diagramKey(FLOWCHART);
      writeFileSync(
        diagramCachePath(dir, key),
        JSON.stringify({ format: MERMAID_CACHE_FORMAT - 1, key, svg: "<svg>stale</svg>" }),
        "utf8",
      );
      clearDiagramCache();
      const fresh = renderDiagram(FLOWCHART);
      assert.equal(diagramRenderCount(), rendered + 1);
      assert.ok(fresh.ok);
      assert.doesNotMatch(fresh.svg, /stale/);
      assert.equal(readDiagramCache(dir, key), fresh.svg);
    });
  } finally {
    clean();
  }
});

test("corrupt, partial, and oversized entries never become page output", () => {
  const { dir, clean } = tempCacheDir();
  try {
    withCacheDir(dir, () => {
      const source = "flowchart TD\n  A[Corrupt] --> B[Recovered]";
      const key = diagramKey(source);
      const path = diagramCachePath(dir, key);
      const cases = [
        '{"format":1,"key":"' + key,
        JSON.stringify({ format: MERMAID_CACHE_FORMAT, key, svg: 42 }),
        "x".repeat(MAX_ENTRY_BYTES + 1),
      ];

      for (const entry of cases) {
        mkdirSync(join(dir, `v${MERMAID_CACHE_FORMAT}`), { recursive: true });
        writeFileSync(path, entry, "utf8");
        clearDiagramCache();
        const renders = diagramRenderCount();
        const result = renderDiagram(source);
        assert.equal(diagramRenderCount(), renders + 1, "a damaged entry is a miss");
        assert.ok(result.ok);
        assert.match(result.svg, /Recovered/);
        assert.equal(readDiagramCache(dir, key), result.svg, "the miss repairs the entry");
      }
    });
  } finally {
    clean();
  }
});

test("a disabled, read-only, or failing cache still renders normally", () => {
  const previous = process.env[CACHE_DIR_ENV];
  try {
    delete process.env[CACHE_DIR_ENV];
    assert.equal(diagramCacheDir(), null);
    process.env[CACHE_DIR_ENV] = "  ";
    assert.equal(diagramCacheDir(), null);

    const { dir, clean } = tempCacheDir();
    try {
      // A cache directory that cannot be created: a plain file is in the way.
      const blocked = join(dir, "blocked");
      writeFileSync(blocked, "not a directory", "utf8");
      const failing = renderInFreshProcess(join(blocked, "cache"), FLOWCHART);
      assert.equal(failing.renders, 1);
      assert.ok(failing.result.ok);
      assert.equal(existsSync(join(blocked, "cache")), false);

      // A cache directory that cannot be written: the build still produces the diagram.
      const readOnly = join(dir, "read-only");
      mkdirSync(readOnly);
      writeFileSync(join(readOnly, "keep"), "", "utf8");
      try {
        process.env[CACHE_DIR_ENV] = readOnly;
        // chmod after creating the directory: the owner may still write on macOS as root only.
        chmodSync(readOnly, 0o500);
        clearDiagramCache();
        const renders = diagramRenderCount();
        const result = renderDiagram("flowchart TD\n  A[Read only] --> B[Renders]");
        assert.equal(diagramRenderCount(), renders + 1);
        assert.ok(result.ok);
        assert.match(result.svg, /Renders/);
      } finally {
        chmodSync(readOnly, 0o700);
      }
    } finally {
      clean();
    }
  } finally {
    if (previous === undefined) delete process.env[CACHE_DIR_ENV];
    else process.env[CACHE_DIR_ENV] = previous;
  }
});

test("concurrent writers leave one complete entry", async () => {
  const { dir, clean } = tempCacheDir();
  try {
    const script = (fill: string) => `
      const { writeDiagramCache } = await import(${JSON.stringify(CACHE_MODULE)});
      const svg = ${JSON.stringify(fill)}.repeat(100000);
      for (let i = 0; i < 20; i++) writeDiagramCache(process.env[${JSON.stringify(CACHE_DIR_ENV)}], "shared-key", svg);
    `;
    await Promise.all([
      runProcess(script("A"), { [CACHE_DIR_ENV]: dir }),
      runProcess(script("B"), { [CACHE_DIR_ENV]: dir }),
    ]);

    const stored = readDiagramCache(dir, "shared-key");
    assert.ok(stored === "A".repeat(100000) || stored === "B".repeat(100000));
    const files = readdirSync(join(dir, `v${MERMAID_CACHE_FORMAT}`));
    assert.deepEqual(files, ["shared-key.json"], "temp files are renamed away, not left behind");
  } finally {
    clean();
  }
});

test("an empty source renders nothing", () => {
  assert.equal(render({}), "");
  assert.equal(render({ source: "  " }), "");
});

test("the fallback and the source disclosure follow the page language", () => {
  const broken = "flowchart TD\n  A -->";
  const fa = render({ source: broken }, "fa");
  assert.match(fa, /<p>این نمودار ترسیم نشد\. منبع زیر کامل است\.<\/p>/);
  assert.match(fa, /<summary>منبع نمودار<\/summary>/);

  const ar = render({ source: broken }, "ar");
  assert.match(ar, /تعذّر رسم هذا المخطط\. المصدر أدناه كامل\./);
  assert.match(ar, /<summary>مصدر المخطط<\/summary>/);

  const rendered = render({ source: FLOWCHART, alt: "A flow" }, "fa");
  assert.match(rendered, /<summary>منبع نمودار<\/summary>/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css is logical and starts text on the reading side", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(left|right):\s/);
  assert.match(css, /margin-inline/);
  assert.match(css, /text-align:\s*start/);
});
