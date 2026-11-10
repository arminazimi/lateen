import { h } from "preact";
import type { Chrome, Page, Site } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { calendarDate } from "../../src/dates.ts";

/** Class on the line. `style.css` styles it. */
export const CLASS = "last-updated";

/** Class on the date part of the line. */
export const DATE_CLASS = "last-updated-date";

/** Class on the contributors part of the line. */
export const CONTRIBUTORS_CLASS = "last-updated-contributors";

/** How many contributor names the line shows. */
export const MAX_CONTRIBUTORS = 3;

const DAY_MS = 86_400_000;

/** The locale `Intl.RelativeTimeFormat` uses for a language; anything but the theme's languages reads as English. */
const LOCALES: Readonly<Record<string, string>> = { ar: "ar", en: "en", fa: "fa" };

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The locale for a language code, falling back to English for a code the theme does not ship. */
export function localeOf(lang: string): string {
  return LOCALES[lang.split("-")[0] ?? ""] ?? "en";
}

/**
 * The ISO calendar date (`YYYY-MM-DD`) at the start of a value, which may be a string or a `Date` the
 * front matter parser produced. An impossible date (`2026-02-30`) reads as no date, not a rolled-over day.
 */
export function isoDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (typeof value !== "string") return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match === null) return undefined;
  return dayOf(`${match[1]}-${match[2]}-${match[3]}`) === undefined ? undefined : `${match[1]}-${match[2]}-${match[3]}`;
}

/** The UTC midnight of an ISO date as milliseconds since the epoch, or `undefined` when it is not a real date. */
function dayOf(iso: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return undefined;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return time;
}

/**
 * "2 days ago" for `iso` relative to the build's `asOf` date, in `lang`, through
 * `Intl.RelativeTimeFormat`. Both values are calendar dates, so the answer never reads the clock: a build
 * with the same data gives the same text. A value that is not a real date reads as `undefined`, so the
 * caller can show the absolute date instead.
 */
export function relativeDate(iso: string, asOf: string, lang: string): string | undefined {
  const day = dayOf(iso);
  const now = dayOf(asOf);
  if (day === undefined || now === undefined) return undefined;

  const days = Math.round((day - now) / DAY_MS);
  try {
    return new Intl.RelativeTimeFormat(localeOf(lang), { numeric: "auto" }).format(days, "day");
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
  }
}

/** The page's entry in `site.data.reviewers`, keyed by page URL. */
function reviewOf(site: Site, url: string): Record<string, unknown> | undefined {
  const reviewers = site.data.reviewers;
  if (!isRecord(reviewers) || !Object.hasOwn(reviewers, url)) return undefined;
  const entry = reviewers[url];
  return isRecord(entry) ? entry : undefined;
}

/**
 * The build's as-of date from the site's data: `site.data.build.date` (or `site.data.build.asOf`) when a
 * site writes `_data/build.yml`, else `site.data.reviewers.asOf` on `_data/reviewers.yml`. Nothing else is
 * used: reading the clock would make two builds of the same source differ.
 */
export function asOfOf(site: Site): string | undefined {
  const build = site.data.build;
  if (typeof build === "string") return isoDate(build);
  if (isRecord(build)) {
    const fromBuild = isoDate(build.asOf) ?? isoDate(build.date);
    if (fromBuild !== undefined) return fromBuild;
  }

  return isRecord(site.data.reviewers) ? isoDate(site.data.reviewers.asOf) : undefined;
}

/**
 * The page's last change: `last_modified_at` from front matter, else `updated`, else the date of its entry
 * in `site.data.reviewers`. Anything unreadable reads as no date.
 */
export function dateOf(page: Page, site: Site): string | undefined {
  return (
    isoDate(page.frontMatter.last_modified_at) ??
    isoDate(page.frontMatter.updated) ??
    isoDate(reviewOf(site, page.url)?.date)
  );
}

/**
 * Up to {@link MAX_CONTRIBUTORS} names for a page, sorted by code point and deduplicated, from the entry's
 * `author` and its `contributors` array in `site.data.reviewers`. Names are trimmed; empty and non-string
 * values are left out.
 */
export function contributorsOf(site: Site, url: string): string[] {
  const review = reviewOf(site, url);
  if (review === undefined) return [];

  const values: unknown[] = [];
  if (review.author !== undefined) values.push(review.author);
  if (Array.isArray(review.contributors)) values.push(...review.contributors);

  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (name !== "") seen.add(name);
  }

  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, MAX_CONTRIBUTORS);
}

/** The date part: "Updated 2 days ago" when the build has an as-of date, else the absolute date. */
function datePart(iso: string, asOf: string | undefined, lang: string) {
  const absolute = calendarDate(iso, lang);
  if (absolute === undefined) return null;

  const text = asOf === undefined ? undefined : relativeDate(iso, asOf, lang);
  return h(
    "span",
    { class: DATE_CLASS },
    t(lang, "updated"),
    " ",
    h(
      "time",
      { datetime: absolute.datetime, title: absolute.text, "aria-label": absolute.text },
      text ?? absolute.text,
    ),
  );
}

/**
 * The line under a page title: when the page last changed and who last contributed to it. The date comes
 * from front matter or the page's entry in `site.data.reviewers`; the names come from the same entry. A
 * relative date is used only when the site's data supplies an as-of date, so the build never reads the
 * clock; otherwise the absolute date is shown. The absolute date always fills the `title` and
 * `aria-label`, and the line renders nothing when both the date and the contributors are missing.
 */
const lastUpdated: Chrome = ({ site, page }) => {
  const date = dateOf(page, site);
  const names = contributorsOf(site, page.url);

  if (date === undefined && names.length === 0) return null;

  const dateNode = date === undefined ? null : datePart(date, asOfOf(site), page.lang);
  if (dateNode === null && names.length === 0) return null;

  return h(
    "p",
    { class: CLASS },
    dateNode,
    names.length === 0
      ? null
      : h(
          "span",
          { class: CONTRIBUTORS_CLASS },
          t(page.lang, "contributors_label"),
          " ",
          names.join(`${t(page.lang, "comma")} `),
        ),
  );
};

export default lastUpdated;
