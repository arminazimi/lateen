import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { languages, stringsOf, type Language } from "../i18n/index.ts";

type Schema = {
  type?: string;
  minProperties?: number;
  propertyNames?: { pattern?: string };
  additionalProperties?: { type?: string; minLength?: number; pattern?: string };
};

const schema = JSON.parse(readFileSync(new URL("../schema/i18n.schema.json", import.meta.url), "utf8")) as Schema;

const english = stringsOf("en");

/** The message file as text, so duplicate keys (which `JSON.parse` hides) are still visible. */
function readText(lang: Language): string {
  return readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), "utf8");
}

/** The `{name}` placeholders in a message, each once, sorted. */
function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}

/** Checks one catalog against `schema/i18n.schema.json` and returns what is wrong with it. */
function schemaErrors(catalog: Readonly<Record<string, string>>): string[] {
  const errors: string[] = [];
  if (schema.type === "object" && (typeof catalog !== "object" || catalog === null)) errors.push("is not an object");
  const keys = Object.keys(catalog);
  if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
    errors.push(`has ${keys.length} keys, wants at least ${schema.minProperties}`);
  }
  const keyPattern = schema.propertyNames?.pattern === undefined ? undefined : new RegExp(schema.propertyNames.pattern);
  const valueType = schema.additionalProperties?.type;
  const valueLength = schema.additionalProperties?.minLength ?? 0;
  const valuePattern =
    schema.additionalProperties?.pattern === undefined ? undefined : new RegExp(schema.additionalProperties.pattern);
  for (const key of keys) {
    if (keyPattern !== undefined && !keyPattern.test(key)) errors.push(`${key}: key does not match the contract`);
    const text = catalog[key] ?? "";
    if (valueType === "string" && typeof text !== "string") errors.push(`${key}: value is not a string`);
    if (text.length < valueLength) errors.push(`${key}: value is empty`);
    if (valuePattern !== undefined && !valuePattern.test(text)) errors.push(`${key}: value has no text`);
  }
  return errors;
}

test("every catalog satisfies schema/i18n.schema.json", () => {
  for (const lang of languages) assert.deepEqual(schemaErrors(stringsOf(lang)), [], `${lang}.json`);
});

test("every language has every key that English has, and no others", () => {
  for (const lang of languages) {
    const table = stringsOf(lang);
    assert.deepEqual(Object.keys(english).filter((key) => !(key in table)), [], `${lang} is missing keys`);
    assert.deepEqual(Object.keys(table).filter((key) => !(key in english)), [], `${lang} has keys English lacks`);
  }
});

test("every message is non-empty and keeps the placeholders English uses", () => {
  for (const lang of languages) {
    const table = stringsOf(lang);
    for (const [key, text] of Object.entries(table)) {
      assert.notEqual(text.trim(), "", `${lang}.${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english[key] ?? ""), `${lang}.${key} placeholders`);
      assert.equal(text.replace(/\{\w+\}/g, "").match(/[{}]/), null, `${lang}.${key} has a stray brace`);
    }
  }
});

test("keys are in alphabetical order in every language file", () => {
  for (const lang of languages) {
    const keys = Object.keys(stringsOf(lang));
    assert.deepEqual(keys, [...keys].sort(), `${lang} keys`);
  }
});

test("no language file repeats a key", () => {
  for (const lang of languages) {
    const written = [...readText(lang).matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g)].map((match) => match[1]);
    assert.deepEqual(written, Object.keys(stringsOf(lang)), `${lang} has a duplicate or unparsed key`);
  }
});
