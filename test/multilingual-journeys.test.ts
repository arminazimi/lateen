import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { all, attrs, build, root, textOf, type BuiltSite } from "./integration-helpers.ts";

let site: BuiltSite;
let en: Document;
let fa: Document;

before(() => {
  site = build("integration");
  en = site.document("/guide/install/");
  fa = site.document("/fa/guide/install/");
});

after(() => rmSync(site.out, { recursive: true, force: true }));

test("each page states its language and direction, and its head names the real translations", () => {
  assert.equal(en.documentElement.getAttribute("lang"), "en");
  assert.equal(en.documentElement.getAttribute("dir"), "ltr");
  assert.equal(fa.documentElement.getAttribute("lang"), "fa");
  assert.equal(fa.documentElement.getAttribute("dir"), "rtl");

  const alternates = all(fa, "link[rel='alternate'][hreflang]").map((link) => [
    link.getAttribute("hreflang"),
    link.getAttribute("href"),
  ]);
  assert.deepEqual(alternates, [
    ["en", "https://example.com/guide/install/"],
    ["fa", "https://example.com/fa/guide/install/"],
    ["x-default", "https://example.com/guide/install/"],
  ]);
  assert.equal(fa.querySelector("link[rel='canonical']")?.getAttribute("href"), "https://example.com/fa/guide/install/");

  const enAlternates = all(en, "link[rel='alternate'][hreflang]").map((link) => link.getAttribute("href"));
  assert.deepEqual(enAlternates, ["https://example.com/guide/install/", "https://example.com/fa/guide/install/", "https://example.com/guide/install/"]);
});

test("switching language keeps the route, and switching version keeps the language", () => {
  const switcher = fa.querySelector("[data-language-switcher]");
  assert.equal(switcher?.getAttribute("aria-label"), "زبان");
  const links = all(switcher ?? fa, ".language-switcher-link").map((link) => [
    link.getAttribute("hreflang"),
    link.getAttribute("href"),
  ]);
  assert.deepEqual(links, [
    ["en", "/guide/install/"],
    ["fa", "/fa/guide/install/"],
  ]);
  assert.equal(fa.querySelector(".language-switcher-item--current .language-switcher-link")?.getAttribute("aria-current"), "true");

  const versions = fa.querySelector("[data-version-switcher], .version-switcher");
  assert.equal(versions?.getAttribute("aria-label"), "نسخه‌ها");
  assert.deepEqual(
    all(versions ?? fa, ".version-switcher-link").map((link) => link.getAttribute("href")),
    ["/fa/guide/legacy/", "/fa/guide/install/"],
  );
  assert.equal(fa.querySelector(".version-switcher-link[aria-current='true'] .version-switcher-version")?.textContent, "v2");

  assert.equal(fa.querySelector(".sidebar-nav")?.getAttribute("aria-label"), "ناوبری سایت");
  assert.equal(fa.querySelector(".drawer")?.getAttribute("aria-label"), "منو");
  assert.equal(fa.querySelector(".drawer-close")?.getAttribute("aria-label"), "بستن منو");
  assert.equal(fa.querySelector(".pager")?.getAttribute("aria-label"), "صفحهٔ قبل و بعد");
});

test("search is a named combobox in the page language with a live listbox", () => {
  const input = fa.querySelector("[data-search-input]");
  assert.ok(input);
  assert.equal(input.getAttribute("role"), "combobox");
  assert.equal(input.getAttribute("aria-haspopup"), "listbox");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  const controls = input.getAttribute("aria-controls");
  assert.ok(controls);
  assert.equal(fa.getElementById(controls)?.getAttribute("role"), "listbox");
  assert.equal(fa.getElementById(controls)?.getAttribute("aria-label"), "جست‌وجو");
  assert.equal(fa.querySelector("label[for='search-input']")?.textContent, "جست‌وجو");
  assert.equal(input.getAttribute("placeholder"), "جست‌وجو در مستندات");
  assert.equal(fa.querySelector("[data-search-open]")?.getAttribute("aria-label"), "جست‌وجو");
});

test("mixed prose, code, identifiers, dates, and form values keep their own direction and names", () => {
  const html = site.html("/fa/guide/install/");
  const css = all(fa, "link[rel='stylesheet']")
    .map((link) => site.file((link.getAttribute("href") ?? "").replace(/^\//, "")))
    .join("\n");
  assert.match(css, /\[dir=rtl\][^{]*\{[^}]*direction:\s*ltr[^}]*unicode-bidi:\s*isolate/);

  const code = fa.querySelector(".endpoint-path");
  assert.equal(code?.getAttribute("dir"), "ltr");
  const identifier = fa.querySelector(".doc-body code[dir='ltr']");
  assert.ok(identifier, "a Latin identifier in Persian prose is isolated");
  assert.equal(fa.querySelector(".version-switcher-value")?.getAttribute("dir"), "ltr");

  const times = all(fa, "time[datetime]");
  assert.ok(times.length >= 1);
  for (const time of times) {
    assert.match(time.getAttribute("datetime") ?? "", /^\d{4}-\d{2}-\d{2}/);
    assert.notEqual(time.getAttribute("aria-label"), null, "the exact date is the accessible value");
  }
  assert.ok(times.some((time) => time.querySelector("bdi")), "the recency sentence isolates its visible date");
  assert.match(html, /<bdi>Ada Lovelace<\/bdi>/, "a contributor name is isolated");
  assert.match(html, /<bdi>Reference<\/bdi>/, "a Latin pager title in Persian is isolated");

  const fieldset = fa.querySelector(".variables-form");
  assert.ok(fieldset);
  assert.equal(fa.querySelector(".variables-form-legend")?.textContent, "متغیرها");
  assert.match(textOf(fa.querySelector(".variables-form-hint")), /مرورگر/);
  for (const input of all(fieldset, ".variables-form-input")) {
    const id = input.getAttribute("id");
    assert.ok(id);
    assert.ok(fa.querySelector(`label[for="${id}"]`));
  }
  const host = fa.querySelector(".variables-form-input[name='host']");
  assert.equal(host?.getAttribute("type"), "text");
  assert.equal(host?.getAttribute("data-type"), "url");
  assert.equal(host?.getAttribute("dir"), null, "the input keeps the page direction and its value as written");
});

test("the contributor documentation states the translation fallback and bidi authoring rules", () => {
  const doc = readFileSync(join(root, "docs/internationalization.md"), "utf8");
  assert.match(doc, /fallback/i);
  assert.match(doc, /bidi|bidirectional/i);
  assert.match(doc, /direction/i);
  assert.match(doc, /isolation|isolate/i);
  assert.match(doc, /missing translation|missing message|missing catalog/i);
});
