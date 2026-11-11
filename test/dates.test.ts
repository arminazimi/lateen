import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDate } from "../src/dates.ts";

const DAY = "2026-11-09";

test("a Persian page shows the Jalali calendar in Persian numerals", () => {
  assert.deepEqual(calendarDate(DAY, "fa"), { datetime: DAY, text: "۱۸ آبان ۱۴۰۵" });
});

test("an Arabic page shows the Hijri calendar in Arabic-Indic numerals", () => {
  assert.deepEqual(calendarDate(DAY, "ar"), { datetime: DAY, text: "٣٠ جمادى الأولى ١٤٤٨ هـ" });
});

test("an English page shows the Gregorian calendar", () => {
  assert.deepEqual(calendarDate(DAY, "en"), { datetime: DAY, text: "November 9, 2026" });
});

test("a regional language tag uses its primary language's calendar", () => {
  assert.equal(calendarDate(DAY, "fa-IR")?.text, "۱۸ آبان ۱۴۰۵");
  assert.equal(calendarDate(DAY, "fa-AF")?.text, "۱۸ آبان ۱۴۰۵");
  assert.equal(calendarDate(DAY, "ar-EG")?.text, "٣٠ جمادى الأولى ١٤٤٨ هـ");
  assert.equal(calendarDate(DAY, "ar-SA")?.text, "٣٠ جمادى الأولى ١٤٤٨ هـ");
  assert.equal(calendarDate(DAY, "en-GB")?.text, "November 9, 2026");
});

test("a valid language without a calendar of its own keeps its month names on Gregorian", () => {
  assert.equal(calendarDate(DAY, "de")?.text, "9. November 2026");
  assert.equal(calendarDate(DAY, "ja")?.text, "2026年11月9日");
  assert.equal(calendarDate(DAY, "zh-Hant-TW")?.text, "2026年11月9日");
});

test("an explicit numbering-system preference overrides the language's digits", () => {
  assert.deepEqual(calendarDate(DAY, "fa-IR-u-nu-latn"), { datetime: DAY, text: "18 آبان 1405" });
  assert.equal(calendarDate(DAY, "ar-u-nu-latn")?.text, "30 جمادى الأولى 1448 هـ");
  assert.equal(calendarDate(DAY, "en-u-nu-arab")?.text, "November ٩, ٢٠٢٦");
});

test("an explicit calendar preference overrides the language's calendar", () => {
  assert.equal(calendarDate(DAY, "fa-IR-u-ca-gregory")?.text, "۹ نوامبر ۲۰۲۶");
  assert.equal(calendarDate(DAY, "ar-u-ca-gregory")?.text, "٩ نوفمبر ٢٠٢٦");
  assert.equal(calendarDate(DAY, "en-u-ca-persian")?.text, "Aban 18, 1405 AP");
});

test("calendar and numbering preferences combine on a regional tag", () => {
  assert.deepEqual(calendarDate(DAY, "fa-IR-u-ca-gregory-nu-latn"), { datetime: DAY, text: "9 نوامبر 2026" });
});

test("an unsupported calendar or numbering system falls back to the language's safe default", () => {
  assert.equal(calendarDate(DAY, "en-u-ca-foo")?.text, calendarDate(DAY, "en")?.text);
  assert.equal(calendarDate(DAY, "fa-u-nu-roman")?.text, calendarDate(DAY, "fa")?.text);
  assert.equal(calendarDate(DAY, "fa-u-nu-foobar")?.text, calendarDate(DAY, "fa")?.text);
});

test("malformed language tags fall back to the default style without throwing", () => {
  const expected = { datetime: DAY, text: "November 9, 2026" };
  for (const lang of ["", "not a tag", "en_US", "en-u-ca-", "en-u-nu-", "fa-IR-u-"]) {
    assert.deepEqual(calendarDate(DAY, lang), expected, lang);
  }
});

test("a date-time keeps only its ISO date", () => {
  assert.deepEqual(calendarDate(`${DAY}T23:30:00Z`, "en"), { datetime: DAY, text: "November 9, 2026" });
  assert.equal(calendarDate(`${DAY}T12:00:00`, "fa-IR-u-nu-latn")?.datetime, DAY);
});

test("the calendar day is the one the author wrote, not one shifted by a time-zone offset", () => {
  // No local time zone is read: the written date is the day, and the machine value repeats it.
  for (const value of [`${DAY}T23:30:00-05:00`, `${DAY}T00:30:00+14:00`, `${DAY}T12:00:00`]) {
    assert.deepEqual(calendarDate(value, "en"), { datetime: DAY, text: "November 9, 2026" }, value);
  }
});

test("each language writes its own digit shapes, and the machine value stays ASCII ISO", () => {
  const text = (lang: string): string => calendarDate(DAY, lang)?.text ?? "";

  assert.match(text("fa"), /[۰-۹]/, "Persian digits");
  assert.doesNotMatch(text("fa"), /[0-9]/, "Persian text has Latin digits");
  assert.match(text("ar"), /[٠-٩]/, "Arabic-Indic digits");
  assert.doesNotMatch(text("ar"), /[0-9]/, "Arabic text has Latin digits");
  assert.match(text("en"), /[0-9]/, "Latin digits");

  // The `datetime` attribute is machine-readable: ASCII digits and ISO order, whatever the display.
  for (const lang of ["en", "fa", "ar", "fa-IR", "ar-EG", "de", "fa-IR-u-nu-latn", "ar-u-ca-gregory"]) {
    assert.equal(calendarDate(DAY, lang)?.datetime, DAY, lang);
  }
});

test("dates at the edges of a year keep their day", () => {
  // Formatting is pinned to UTC, so a build in a time zone west of UTC does not shift the day back.
  assert.equal(calendarDate("2026-01-01", "en")?.text, "January 1, 2026");
  assert.equal(calendarDate("2026-12-31", "en")?.text, "December 31, 2026");
});

test("leap days exist only in leap years", () => {
  assert.equal(calendarDate("2024-02-29", "en")?.text, "February 29, 2024");
  assert.equal(calendarDate("2024-02-29", "fa")?.datetime, "2024-02-29");
  assert.equal(calendarDate("2024-02-29", "ar")?.datetime, "2024-02-29");
  assert.equal(calendarDate("2000-02-29", "en")?.text, "February 29, 2000");
  assert.equal(calendarDate("2023-02-29", "en"), undefined);
  assert.equal(calendarDate("1900-02-29", "fa"), undefined);
});

test("values that are not real calendar dates format to nothing", () => {
  for (const value of [
    "",
    "not a date",
    "2026-13-01",
    "2026-00-01",
    "2026-02-30",
    "2026-04-31",
    "2024-02-30",
    "2026-11-9",
    "11/09/2026",
    "2026-11-09x",
  ]) {
    assert.equal(calendarDate(value, "en"), undefined, value);
    assert.equal(calendarDate(value, "fa"), undefined, value);
    assert.equal(calendarDate(value, "ar"), undefined, value);
  }
});

test("formatting the same date twice is deterministic", () => {
  for (const lang of ["en", "fa", "ar", "de", "ja", "fa-IR-u-ca-gregory-nu-latn", "en-u-ca-foo"]) {
    const first = calendarDate(DAY, lang);
    assert.deepEqual(calendarDate(DAY, lang), first, lang);
  }
});
