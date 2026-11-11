/**
 * Calendar dates for the theme's "last updated" line. Persian pages show the Jalali (Persian) calendar,
 * Arabic pages the Hijri (Islamic) calendar, and English pages the Gregorian calendar. A BCP 47
 * `-u-ca-` or `-u-nu-` preference that the runtime supports overrides those defaults; other locales
 * keep their own month names on the Gregorian calendar. Formatting uses `Intl.DateTimeFormat`, so no
 * dependency is needed.
 */

/**
 * How a language writes its calendar date: the locale sets the month names, the calendar the system,
 * and the numbering system the digit shapes. The numbering system is explicit so a host whose ICU
 * defaults change cannot quietly swap Persian or Arabic-Indic digits for Latin ones.
 */
interface DateStyle {
  locale: string;
  calendar: string;
  numberingSystem: string;
}

const GREGORIAN: DateStyle = { locale: "en-US", calendar: "gregory", numberingSystem: "latn" };

const STYLES: Record<string, DateStyle> = {
  ar: { locale: "ar-SA", calendar: "islamic", numberingSystem: "arab" },
  en: GREGORIAN,
  fa: { locale: "fa-IR", calendar: "persian", numberingSystem: "arabext" },
};

/** Calendars and numbering systems this runtime can format; anything else is an unsupported preference. */
const CALENDARS: ReadonlySet<string> = new Set(Intl.supportedValuesOf("calendar"));
const NUMBERING_SYSTEMS: ReadonlySet<string> = new Set(Intl.supportedValuesOf("numberingSystem"));

/**
 * The style for `lang`, honoring `-u-ca-` and `-u-nu-` preferences that this runtime supports.
 * Malformed tags use the default style, and an unsupported preference falls back to the language's
 * safe default, so a bad tag never throws.
 */
function dateStyle(lang: string): DateStyle {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(lang);
  } catch {
    return GREGORIAN;
  }

  // An unknown but valid language keeps its own month names, on the deterministic Gregorian/Latin fallback.
  const base = STYLES[locale.language] ?? { locale: locale.baseName, calendar: "gregory", numberingSystem: "latn" };
  const calendar = locale.calendar;
  const numberingSystem = locale.numberingSystem;

  return {
    locale: base.locale,
    calendar: calendar !== undefined && CALENDARS.has(calendar) ? calendar : base.calendar,
    numberingSystem:
      numberingSystem !== undefined && NUMBERING_SYSTEMS.has(numberingSystem) ? numberingSystem : base.numberingSystem,
  };
}

/** Formatting is pinned to UTC, so the build machine's time zone cannot move a date a day. */
const TIME_ZONE = "UTC";

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

  const style = dateStyle(lang);
  const text = new Intl.DateTimeFormat(style.locale, {
    calendar: style.calendar,
    numberingSystem: style.numberingSystem,
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(utc);

  return { datetime: `${match[1]}-${match[2]}-${match[3]}`, text };
}
