import { readFileSync } from "node:fs";

/** The languages the theme ships interface strings for. */
export const languages = ["en", "fa", "ar"] as const;
export type Language = (typeof languages)[number];

/** One language's strings: a flat object from key to text. */
export type Strings = Readonly<Record<string, string>>;

/** A language without a table, or a key missing from its table, falls back to English. */
const fallback: Language = "en";

/** Reads `<lang>.json` next to this file. */
function load(lang: Language): Strings {
  return JSON.parse(readFileSync(new URL(`./${lang}.json`, import.meta.url), "utf8")) as Strings;
}

const tables: Readonly<Record<Language, Strings>> = { en: load("en"), fa: load("fa"), ar: load("ar") };

/** The whole string table for a language. */
export function stringsOf(lang: Language): Strings {
  return tables[lang];
}

/** Diagnostics already reported, so one bad message does not flood the build log. */
const reported = new Set<string>();

/**
 * Writes one development diagnostic. Production builds stay quiet; set `NODE_ENV=production` to
 * silence these. The text names the language and key so the fix is obvious.
 */
function report(message: string): void {
  if (process.env.NODE_ENV === "production" || reported.has(message)) return;
  reported.add(message);
  console.warn(`lateen i18n: ${message}`);
}

/** True when `code` (ignoring case) is one of the shipped catalogs. */
function ships(code: string): code is Language {
  return (languages as readonly string[]).includes(code.toLowerCase());
}

/**
 * The catalog for a site language: the language itself, else its primary subtag (`fa-IR` reads
 * `fa`), else English with a diagnostic. A site may name any language code.
 */
function catalogFor(lang: string): Language {
  const code = lang.toLowerCase();
  if (ships(code)) return code;
  const primary = code.split(/[-_]/)[0] ?? "";
  if (ships(primary)) return primary;
  report(`no ${JSON.stringify(lang)} catalog; using ${fallback}`);
  return fallback;
}

/** The text for `key` and the catalog it came from, with the documented fallback and diagnostics. */
function resolve(lang: string, key: string): { readonly text: string; readonly catalog: Language } {
  const catalog = catalogFor(lang);
  const text = tables[catalog][key] ?? (catalog === fallback ? undefined : tables[fallback][key]);
  if (text !== undefined) {
    if (catalog !== fallback && !(key in tables[catalog])) {
      report(`${JSON.stringify(key)} is missing from ${catalog}; using ${fallback}`);
    }
    return { text, catalog };
  }
  report(`unknown message key ${JSON.stringify(key)}`);
  return { text: key, catalog };
}

/** Characters that read right to left: Hebrew, Arabic, Syriac, Thaana, N'Ko, and their forms. */
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;

/** The direction of the first letter in `text`, or `undefined` when it has none (digits, punctuation). */
function directionOf(text: string): "ltr" | "rtl" | undefined {
  const letter = /\p{L}/u.exec(text)?.[0];
  if (letter === undefined) return undefined;
  return RTL.test(letter) ? "rtl" : "ltr";
}

/**
 * A value whose first letter faces the other way from the message is wrapped in Unicode isolates,
 * so it cannot reorder the words around it. Neutral values (numbers, paths, punctuation) are left
 * alone, and the wraps are plain text: nothing here is markup.
 */
function isolate(value: string, direction: "ltr" | "rtl" | undefined): string {
  const own = directionOf(value);
  if (own === undefined || direction === undefined || own === direction) return value;
  return `\u2068${value}\u2069`;
}

/**
 * The raw text for `key` with its `{name}` placeholders intact. Client code that fills the
 * placeholders later (a page script, a `data-*` template) uses this instead of {@link t}, which
 * fills the placeholders it has values for and leaves the rest intact.
 */
export function patternOf(lang: string, key: string): string {
  return resolve(lang, key).text;
}

/**
 * The text for `key` in `lang` (a site's `lang`, which may be any code). Fallback order is the
 * language, its primary subtag (`fa-IR` reads `fa`), English, then the key itself; a missing
 * catalog, message, or value emits one development diagnostic per problem. `{name}` placeholders
 * are filled from `values` as text (never HTML), with direction isolation when needed. A
 * placeholder with no value stays intact (`{name}`), so a broken message still shows the missing
 * value instead of reading as a complete sentence that lost it.
 */
export function t(lang: string, key: string, values: Readonly<Record<string, string | number>> = {}): string {
  const { text } = resolve(lang, key);
  const direction = directionOf(text);
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) {
      report(`${JSON.stringify(key)} has no value for {${name}}`);
      return placeholder;
    }
    return isolate(String(value), direction);
  });
}
