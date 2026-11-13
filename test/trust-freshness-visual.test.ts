import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { all, attrs, build, root, textOf, type BuiltSite } from "./integration-helpers.ts";

const TRUST_LEVELS = new Set(["verified", "partial", "unreviewed", "unknown"]);
const EXAMPLE_STATES = new Set(["passed", "partial", "unrun", "failed", "none", "invalid", "absent"]);
const DRIFT_STATES = new Set(["clean", "drifting", "stale", "unavailable"]);
const DRIFT_SEVERITIES = new Set(["error", "warning", "info", "unknown"]);
const DIFF_STATES = new Set(["changes", "incomplete", "unchanged", "unavailable"]);
const DATE_STATUSES = new Set(["valid", "future", "invalid"]);

let site: BuiltSite;

before(() => {
  site = build("integration");
});

after(() => rmSync(site.out, { recursive: true, force: true }));

/** Reads one CSS file from the theme, for the non-visual rules a rendered page cannot prove. */
function css(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("trust, drift, examples, version, and recency use one documented vocabulary", () => {
  const clean = site.document("/guide/install/");
  const stale = site.document("/guide/legacy/");

  const levels = attrs(clean, "[data-trust-level]", "data-trust-level").concat(attrs(stale, "[data-trust-level]", "data-trust-level"));
  assert.deepEqual(levels, ["verified", "partial"]);
  for (const level of levels) assert.ok(TRUST_LEVELS.has(level));

  const examples = attrs(clean, "[data-trust-examples]", "data-trust-examples").concat(
    attrs(stale, "[data-trust-examples]", "data-trust-examples"),
  );
  assert.deepEqual(examples, ["passed", "unrun"]);
  for (const state of examples) assert.ok(EXAMPLE_STATES.has(state));

  const driftStates = attrs(clean, "[data-drift-state]", "data-drift-state").concat(
    attrs(stale, "[data-drift-state]", "data-drift-state"),
  );
  assert.deepEqual(driftStates, ["drifting", "unavailable"]);
  for (const state of driftStates) assert.ok(DRIFT_STATES.has(state));

  const severities = attrs(clean, "[data-drift-severity]", "data-drift-severity").concat(
    attrs(stale, "[data-drift-severity]", "data-drift-severity"),
  );
  for (const severity of severities) assert.ok(DRIFT_SEVERITIES.has(severity));

  const dates = attrs(clean, "[data-date-status]", "data-date-status").concat(
    attrs(stale, "[data-date-status]", "data-date-status"),
  );
  assert.deepEqual(dates, ["valid", "invalid"]);
  for (const status of dates) assert.ok(DATE_STATUSES.has(status));

  const diff = clean.querySelector("[data-diff-state]")?.getAttribute("data-diff-state");
  assert.ok(diff && DIFF_STATES.has(diff));
  assert.equal(clean.querySelector("[data-variant]")?.getAttribute("data-variant"), "changed");
  assert.equal(stale.querySelector("[data-page-status]")?.getAttribute("data-page-status"), "deprecated");
});

test("every state carries words and an aria-hidden icon, never color alone", () => {
  const clean = site.document("/guide/install/");
  const stale = site.document("/guide/legacy/");

  assert.match(textOf(clean.querySelector(".trust-panel-level")), /Trust: Verified/);
  assert.match(textOf(stale.querySelector(".trust-panel-level")), /Trust: Partial/);
  assert.match(textOf(clean.querySelector(".drift-banner-what")), /cites code that has changed/);
  assert.match(textOf(stale.querySelector(".drift-banner-what")), /has not been checked/);
  assert.match(textOf(clean.querySelector(".tested-chip-label")), /Tested/);
  assert.match(textOf(clean.querySelector(".version-badge-sr")), /Changed in version 0\.2\.0/);
  assert.match(textOf(stale.querySelector(".last-updated-date-unavailable")), /Date unknown/);
  assert.doesNotMatch(stale.querySelector(".last-updated-date-unavailable")?.outerHTML ?? "", /<time /);

  for (const icon of all(clean, ".trust-panel-icon, .drift-banner-icon, .tested-chip-icon, .version-badge-icon")) {
    assert.equal(icon.getAttribute("aria-hidden"), "true");
  }
  for (const kind of all(clean, ".version-diff-kind")) {
    assert.notEqual(textOf(kind), "", "a diff kind is written next to its icon");
  }
  assert.equal(clean.querySelector(".version-badge-value")?.getAttribute("aria-hidden"), "true");
});

test("combined trust, drift, status, version, and recency states stay readable on one page", () => {
  const stale = site.document("/guide/legacy/");
  const article = stale.querySelector("article.doc");
  assert.ok(article);
  const text = textOf(article);

  for (const expected of ["Deprecated", "Trust: Partial", "Not checked", "Date unknown", "This page is no longer maintained."]) {
    assert.ok(text.includes(expected), `the legacy page says ${JSON.stringify(expected)}`);
  }
  assert.match(textOf(stale.querySelector(".trust-panel-examples")), /2 not run/);
  assert.equal(stale.querySelector(".drift-banner")?.getAttribute("data-drift-state"), "unavailable");
  assert.equal(stale.querySelector(".trust-panel")?.getAttribute("data-trust-level"), "partial");
});

test("the evidence surfaces are prepared for forced colors, print, zoom, RTL, and reduced motion", () => {
  const forced = css("styles/forced-colors.css");
  for (const selector of [".trust-panel", ".drift-banner", ".tested-chip", ".version-badge", ".version-diff"]) {
    assert.ok(forced.includes(selector), `forced-colors.css names ${selector}`);
  }
  assert.match(forced, /\.drift-banner[\s\S]*border-inline-start-color:\s*CanvasText/);
  assert.match(forced, /\.trust-panel-icon[\s\S]*Color|\.trust-panel-icon[\s\S]*color:/);

  const print = css("styles/print.css");
  for (const selector of [".trust-panel", ".drift-banner", ".tested-chip", ".version-badge", ".version-diff"]) {
    assert.ok(print.includes(selector), `print.css names ${selector}`);
  }

  const reduced = css("styles/tokens.css");
  assert.match(reduced, /@media \(prefers-reduced-motion: reduce\)/);
  for (const path of [
    "styles/parts-trust-panel.css",
    "styles/parts-drift-banner.css",
    "components/tested-chip/style.css",
    "components/version-badge/style.css",
    "components/version-diff/style.css",
  ]) {
    const surface = css(path);
    assert.doesNotMatch(surface, /(^|[;{\s])(left|right)\s*:/, `${path} uses logical properties`);
    for (const match of surface.matchAll(/transition:[^;]+/g)) assert.match(match[0], /var\(--motion-/);
    assert.doesNotMatch(surface, /animation:/, `${path} does not animate without a reduced-motion fallback`);
  }
});

test("the trust panel's evidence is in the server-rendered page, not created by JavaScript", () => {
  const clean = site.document("/guide/install/");
  const panel = clean.querySelector(".trust-panel");
  assert.equal(panel?.tagName, "DETAILS");
  assert.equal(panel?.querySelector("summary")?.tagName, "SUMMARY");
  assert.match(textOf(panel), /3 of 3 examples passed/);
  assert.match(textOf(panel), /1 drift finding/);
  assert.equal(panel?.getAttribute("data-trust-build"), "build-42");
  assert.equal(panel?.getAttribute("data-trust-generated"), "2026-03-06");
  assert.equal(panel?.getAttribute("data-trust-reviewed"), "2026-03-04");

  const cssText = all(clean, "link[rel='stylesheet']")
    .map((link) => site.file((link.getAttribute("href") ?? "").replace(/^\//, "")))
    .join("\n");
  assert.match(cssText, /\.trust-panel-chip/);
  assert.match(cssText, /@media \(forced-colors:active\)/);
});
