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

/**
 * The text for `key` in `lang` (a site's `lang`, which may be any code). A missing language or key
 * falls back to English, then to the key itself. `{name}` placeholders are filled from `values`.
 */
export function t(lang: string, key: string, values: Readonly<Record<string, string | number>> = {}): string {
  const table = (languages as readonly string[]).includes(lang) ? tables[lang as Language] : tables[fallback];
  const text = table[key] ?? tables[fallback][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in values ? String(values[name]) : placeholder));
}
