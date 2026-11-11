import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { languages, patternOf, stringsOf, t } from "../i18n/index.ts";

const english = stringsOf("en");

/** Runs `run` while collecting everything written to `console.warn`. */
function warningsFrom(run: () => void): string[] {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    run();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

/** Runs `run` with `NODE_ENV` set to `value` (or unset), then restores the previous value. */
function withNodeEnv<T>(value: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test("the theme ships English, Persian, and Arabic", () => {
  assert.deepEqual([...languages], ["en", "fa", "ar"]);
});

test("t returns the language's text and fills placeholders", () => {
  assert.equal(t("fa", "search"), stringsOf("fa").search);
  assert.equal(t("ar", "search_count", { n: 3 }), (stringsOf("ar").search_count ?? "").replace("{n}", "3"));
  assert.equal(t("en", "edit_prompt", { source: "a.md", text: "x" }), 'Edit a.md. Current text: "x". Change:');
});

test("a regional language reads its primary catalog", () => {
  assert.equal(t("fa-IR", "search"), stringsOf("fa").search);
  assert.equal(t("AR-eg", "search"), stringsOf("ar").search);
  assert.equal(t("en-GB", "search"), english.search);
  assert.deepEqual(
    warningsFrom(() => {
      t("fa-IR", "search");
      t("AR-eg", "search");
    }),
    [],
  );
});

test("a language the theme does not ship falls back to English and reports it once", () => {
  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      assert.equal(t("nl", "search"), english.search);
      assert.equal(t("nl", "search"), english.search);
    }),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /no "nl" catalog/);
});

test("an unknown key falls back to itself and reports it once", () => {
  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      assert.equal(t("en", "test_only.unknown_key"), "test_only.unknown_key");
      assert.equal(t("fa", "test_only.unknown_key"), "test_only.unknown_key");
    }),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /unknown message key "test_only\.unknown_key"/);
});

test("a placeholder with no value is dropped, not rendered, and reported", () => {
  let text = "";
  const warnings = withNodeEnv("development", () =>
    warningsFrom(() => {
      text = t("en", "search_count");
    }),
  );
  assert.doesNotMatch(text, /\{\w+\}/);
  assert.equal(text.trim(), "results");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /"search_count" has no value for \{n\}/);
});

test("production builds stay quiet about missing messages", () => {
  const warnings = withNodeEnv("production", () =>
    warningsFrom(() => {
      assert.equal(t("en", "test_only.production_key"), "test_only.production_key");
      assert.equal(t("xx", "search"), english.search);
    }),
  );
  assert.deepEqual(warnings, []);
});

test("patternOf keeps placeholders for client code to fill", () => {
  assert.equal(patternOf("en", "version_diff_count"), "Change {current} of {total}");
  assert.equal(patternOf("fa", "search_count"), stringsOf("fa").search_count);
  assert.equal(patternOf("ar", "edit_prompt"), stringsOf("ar").edit_prompt);
});

test("a value facing the other way is isolated so it cannot reorder the message", () => {
  assert.ok(t("en", "trust_reviewed_by", { reviewer: "سارا" }).includes("\u2068سارا\u2069"));
  assert.ok(t("fa", "trust_reviewed_by", { reviewer: "Sara" }).includes("\u2068Sara\u2069"));
  assert.equal(t("en", "trust_reviewed_by", { reviewer: "Sara" }), "Reviewed by Sara");
  assert.equal(
    t("fa", "trust_reviewed_by", { reviewer: "سارا" }),
    (stringsOf("fa").trust_reviewed_by ?? "").replace("{reviewer}", "سارا"),
  );
  assert.doesNotMatch(t("fa", "api_example", { n: 3 }), /[\u2068\u2069]/, "a number needs no isolation");
});

test("interpolated values are text and cannot inject markup", () => {
  const markup = "<script>alert(1)</script>";
  const out = render(
    h("p", { title: t("en", "trust_reviewed_by", { reviewer: '"><b>title</b>' }) }, t("en", "trust_reviewed_by", { reviewer: markup })),
  );
  assert.match(out, /&lt;script/);
  assert.doesNotMatch(out, /<script/);
  assert.doesNotMatch(out, /<b>/);
  assert.match(out, /&lt;b/);
});

test("a value that looks like a placeholder stays text", () => {
  assert.equal(t("en", "trust_reviewed_by", { reviewer: "{version}" }), "Reviewed by {version}");
});

test("every message key the theme names in source exists in the catalog", () => {
  const root = new URL("../", import.meta.url);
  const missing: string[] = [];
  let found = 0;
  for (const dir of ["chrome", "components", "layouts", "src"]) {
    for (const name of readdirSync(new URL(`${dir}/`, root), { recursive: true, encoding: "utf8" })) {
      if (!name.endsWith(".ts")) continue;
      const source = readFileSync(new URL(`${dir}/${name}`, root), "utf8");
      if (!source.includes("i18n/index.ts")) continue;
      for (const match of source.matchAll(/\b(?:t|patternOf)\(\s*[^,()]+,\s*"([^"]+)"/g)) {
        found += 1;
        const key = match[1] ?? "";
        if (!(key in english)) missing.push(`${dir}/${name}: ${key}`);
      }
    }
  }
  assert.ok(found > 0, "the scan finds message calls");
  assert.deepEqual(missing, []);
});
