import { h } from "preact";
import type { Chrome, Direction, LanguageConfig, Page, Site, SiteConfig } from "@velella/mizzen/contracts";
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

/** The language a fallback link really opens, named in its own language. */
interface ActualLanguage {
  /** BCP 47 tag of the page the link opens. */
  readonly code: string;
  /** Name shown for that page's language. */
  readonly name: string;
  /** That page's text direction. */
  readonly dir: Direction;
}

/** What one configured language means for the page being rendered. */
interface LanguageEntry {
  /** The configured language this entry stands for. */
  readonly language: SwitcherLanguage;
  /** `current` is this page, `translated` has its own page, `fallback` opens another language, `missing` has none. */
  readonly state: "current" | "translated" | "fallback" | "missing";
  /** Where the entry goes; absent when no equivalent page exists. */
  readonly href?: string;
  /** The page's real language, set only for a fallback. */
  readonly actual?: ActualLanguage;
}

/** Compares by code point, never by locale. */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A language tag in the form matching compares: trimmed, lower case, `_` read as `-`. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

/** The tag and each shorter form: `pt-BR-x` → `["pt-br-x", "pt-br", "pt"]`. */
function tagChain(tag: string): readonly string[] {
  const parts = tagKey(tag).split("-").filter((part) => part !== "");
  const chain: string[] = [];
  for (let length = parts.length; length > 0; length--) chain.push(parts.slice(0, length).join("-"));
  return chain;
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
 * The languages to try when a page has none in the wanted language: `_data/languages.yml`'s
 * `fallback` list when it provides one, else the site language. An explicit empty list means no
 * fallback, exactly as the engine reads it.
 */
function fallbackChain(config: SiteConfig, data: Readonly<Record<string, unknown>>): readonly string[] {
  const languages = data["languages"];
  if (isMapping(languages)) {
    const fallback = languages["fallback"];
    if (Array.isArray(fallback)) {
      const chain = fallback
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
      if (fallback.length === 0 || chain.length > 0) return chain;
    }
  }
  return [config.lang];
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
 * The pages that share `identity`, by lower-case language tag. Pages are read in URL order so a
 * repeated language gives the same page every time. Assets are left out: a translation is a page to
 * read, not a file to download.
 */
function translationsOf(site: Site, identity: string): ReadonlyMap<string, Page> {
  const translations = new Map<string, Page>();
  const pages = [...site.pages].sort((a, b) => byCodePoint(a.url, b.url));
  for (const candidate of pages) {
    if (candidate.kind === "asset") continue;
    if (identityOf(candidate, pagePaths(site.config, candidate).rest) !== identity) continue;
    const key = tagKey(candidate.lang);
    if (!translations.has(key)) translations.set(key, candidate);
  }
  return translations;
}

/** The name and direction of a page's language, as the config or the page itself gives them. */
function actualLanguageOf(site: Site, page: Page): ActualLanguage {
  const configured = resolvedLanguages(site.config).find((language) => tagKey(language.code) === tagKey(page.lang));
  return { code: page.lang, name: configured?.name ?? page.lang, dir: page.dir };
}

/**
 * Where one configured language leads for this page. The current language opens the page itself; an
 * explicit alternate or a page in that language is a translation; a page in a shorter tag or in the
 * fallback chain is a fallback; anything else is missing, and is never given a guessed URL.
 */
function languageEntry(
  site: Site,
  page: Page,
  language: SwitcherLanguage,
  current: SwitcherLanguage | undefined,
  identity: string,
  alternates: Alternates | undefined,
  translations: ReadonlyMap<string, Page>,
  chain: readonly string[],
): LanguageEntry {
  const mapped = mappedHref(alternates, identity, language, site.config.base);
  if (current !== undefined && tagKey(current.code) === tagKey(language.code)) {
    return { language, state: "current", href: mapped ?? page.url };
  }
  if (mapped !== undefined) return { language, state: "translated", href: mapped };

  for (const tag of [language.code, ...chain]) {
    for (const form of tagChain(tag)) {
      const found = translations.get(form);
      if (found === undefined) continue;
      if (form === tagKey(language.code)) return { language, state: "translated", href: found.url };
      return { language, state: "fallback", href: found.url, actual: actualLanguageOf(site, found) };
    }
  }

  return { language, state: "missing" };
}

/** The text a screen reader hears for a language whose page is not in that language. */
function unavailableLabel(site: Site): string {
  return t(site.config.lang, "translation_missing");
}

/**
 * The language switcher: one entry per configured language, each to the page the site really builds
 * in that language. The current language opens the page itself and is marked with `aria-current` plus
 * a visible word, never colour alone. A translation that does not exist is not guessed from the URL:
 * a language served by a fallback opens that page and names the language it really shows, and a
 * language with no page at all is plain text with the reason a screen reader announces. Page URLs
 * come from the model, so `base`, version segments, and `translation_key` routes are kept exactly.
 * `_data/languages.yml` may override any link through its `alternates` map (see the README). Links are
 * plain anchors, so the switcher works without JavaScript; the reader's theme already carries across
 * languages because every language lives on the same origin and `THEME_KEY` is origin-wide.
 */
const languageSwitcher: Chrome = ({ site, page }) => {
  const languages = resolvedLanguages(site.config);
  if (languages.length < 2) return null;

  const { current, rest } = pagePaths(site.config, page);
  const label = t(site.config.lang, "language");
  const currentLabel = t(site.config.lang, "language_current");
  const alternates = alternatesOf(site.data);
  const identity = identityOf(page, rest);
  const translations = translationsOf(site, identity);
  const chain = fallbackChain(site.config, site.data);
  const unavailable = unavailableLabel(site);

  return h(
    "nav",
    { class: "language-switcher", "aria-label": label, "data-language-switcher": true },
    h(
      "ul",
      { class: "language-switcher-list" },
      ...languages.map((language) => {
        const entry = languageEntry(site, page, language, current, identity, alternates, translations, chain);
        const classes = ["language-switcher-item"];
        if (entry.state === "current") classes.push("language-switcher-item--current");

        if (entry.state === "missing") {
          return h(
            "li",
            { class: classes.join(" "), "data-language-state": entry.state },
            h(
              "span",
              {
                class: "language-switcher-link language-switcher-link--unavailable",
                lang: language.code,
                "aria-disabled": "true",
              },
              h("span", { class: "language-switcher-name", dir: "auto" }, language.name),
              h("span", { class: "language-switcher-state", "aria-hidden": "true" }, "—"),
              h("span", { class: "language-switcher-sr", lang: site.config.lang, dir: site.config.dir }, unavailable),
            ),
          );
        }

        return h(
          "li",
          { class: classes.join(" "), "data-language-state": entry.state },
          h(
            "a",
            {
              class: entry.state === "fallback" ? "language-switcher-link language-switcher-link--fallback" : "language-switcher-link",
              href: entry.href,
              hreflang: entry.actual?.code ?? language.code,
              lang: language.code,
              "aria-current": entry.state === "current" ? "true" : undefined,
            },
            h("span", { class: "language-switcher-name", dir: "auto" }, language.name),
            entry.actual === undefined
              ? null
              : h("span", { class: "language-switcher-sr", lang: site.config.lang, dir: site.config.dir }, unavailable),
            entry.state === "current"
              ? h("span", { class: "language-switcher-current", lang: site.config.lang, dir: site.config.dir }, ` (${currentLabel})`)
              : null,
            entry.actual === undefined
              ? null
              : h("span", { class: "language-switcher-state", lang: entry.actual.code, dir: "auto" }, ` (${entry.actual.name})`),
          ),
        );
      }),
    ),
  );
};

export default languageSwitcher;
