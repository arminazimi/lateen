// The performance budget reads a built fixture and must count the assets a route really loads: the
// base and page stylesheets, every island module reachable from the page's scripts, and inline
// JavaScript, but never a JSON data block. Its failures must name the route and asset class, because
// a bare byte total does not say what to fix.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  ASSET_CLASSES,
  type Budget,
  type Measurements,
  TOLERANCE_BYTES,
  budgetPath,
  classOf,
  compare,
  inventory,
} from "../scripts/performance-budget.ts";

const gzip = (text: string): number => gzipSync(Buffer.from(text), { level: 9 }).byteLength;

/** A built fixture folder with the asset tree a page can reference. */
function fixture(): { dir: string; html: string } {
  const dir = mkdtempSync(join(tmpdir(), "performance-budget-"));
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  write("assets/theme/base-aaaa.css", "body{color:red}");
  write("assets/theme/page-bbbb.css", ".tabs{display:flex}");
  write("assets/theme/islands/chrome/toc/client.js", 'import{key}from"./key.js";console.log(key)');
  write("assets/theme/islands/chrome/toc/key.js", "export const key = 1;");
  write("assets/theme/islands/components/tabs/client.js", 'import{sync}from"../code-tabs/sync.js";sync()');
  write("assets/theme/islands/components/code-tabs/sync.js", "export function sync(){}");
  const html = [
    '<!doctype html><html><head>',
    '<script>self.documentElement.dataset.theme="dark"</script>',
    '<script type="application/json" data-palette-actions>{"label":"Actions"}</script>',
    '<link rel="stylesheet" href="/assets/theme/base-aaaa.css">',
    '<link rel="stylesheet" href="/assets/theme/page-bbbb.css">',
    "</head><body>",
    '<script type="module" src="/assets/theme/islands/chrome/toc/client.js"></script>',
    '<script type="module" src="/assets/theme/islands/components/tabs/client.js"></script>',
    "</body></html>",
  ].join("");
  return { dir, html };
}

test("inventory counts both CSS bundles, each island module once, and inline JavaScript only", () => {
  const { dir, html } = fixture();
  try {
    const route = join(dir, "index.html");
    writeFileSync(route, html);
    const measured = inventory(dir, [{ url: "/", html: route }]);
    const result = measured["/"];
    assert.ok(result);
    assert.equal(result["css/base"].count, 1);
    assert.equal(result["css/base"].raw, Buffer.byteLength("body{color:red}"));
    assert.equal(result["css/base"].gzip, gzip("body{color:red}"));
    assert.equal(result["css/page"].count, 1);
    assert.equal(result["css/page"].raw, Buffer.byteLength(".tabs{display:flex}"));

    // The chrome island and the module it imports are two modules, counted once each.
    assert.equal(result["js/chrome"].count, 2);
    assert.equal(result["js/chrome"].raw, Buffer.byteLength('import{key}from"./key.js";console.log(key)') + Buffer.byteLength("export const key = 1;"));
    // The component island and the module it shares with code tabs are two more.
    assert.equal(result["js/components"].count, 2);

    // The theme script is inline JavaScript; the palette JSON is data, not work.
    assert.equal(result["js/inline"].count, 1);
    assert.equal(result["js/inline"].raw, Buffer.byteLength('self.documentElement.dataset.theme="dark"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A measurement with a single route and class, so a test can change one number. */
function measurement(assetClass: (typeof ASSET_CLASSES)[number], value: { raw: number; gzip: number; count: number }): Measurements {
  const route = Object.fromEntries(ASSET_CLASSES.map((name) => [name, { raw: 0, gzip: 0, count: 0 }])) as Measurements[string];
  route[assetClass] = value;
  return { "/": route };
}

const budgetOf = (measured: Measurements): Budget => ({ routes: structuredClone(measured) });

test("the budget passes at the baseline and within the gzip tolerance", () => {
  const measured = measurement("js/chrome", { raw: 100, gzip: 1000, count: 2 });
  const budget = budgetOf(measured);
  assert.deepEqual(compare(measured, budget), []);
  budget.routes["/"]!["js/chrome"] = { raw: 100, gzip: 1000 - TOLERANCE_BYTES, count: 2 };
  assert.deepEqual(compare(measured, budget), []);
});

test("a gzip or module growth names the route and the asset class", () => {
  const measured = measurement("js/components", { raw: 100, gzip: 1200, count: 3 });
  const budget = budgetOf(measurement("js/components", { raw: 100, gzip: 1000, count: 2 }));
  const failures = compare(measured, budget);
  assert.equal(failures.length, 2, failures.join("\n"));
  assert.ok(
    failures.some((failure) => failure.includes("route /") && failure.includes("js/components") && failure.includes("baseline is 2")),
    failures.join("\n"),
  );
  assert.ok(
    failures.some((failure) => failure.includes("route /") && failure.includes("js/components") && failure.includes("limit")),
    failures.join("\n"),
  );
});

test("a route the fixture adds or no longer builds is a failure", () => {
  const measured = measurement("css/base", { raw: 10, gzip: 10, count: 1 });
  const missing = budgetOf(measured);
  missing.routes["/gone/"] = structuredClone(missing.routes["/"]!);
  assert.ok(compare(measured, missing).some((failure) => failure.includes("/gone/") && failure.includes("no longer builds")));

  const extra: Budget = { routes: {} };
  assert.ok(compare(measured, extra).some((failure) => failure.includes("route /") && failure.includes("not in the budget")));
});

test("the committed budget covers every fixture route and asset class", () => {
  const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Budget;
  assert.ok(budget.note?.includes("not a product target"), "the budget should say what its numbers mean");
  assert.deepEqual(Object.keys(budget.routes).sort(), ["/", "/guide/", "/reference/"]);
  for (const [route, classes] of Object.entries(budget.routes)) {
    for (const assetClass of ASSET_CLASSES) assert.ok(classes[assetClass], `${route} has no ${assetClass} baseline`);
    assert.ok(classes["css/base"].gzip > 0, `${route} should load the base stylesheet`);
    assert.ok(classes["js/chrome"].count > 0, `${route} should load the chrome islands`);
  }
});

test("an unknown asset path is not silently counted in a class", () => {
  assert.throws(() => classOf("assets/theme/other-aaaa.css"), /not a base or page CSS bundle/);
});
