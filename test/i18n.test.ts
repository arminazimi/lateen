import assert from "node:assert/strict";
import { test } from "node:test";
import { languages, stringsOf, t } from "../i18n/index.ts";

const english = stringsOf("en");
const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

test("the theme ships English, Persian, and Arabic", () => {
  assert.deepEqual([...languages], ["en", "fa", "ar"]);
});

test("every language has every key that English has, and no others", () => {
  for (const lang of languages) {
    const table = stringsOf(lang);
    assert.deepEqual(Object.keys(english).filter((key) => !(key in table)), [], `${lang} is missing keys`);
    assert.deepEqual(Object.keys(table).filter((key) => !(key in english)), [], `${lang} has keys English lacks`);
  }
});

test("every string is non-empty and keeps the placeholders English uses", () => {
  for (const lang of languages) {
    const table = stringsOf(lang);
    for (const [key, text] of Object.entries(table)) {
      assert.notEqual(text.trim(), "", `${lang}.${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english[key] ?? ""), `${lang}.${key} placeholders`);
    }
  }
});

test("keys are in alphabetical order in every language file", () => {
  for (const lang of languages) {
    const keys = Object.keys(stringsOf(lang));
    assert.deepEqual(keys, [...keys].sort(), `${lang} keys`);
  }
});

test("t returns the language's text and fills placeholders", () => {
  assert.equal(t("fa", "search"), stringsOf("fa").search);
  assert.equal(t("ar", "search_count", { n: 3 }), (stringsOf("ar").search_count ?? "").replace("{n}", "3"));
  assert.equal(t("en", "edit_prompt", { source: "a.md", text: "x" }), 'Edit a.md. Current text: "x". Change:');
});

test("t leaves unknown placeholders and falls back to English, then to the key", () => {
  assert.equal(t("en", "search_count"), "{n} results");
  assert.equal(t("de", "search"), english.search);
  assert.equal(t("en", "no.such.key"), "no.such.key");
  assert.equal(t("fa", "no.such.key"), "no.such.key");
});
