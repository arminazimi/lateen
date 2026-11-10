import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The numbers a chip shows: the reading time in whole minutes and the word count. */
export interface ReadingTimeCounts {
  /** Words in the page's prose, as the engine counted them. */
  readonly words: number;
  /** Reading time in whole minutes. */
  readonly minutes: number;
}

/** Props from the directive, for a manual chip: `::reading-time{minutes=3 words=600 showWords}`. */
export type ReadingTimeProps = {
  /** Overrides the page's reading time. A non-positive or unreadable value leaves the page's value in place. */
  readonly minutes?: string | number;
  /** Overrides the page's word count. A negative or unreadable value leaves the page's value in place. */
  readonly words?: string | number;
  /** Present (any value except a false word) to show the word count next to the reading time. */
  readonly showWords?: string | number | boolean;
};

/** The CLDR plural categories the chip can ask `i18n/*.json` for. */
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** The key prefix of the "N min read" sentence; the plural category is appended. */
export const TIME_KEY_PREFIX = "reading_time_";

/** The key prefix of the "N words" sentence; the plural category is appended. */
export const WORDS_KEY_PREFIX = "reading_words_";

/** The words that turn a bare directive attribute off, matching `version-badge`'s `block`. */
const FALSE_WORDS = new Set(["false", "no", "0", "off"]);

/** Plural rules per language tag, so a page's language is looked up once. */
const rules = new Map<string, Intl.PluralRules>();

/** The categories `Intl.PluralRules` may return, as a set for narrowing the string it gives. */
const categories = new Set<string>(PLURAL_CATEGORIES);

/** The plural rules for a language tag, falling back to English when the tag is not valid BCP 47. */
function rulesOf(lang: string): Intl.PluralRules {
  const cached = rules.get(lang);
  if (cached !== undefined) return cached;
  let created: Intl.PluralRules;
  try {
    created = new Intl.PluralRules(lang);
  } catch {
    created = new Intl.PluralRules("en");
  }
  rules.set(lang, created);
  return created;
}

/**
 * The plural category of a count in a language: `one` and `other` in English, `one` (0 and 1) and
 * `other` in Persian, and `zero`, `one`, `two`, `few`, `many`, or `other` in Arabic, as CLDR defines
 * them. An invalid language tag reads as English, and a runtime that returns an unknown category
 * falls back to `other`, which every table has.
 */
export function pluralCategory(lang: string, count: number): PluralCategory {
  const value = Math.abs(Math.trunc(count));
  const category = rulesOf(lang).select(value);
  return categories.has(category) ? (category as PluralCategory) : "other";
}

/** A finite number from a number or a numeric string; anything else is undefined. */
export function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** A whole, non-negative count from a number or a numeric string; anything else is undefined. */
export function countFrom(value: unknown): number | undefined {
  const parsed = numberFrom(value);
  return parsed === undefined || parsed < 0 ? undefined : Math.trunc(parsed);
}

/** The words and minutes on one stored entry, or undefined when either is not a whole count. */
function countsOf(value: unknown): ReadingTimeCounts | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { words, minutes } = value as Record<string, unknown>;
  const wordCount = countFrom(words);
  const minuteCount = countFrom(minutes);
  if (wordCount === undefined || minuteCount === undefined) return undefined;
  return { words: wordCount, minutes: minuteCount };
}

/** The entry for `url` in a list of `{ url, words, minutes }` objects. */
function fromList(list: readonly unknown[], url: string): ReadingTimeCounts | undefined {
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    if ((item as Record<string, unknown>).url !== url) continue;
    const counts = countsOf(item);
    if (counts !== undefined) return counts;
  }
  return undefined;
}

/**
 * The reading time and word count for a page URL from `site.data["reading-time"]`.
 *
 * Three shapes are accepted, so a fact, an output, or a site's `_data` file all work:
 *
 * - the engine's array: `[{ url, words, minutes }, …]`;
 * - `{ pages: [{ url, words, minutes }, …] }`, the same list under a `pages` key;
 * - `{ pages: { "<url>": { words, minutes }, … } }`, a map keyed by the page URL.
 *
 * The URL matches `page.url` exactly, including `base`. An entry without whole, non-negative
 * `words` and `minutes` is skipped. A missing or unrecognised value yields undefined.
 */
export function countsFor(data: unknown, url: string): ReadingTimeCounts | undefined {
  if (Array.isArray(data)) return fromList(data, url);
  if (typeof data !== "object" || data === null) return undefined;
  const pages = (data as Record<string, unknown>).pages;
  if (Array.isArray(pages)) return fromList(pages, url);
  if (typeof pages === "object" && pages !== null) {
    return countsOf((pages as Record<string, unknown>)[url]);
  }
  return undefined;
}

/**
 * Whether a `showWords` attribute is on. It arrives as `""` for a bare word such as
 * `showWords`, and as a string for `showWords=true`. Only the explicit false words turn it off.
 */
export function showWordsOf(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return !FALSE_WORDS.has(value.trim().toLowerCase());
  return true;
}

/**
 * A chip under the title with the page's reading time, and its word count when `showWords` is
 * set. The numbers come from `site.data["reading-time"]` by `page.url`; the directive's `minutes`
 * and `words` override them for a manual chip. The text comes from `i18n/*.json` in the page's
 * language, with the plural category chosen by `Intl.PluralRules`. Renders nothing when there is
 * no data for the page, or when the reading time is zero.
 */
const readingTime: Component<ReadingTimeProps> = ({ props, page, site }) => {
  const stored = countsFor(site.data["reading-time"], page.url);
  const minutes = countFrom(props.minutes) ?? stored?.minutes;
  const words = countFrom(props.words) ?? stored?.words;

  if (minutes === undefined || minutes === 0) return null;

  const showWords = showWordsOf(props.showWords);
  const timeCategory = pluralCategory(page.lang, minutes);
  const children = [
    h(
      "span",
      { class: "reading-time-minutes" },
      t(page.lang, `${TIME_KEY_PREFIX}${timeCategory}`, { minutes }),
    ),
  ];
  if (showWords && words !== undefined) {
    const wordCategory = pluralCategory(page.lang, words);
    children.push(
      h("span", { class: "reading-time-words" }, t(page.lang, `${WORDS_KEY_PREFIX}${wordCategory}`, { words })),
    );
  }

  return h(
    "p",
    {
      class: "reading-time",
      "data-minutes": String(minutes),
      ...(showWords && words !== undefined ? { "data-words": String(words) } : {}),
    },
    ...children,
  );
};

export default readingTime;
