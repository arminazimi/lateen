import { readFileSync } from "node:fs";
import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import mermaid from "../mermaid/index.ts";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from "shiki/core";

/** The Markdown directive this component handles: `:::code{lang="ts"}`. */
export const directive = "code";

/** Class on the `<pre>`; `style.css` styles it. */
export const CODE_CLASS = "code";

type Mode = "light" | "dark";
type TokenEntry = { $value: string; $extensions?: { lateen?: { dark?: string } } };

/** Read a token file next to this theme's tokens, or `undefined` when it is not there yet. */
function readTokens(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(new URL(`../../tokens/${file}`, import.meta.url), "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Token name to the TextMate scopes it colors. */
const SCOPES: Record<string, string[]> = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: ["keyword", "storage", "storage.type", "keyword.operator.new"],
  string: ["string", "string.regexp"],
  number: ["constant.numeric", "constant.language", "constant"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  tag: ["entity.name.tag", "support.class.component", "entity.name.type", "entity.other.attribute-name"],
  punctuation: ["punctuation", "meta.brace"],
};

/**
 * The Shiki theme for one mode. `code.light.json` or `code.dark.json` (a Shiki theme) wins when present;
 * otherwise the theme is built from the `code` group of `names.json`.
 */
export function buildTheme(mode: Mode): ThemeRegistration {
  const file = readTokens(`code.${mode}.json`);
  if (file) return { name: `lateen-${mode}`, type: mode, ...file } as ThemeRegistration;
  const group = ((readTokens("names.json") ?? {}).code ?? {}) as Record<string, TokenEntry>;
  const pick = (name: string): string => {
    const token = group[name];
    return (mode === "dark" ? token?.$extensions?.lateen?.dark : undefined) ?? token?.$value ?? "inherit";
  };
  return {
    name: `lateen-${mode}`,
    type: mode,
    colors: { "editor.background": pick("bg"), "editor.foreground": pick("fg") },
    settings: [
      { settings: { foreground: pick("fg"), background: pick("bg") } },
      ...Object.entries(SCOPES).map(([name, scope]) => ({ scope, settings: { foreground: pick(name) } })),
    ],
  };
}

let highlighter: HighlighterCore | undefined;
function get(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    themes: [buildTheme("light"), buildTheme("dark")],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** Languages whose grammar is loaded. Only these are highlighted; anything else renders as plain text. */
export function loadedLanguages(): string[] {
  return get().getLoadedLanguages();
}

/** One bundled grammar module and the loader that imports it. Aliases share the same loader. */
type GrammarModule = { default: LanguageRegistration[] };
type GrammarLoader = () => Promise<GrammarModule>;
type GrammarLoaders = Record<string, GrammarLoader | undefined>;

/** Imports in flight or done, keyed by loader: one grammar module is imported once for every caller. */
const imports = new Map<GrammarLoader, Promise<GrammarModule>>();

/** The module for a bundled loader, shared with every caller; a rejection is not cached, so a later call retries it. */
function importGrammar(load: GrammarLoader): Promise<GrammarModule> {
  let module = imports.get(load);
  if (!module) {
    module = load();
    imports.set(load, module);
    module.catch(() => {
      if (imports.get(load) === module) imports.delete(load);
    });
  }
  return module;
}

/**
 * Load the grammars a site uses, and only those. Call it once before rendering, with the languages found in the
 * site's code fences. Unknown names are ignored.
 *
 * Distinct grammars import concurrently, overlapping callers share one import, and registration happens in the
 * requested order, so the loaded set and the highlighted output do not depend on which import settles first.
 * A grammar that fails to import or register rejects this call and stays unloaded; the other grammars in the
 * same call still load, and a later call retries the failed one.
 */
export async function loadGrammars(langs: Iterable<string>, loaders: GrammarLoaders = bundledLanguages): Promise<void> {
  const hl = get();
  const loaded = new Set(hl.getLoadedLanguages());
  const requested = new Map<string, GrammarLoader>();
  for (const lang of langs) {
    const load = loaders[lang];
    if (load && !loaded.has(lang)) requested.set(lang, load);
  }
  const names = [...requested.keys()];
  const results = await Promise.allSettled(names.map((name) => importGrammar(requested.get(name)!)));
  const failed: string[] = [];
  const errors: unknown[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push(names[index]!);
      errors.push(result.reason);
      return;
    }
    try {
      hl.loadLanguageSync(result.value.default);
    } catch (error) {
      failed.push(names[index]!);
      errors.push(error);
    }
  });
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, `Could not load grammars: ${failed.join(", ")}`);
}

/**
 * Grammars loaded with the module, so a code block is highlighted without the site listing its languages:
 * the ones a docs site writes most. A site that needs another calls {@link loadGrammars}.
 */
export const DEFAULT_LANGUAGES = [
  "bash", "css", "diff", "html", "javascript", "json", "markdown", "powershell", "shellscript", "toml", "tsx", "typescript", "yaml",
] as const;

/** Short names a fence may use for a loaded grammar. */
const ALIASES: Record<string, string> = { sh: "shellscript", shell: "shellscript", zsh: "shellscript", js: "javascript", ts: "typescript", md: "markdown", yml: "yaml", ps1: "powershell" };

await loadGrammars(DEFAULT_LANGUAGES);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const TAG = /<[^>]*>/g;

