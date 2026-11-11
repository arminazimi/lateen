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

/** What a page's date means: the source's last change, or a review recorded in the site's data. */
export type DateSource = "source" | "review";

/** One date the line shows, with the kind of evidence it records. */
export interface PageDate {
  /** The ISO calendar date. */
  readonly date: string;
  /** Whether the date records a source change or a review. */
  readonly source: DateSource;
}

/** The string-table key for each kind of date. */
const LABELS: Readonly<Record<DateSource, string>> = { source: "updated", review: "reviewed" };

const DAY_MS = 86_400_000;

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The canonical form of `tag` when `Intl` can format it, else its language alone when that is supported.
 * `undefined` for a malformed or unsupported tag. Negotiation is a pure function of the tag, so a build's
 * text never depends on the runtime's default locale.
 */
function negotiate(tag: string): string | undefined {
  try {
    const canonical = Intl.getCanonicalLocales(tag)[0];
    if (canonical === undefined) return undefined;
    if (Intl.RelativeTimeFormat.supportedLocalesOf(canonical).length > 0) return canonical;

    const language = canonical.split("-")[0];
    return language !== undefined && Intl.RelativeTimeFormat.supportedLocalesOf(language).length > 0
      ? language
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The locale `Intl.RelativeTimeFormat` uses for a BCP 47 tag: regional tags keep their region
 * (`fa-IR`, `ar-EG`, `en-CA`), other languages `Intl` supports use their own wording (`de`), and an
 * invalid or unsupported tag falls back to English.
 */
export function localeOf(lang: string): string {
  return negotiate(lang.trim()) ?? "en";
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
 * The dates the line shows, each with what it records: the source's last change (`last_modified_at`, else
 * `updated` in front matter) and the page's review date in `site.data.reviewers`. An unreadable date is
 * absent, and a review on the same day as the source change is left out as a duplicate. The source date
 * comes first, so {@link dateOf} and a one-date line keep reading the same way.
 */
export function datesOf(page: Page, site: Site): readonly PageDate[] {
  const source = isoDate(page.frontMatter.last_modified_at) ?? isoDate(page.frontMatter.updated);
  const review = isoDate(reviewOf(site, page.url)?.date);
  const dates: PageDate[] = [];
  if (source !== undefined) dates.push({ date: source, source: "source" });
  if (review !== undefined && review !== source) dates.push({ date: review, source: "review" });
  return dates;
}

/** The page's first recorded date: its source date, else its review date. */
export function dateOf(page: Page, site: Site): string | undefined {
  return datesOf(page, site)[0]?.date;
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

/**
 * One date part: its label, then "2 days ago" when the build has an as-of date, else the absolute date.
 * A date after the as-of date is bad data, so it stays absolute rather than reading as impending. The
 * absolute date always fills the `<time>` element's `title` and `aria-label`.
 */
function datePart(entry: PageDate, asOf: string | undefined, lang: string) {
  const absolute = calendarDate(entry.date, lang);
  if (absolute === undefined) return null;

  // ISO calendar dates compare correctly as strings, so a later day sorts after the build's as-of day.
  const text = asOf === undefined || entry.date > asOf ? undefined : relativeDate(entry.date, asOf, lang);
  return h(
    "span",
    { class: DATE_CLASS, "data-date-source": entry.source },
    t(lang, LABELS[entry.source]),
    " ",
    h(
      "time",
      { datetime: absolute.datetime, title: absolute.text, "aria-label": absolute.text },
      // Isolated so a Latin date inside an RTL sentence, or vice versa, keeps its own direction.
      h("bdi", {}, text ?? absolute.text),
    ),
  );
}

/**
 * The contributor parts of the line. Each name is isolated in `<bdi>`, with the localized comma between
 * names, so mixed-direction names keep their own order and the sentence keeps its separators.
 */
function contributorNodes(names: readonly string[], lang: string) {
  const comma = `${t(lang, "comma")} `;
  return names.flatMap((name, index) => (index === 0 ? [h("bdi", {}, name)] : [comma, h("bdi", {}, name)]));
}

/**
 * The line under a page title: when the page last changed and who last contributed to it. A source
 * date and a review date are labelled separately, so "Updated" always means the source changed and
 * "Reviewed" always means someone reviewed it. The date comes from front matter or the page's entry in
 * `site.data.reviewers`; the names come from the same entry. A relative date is used only when the
 * site's data supplies an as-of date, so the build never reads the clock; otherwise the absolute date
 * is shown. The absolute date always fills the `title` and `aria-label`, and the line renders nothing
 * when both the dates and the contributors are missing.
 */
const lastUpdated: Chrome = ({ site, page }) => {
  const dates = datesOf(page, site);
  const names = contributorsOf(site, page.url);

  if (dates.length === 0 && names.length === 0) return null;

  const dateNodes = dates.map((entry) => datePart(entry, asOfOf(site), page.lang)).filter((node) => node !== null);
  if (dateNodes.length === 0 && names.length === 0) return null;

  return h(
    "p",
    { class: CLASS },
    ...dateNodes,
    names.length === 0
      ? null
      : h(
          "span",
          { class: CONTRIBUTORS_CLASS },
          t(page.lang, "contributors_label"),
          " ",
          ...contributorNodes(names, page.lang),
        ),
  );
};

export default lastUpdated;
