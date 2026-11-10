import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDate } from "../src/dates.ts";

test("a Persian page shows the Jalali calendar in Persian numerals", () => {
  assert.deepEqual(calendarDate("2026-11-09", "fa"), { datetime: "2026-11-09", text: "۱۸ آبان ۱۴۰۵" });
});

test("an Arabic page shows the Hijri calendar in Arabic-Indic numerals", () => {
  assert.deepEqual(calendarDate("2026-11-09", "ar"), { datetime: "2026-11-09", text: "٣٠ جمادى الأولى ١٤٤٨ هـ" });
});

test("an English page shows the Gregorian calendar", () => {
  assert.deepEqual(calendarDate("2026-11-09", "en"), { datetime: "2026-11-09", text: "November 9, 2026" });
});

test("a regional language tag uses its primary language's calendar", () => {
  assert.equal(calendarDate("2026-11-09", "fa-IR")?.text, "۱۸ آبان ۱۴۰۵");
  assert.equal(calendarDate("2026-11-09", "ar-EG")?.text, "٣٠ جمادى الأولى ١٤٤٨ هـ");
  assert.equal(calendarDate("2026-11-09", "en-GB")?.text, "November 9, 2026");
});

test("a language without a calendar of its own falls back to Gregorian", () => {
  assert.equal(calendarDate("2026-11-09", "de")?.text, "November 9, 2026");
});

test("a date-time keeps only its ISO date", () => {
  assert.deepEqual(calendarDate("2026-11-09T23:30:00Z", "en"), { datetime: "2026-11-09", text: "November 9, 2026" });
});

test("dates at the edges of a year keep their day", () => {
  // Formatting is pinned to UTC, so a build in a time zone west of UTC does not shift the day back.
  assert.equal(calendarDate("2026-01-01", "en")?.text, "January 1, 2026");
  assert.equal(calendarDate("2026-12-31", "en")?.text, "December 31, 2026");
});

test("values that are not real calendar dates format to nothing", () => {
  for (const value of ["", "not a date", "2026-13-01", "2026-02-30", "2026-11-9", "11/09/2026", "2026-11-09x"]) {
    assert.equal(calendarDate(value, "en"), undefined, value);
    assert.equal(calendarDate(value, "fa"), undefined, value);
  }
});
