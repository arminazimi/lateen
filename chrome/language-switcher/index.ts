import { h } from "preact";
import type { Chrome, LanguageConfig, Page, Site, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** A language as the switcher reads it: a normalised root-relative prefix (`""` or `/fa`). */
export interface SwitcherLanguage {
  /** BCP 47 tag, such as `fa`. */
  readonly code: string;
  /** Name shown on the link, in that language. */
  readonly name: string;
  /** URL prefix of this language's pages, `""` for the default language. */
  readonly prefix: string;
}

/** The alternate URL block `_data/languages.yml` may carry; see the README for the shape. */
type Alternates = Readonly<Record<string, unknown>>;

/** The path a page's translations share: its URL without `base` and its language prefix. */
interface PagePaths {
  /** The configured language the URL belongs to, when one matches. */
  readonly current: SwitcherLanguage | undefined;
  /** The path the language prefixes are added to, with a trailing slash. */
  readonly rest: string;
}

/** Compares by code point, never by locale (ADR 0022, rule 5). */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A language tag in the form matching compares: trimmed, lower case, `_` read as `-`. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

/** A URL or prefix as its non-empty path segments: `/fa/guide/` → `["fa", "guide"]`. */
function pathSegments(path: string): readonly string[] {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment.length > 0);
}

/** `true` when `segments` starts with every segment of `prefix`. */
function startsWithSegments(segments: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => segments[index] === part);
}

