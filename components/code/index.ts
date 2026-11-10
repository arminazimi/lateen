import { readFileSync } from "node:fs";
import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import mermaid from "../mermaid/index.ts";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import type { HighlighterCore, ThemeRegistration } from "shiki/core";

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

/**
 * Load the grammars a site uses, and only those. Call it once before rendering, with the languages found in the
 * site's code fences. Unknown names are ignored.
 */
export async function loadGrammars(langs: Iterable<string>): Promise<void> {
  const hl = get();
  for (const lang of new Set(langs)) {
    const load = (bundledLanguages as Record<string, (() => Promise<{ default: never }>) | undefined>)[lang];
    if (!load || hl.getLoadedLanguages().includes(lang)) continue;
    hl.loadLanguageSync((await load()).default);
  }
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };

/** The code text inside a rendered body: tags dropped, entities decoded. */
export function sourceText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m] ?? m).replace(/\n$/, "");
}

/** The language named by a `language-x` class in the body, when the props give none. */
function langFromBody(html: string): string | undefined {
  return /class="[^"]*\blanguage-([\w+#-]+)/.exec(html)?.[1];
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
  const pos = page?.source;
  const src = props.src ?? (pos ? `${pos.file}:${pos.line}` : undefined);
  // A fence marked `mermaid` is a diagram, not text; `mermaidComponents` in the engine sends fences
  // straight to the mermaid component, and this keeps `:::code{lang=mermaid}` working too.
  if (lang === "mermaid") {
    return mermaid({ props: { source: text, ...(src ? { src } : {}) }, page, site, html });
  }
  const hl = get();
  const known = hl.getLoadedLanguages().includes(lang);
  const out = hl.codeToHtml(text, { lang: known ? lang : "text", themes: { light: "lateen-light", dark: "lateen-dark" }, defaultColor: false });
  const inner = /<code[^>]*>([\s\S]*)<\/code>/.exec(out)?.[1] ?? "";
  return h(
    "pre",
    { class: CODE_CLASS, tabindex: 0, "data-lang": lang, ...(src ? { "data-src": src } : {}) },
    h("code", { dangerouslySetInnerHTML: { __html: inner } }),
  );
}