/** `html` with every tag dropped. It repeats until nothing is left to drop, so removing one tag cannot join the pieces of another. */
function stripTags(html: string): string {
  let text = html;
  for (;;) {
    const next = text.replace(TAG, "");
    if (next === text) return text;
    text = next;
  }
}

/**
 * The code text inside a rendered body: tags dropped, entities decoded (named, decimal, and hexadecimal).
 * The result is plain text, not HTML: it may hold `<` again after decoding, and every caller hands it to the
 * highlighter, which escapes it. A number that is no code point is left as written.
 */
export function sourceText(html: string): string {
  return stripTags(html)
    .replace(/&(?:(amp|lt|gt|quot|apos)|#x([0-9a-f]+)|#(\d+));/gi, (m, name?: string, hex?: string, dec?: string) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? m;
      const point = hex ? parseInt(hex, 16) : Number(dec);
      return point <= 0x10ffff ? String.fromCodePoint(point) : m;
    })
    .replace(/\n$/, "");
}

/** The language named by a `language-x` class in the body, when the props give none. */
function langFromBody(html: string): string | undefined {
  return /class="[^"]*\blanguage-([\w+#-]+)/.exec(html)?.[1];
}

/**
 * A stable DOM id for a block from its source span: `code-docs-a-md-3-1-9-12`. Letters, digits,
 * `_` and `-` survive; everything else becomes `-`, so an id is safe in CSS and in a URL fragment.
 * The span is unique within a page, so two blocks never share an id.
 */
export function blockId(src: string): string {
  const slug = src
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `code-${slug || "block"}`;
}

export type CodeProps = {
  /** Language of the fence. */
  lang?: string;
  /** Source position, kept as `data-src` on the `pre`. */
  src?: string;
};

/**
 * Code highlighted at build time. Colors are emitted as `--shiki-light` and `--shiki-dark` variables on each
 * token, and `style.css` picks one with `light-dark()`, so the theme switch needs no rebuild and no
 * highlighting runs in the browser.
 */
export default function code({ props, html, page, site }: ComponentProps<CodeProps>) {
  const lang = props.lang?.trim() || langFromBody(html) || "text";
  const text = sourceText(html);
  // No page-start fallback: the engine stamps the directive's own span on the root, so each block
  // keeps a precise, unique source identity instead of all blocks sharing the page's first line.
  const src = props.src;
  // A fence marked `mermaid` is a diagram, not text; `mermaidComponents` in the engine sends fences
  // straight to the mermaid component, and this keeps `:::code{lang=mermaid}` working too.
  if (lang === "mermaid") {
    return mermaid({ props: { source: text, ...(src ? { src } : {}) }, page, site, html });
  }
  const hl = get();
  const grammar = ALIASES[lang] ?? lang;
  const known = hl.getLoadedLanguages().includes(grammar);
  const out = hl.codeToHtml(text, { lang: known ? grammar : "text", themes: { light: "lateen-light", dark: "lateen-dark" }, defaultColor: false });
  const inner = /<code[^>]*>([\s\S]*)<\/code>/.exec(out)?.[1] ?? "";
  return h(
    "pre",
    { class: CODE_CLASS, tabindex: 0, "data-lang": lang, ...(src ? { id: blockId(src), "data-src": src } : {}) },
    h("code", { dangerouslySetInnerHTML: { __html: inner } }),
  );
}

/** A plain Markdown fence as the engine writes it: `<pre data-src><code class="language-x">…</code></pre>`. */
const FENCE = /<pre((?:\s+data-src="[^"]*")?)><code(?:\s+class="language-([\w+#-]+)")?>([\s\S]*?)<\/code><\/pre>/g;

/** A stable id on any highlighted `<pre class="code">` that has a source span but no id yet. */
const IDENTIFY = /<pre class="code"((?:\s+[^>]*)?)>/g;

/**
 * Highlights the plain fences in a rendered body, so a fence and the `:::code` directive look the same.
 * Each fence becomes the markup {@link code} writes, with its language as `data-lang` and its `data-src` kept.
 * Every highlighted block that has a span but no id gets {@link blockId}, including a directive block whose
 * span the engine stamped after the component ran. A `mermaid` fence is left alone: the engine sends it to
 * the diagram component.
 */
export function highlightFences(html: string): string {
  if (!html.includes("<pre")) return html;
  const hl = get();
  return html
    .replace(FENCE, (match, srcAttr: string, lang: string | undefined, body: string) => {
      if (lang === "mermaid") return match;
      const name = lang ?? "text";
      const grammar = ALIASES[name] ?? name;
      const known = hl.getLoadedLanguages().includes(grammar);
      const out = hl.codeToHtml(sourceText(body), { lang: known ? grammar : "text", themes: { light: "lateen-light", dark: "lateen-dark" }, defaultColor: false });
      const inner = /<code[^>]*>([\s\S]*)<\/code>/.exec(out)?.[1] ?? "";
      const src = /data-src="([^"]*)"/.exec(srcAttr)?.[1];
      const idAttr = src === undefined ? "" : ` id="${blockId(src)}"`;
      return `<pre class="${CODE_CLASS}" tabindex="0"${idAttr} data-lang="${name}"${srcAttr}><code>${inner}</code></pre>`;
    })
    .replace(IDENTIFY, (match, attrs: string) => {
      if (/\sid=/.test(attrs)) return match;
      const src = /data-src="([^"]*)"/.exec(attrs)?.[1];
      if (src === undefined) return match;
      return `<pre class="${CODE_CLASS}" id="${blockId(src)}"${attrs}>`;
    });
}