/** A configured prefix as the switcher writes it: `""` or `/fa`, never `fa/`. */
function normalizePrefix(prefix: string): string {
  const segments = pathSegments(prefix);
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

/**
 * The languages the switcher lists: `config.languages` in config order, else the site language alone.
 * Entries without a code are dropped, and a repeated code keeps its first entry, so the list is as
 * deterministic as the config it reads.
 */
export function resolvedLanguages(config: SiteConfig): readonly SwitcherLanguage[] {
  const configured = config.languages.filter((language: LanguageConfig) => typeof language.code === "string" && language.code.trim() !== "");
  if (configured.length === 0) return [{ code: config.lang, name: config.lang, prefix: "" }];

  const seen = new Set<string>();
  const languages: SwitcherLanguage[] = [];
  for (const language of configured) {
    const code = language.code.trim();
    const key = tagKey(code);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof language.name === "string" && language.name.trim() !== "" ? language.name : code;
    languages.push({ code, name, prefix: normalizePrefix(language.prefix) });
  }
  return languages;
}

/**
 * The path a page's translations share: the page URL with `base` and its own language prefix removed.
 * The language is the configured one whose code equals `page.lang`, else the one whose prefix the URL
 * starts with, exactly as the engine groups translations. Longest prefixes win, so `/ja-jp/` is not
 * split at `/ja`.
 */
export function pagePaths(config: SiteConfig, page: Pick<Page, "url" | "lang">): PagePaths {
  const languages = resolvedLanguages(config);
  let segments = pathSegments(page.url);

  const base = pathSegments(config.base);
  if (base.length > 0 && startsWithSegments(segments, base)) segments = segments.slice(base.length);

  const byCode = languages.find((language) => tagKey(language.code) === tagKey(page.lang));
  const byPrefix = languages
    .filter((language) => startsWithSegments(segments, pathSegments(language.prefix)))
    .sort((a, b) => pathSegments(b.prefix).length - pathSegments(a.prefix).length || byCodePoint(a.code, b.code))[0];

  let current = byCode;
  const byCodePath = byCode === undefined ? [] : pathSegments(byCode.prefix);
  if (byCode !== undefined && !startsWithSegments(segments, byCodePath)) current = byPrefix;
  if (current === undefined) current = byPrefix;

  const currentPrefix = pathSegments(current?.prefix ?? "");
  const rest = currentPrefix.length > 0 && startsWithSegments(segments, currentPrefix)
    ? segments.slice(currentPrefix.length)
    : segments;

  return { current, rest: rest.length === 0 ? "/" : `/${rest.join("/")}/` };
}

/** The URL one language shows for `rest`: `base`, the language prefix, and the rest of the path. */
export function hrefFor(config: SiteConfig, language: SwitcherLanguage, rest: string): string {
  const segments = [...pathSegments(language.prefix), ...pathSegments(rest)];
  return `${config.base}${segments.length === 0 ? "/" : `/${segments.join("/")}/`}`;
}

function isMapping(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `alternates` block from `_data/languages.yml`, when the file provides one. */
function alternatesOf(data: Readonly<Record<string, unknown>>): Alternates | undefined {
  const languages = data["languages"];
  if (!isMapping(languages)) return undefined;
  const alternates = languages["alternates"];
  return isMapping(alternates) ? alternates : undefined;
}

/**
 * The page's key in the alternate map: its non-empty `translation_key`, else the shared path.
 */
function identityOf(page: Pick<Page, "frontMatter">, rest: string): string {
  const key = page.frontMatter.translation_key;
  if (typeof key === "string" && key.trim() !== "") return key.trim();
  return rest;
}

/** The alternate entry for `code` in `entry`, matched exactly first and then case-insensitively. */
function entryFor(entry: unknown, code: string): string | undefined {
  if (!isMapping(entry)) return undefined;
  const exact = entry[code];
  if (typeof exact === "string") return exact;

  const wanted = tagKey(code);
  for (const [key, value] of Object.entries(entry)) {
    if (tagKey(key) === wanted && typeof value === "string") return value;
  }
  return undefined;
}

/**
 * A configured URL as the link uses it: an absolute `http`/`https` URL is kept; a root-relative path
 * gets `base`, like the header logo. Anything else is refused, so a YAML value cannot inject a script.
 */
function safeHref(base: string, value: string): string | undefined {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/(?!\/)/.test(url)) return `${base}${url}`;
  return undefined;
}

/** The alternate map's URL for `identity` and `language`, when it gives a safe one. */
function mappedHref(
  alternates: Alternates | undefined,
  identity: string,
  language: SwitcherLanguage,
  base: string,
): string | undefined {
  if (alternates === undefined) return undefined;
  const entry = alternates[identity];
  const value = entryFor(entry, language.code);
  return value === undefined ? undefined : safeHref(base, value);
}

/**
 * The language switcher: one link per configured language, each to the same page under that
 * language's prefix. The current language is the one the page URL names, and is marked with
 * `aria-current` plus a visible word, never colour alone. `_data/languages.yml` may override any
 * link through its `alternates` map (see the README). Links are plain anchors, so the switcher works
 * without JavaScript; the reader's theme already carries across languages because every language
 * lives on the same origin and `THEME_KEY` is origin-wide.
 */
const languageSwitcher: Chrome = ({ site, page }) => {
  const languages = resolvedLanguages(site.config);
  if (languages.length < 2) return null;

  const { current, rest } = pagePaths(site.config, page);
  const label = t(site.config.lang, "language");
  const currentLabel = t(site.config.lang, "language_current");
  const alternates = alternatesOf(site.data);
  const identity = identityOf(page, rest);

  return h(
    "nav",
    { class: "language-switcher", "aria-label": label, "data-language-switcher": true },
    h(
      "ul",
      { class: "language-switcher-list" },
      ...languages.map((language) => {
        const isCurrent = current !== undefined && tagKey(current.code) === tagKey(language.code);
        const href = mappedHref(alternates, identity, language, site.config.base) ?? hrefFor(site.config, language, rest);
        return h(
          "li",
          { class: isCurrent ? "language-switcher-item language-switcher-item--current" : "language-switcher-item" },
          h(
            "a",
            {
              class: "language-switcher-link",
              href,
              hreflang: language.code,
              lang: language.code,
              "aria-current": isCurrent ? "true" : undefined,
            },
            h("span", { class: "language-switcher-name" }, language.name),
            isCurrent ? h("span", { class: "language-switcher-current" }, ` (${currentLabel})`) : null,
          ),
        );
      }),
    ),
  );
};

export default languageSwitcher;
