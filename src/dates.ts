/**
 * Calendar dates for the theme's "last updated" line. Persian pages show the Jalali (Persian) calendar,
 * Arabic pages the Hijri (Islamic) calendar, and English pages the Gregorian calendar. Formatting uses
 * `Intl.DateTimeFormat`, so no dependency is needed.
 */

/** How a language writes its calendar date: the locale sets the month names and numerals, the calendar the system. */
interface DateStyle {
  locale: string;
  calendar: string;
}

const GREGORIAN: DateStyle = { locale: "en-US", calendar: "gregory" };

const STYLES: Record<string, DateStyle> = {
  ar: { locale: "ar-SA", calendar: "islamic" },
  fa: { locale: "fa-IR", calendar: "persian" },
};

/** The ISO calendar date at the start of a value: `YYYY-MM-DD`, optionally followed by a time. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/;

/** A date written for a page: the ISO date for the `datetime` attribute, and the text in the page's calendar. */
export interface CalendarDate {
  /** The ISO calendar date, `YYYY-MM-DD`. */
  datetime: string;
  /** The same day in the language's calendar and numerals, for display. */
  text: string;
}

/**
 * Formats an ISO date (`YYYY-MM-DD`, or a date-time whose date part is used) for a page in `lang`.
 * Returns `undefined` when the value is not a real calendar date, so the caller can show no date.
 */
export function calendarDate(iso: string, lang: string): CalendarDate | undefined {
  const match = ISO_DATE.exec(iso);
  if (match === null) return undefined;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls over invalid days (2026-02-30 becomes 2026-03-02), so the parts must come back unchanged.
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return undefined;

  const style = STYLES[lang.split("-")[0] ?? ""] ?? GREGORIAN;
  const text = new Intl.DateTimeFormat(style.locale, { calendar: style.calendar, year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(utc);

  return { datetime: `${match[1]}-${match[2]}-${match[3]}`, text };
}
