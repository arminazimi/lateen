// The performance budget reads a built fixture and must count the assets a route really loads: the
// base and page stylesheets, every island module reachable from the page's scripts, inline JavaScript,
// and the self-hosted font files those stylesheets declare. A font is one response per file per route,
// so a new or enlarged face fails the named route and class while a duplicated, commented-out, or
// local-only face moves no bytes. Its failures must name the route and asset class, because a bare byte
// total does not say what to fix.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  ASSET_CLASSES,
  type Budget,
  type BuiltPage,
  FONT_CLASS,
  type FontAsset,
  type Measurements,
  TOLERANCE_BYTES,
  budgetPath,
  classOf,
  compare,
  compareFonts,
  formatFonts,
  fontFaces,
  inventory,
  outputUrl,
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

    // Nothing declares a face here, so the font class is an empty set rather than a guess.
    assert.deepEqual(result[FONT_CLASS].assets, []);
    assert.equal(result[FONT_CLASS].count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** An `@font-face` the way the built theme writes one. */
const faceBlock = (family: string, weight: string, url: string): string =>
  `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: optional; src: url("${url}") format("woff2"); }`;

/** A built output folder holding `files` and one page whose HTML is `html`. */
function output(files: Record<string, string>, html: string): { dir: string; route: BuiltPage } {
  const dir = mkdtempSync(join(tmpdir(), "performance-fonts-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const file = join(dir, "index.html");
  writeFileSync(file, html);
  return { dir, route: { url: "/", html: file } };
}

const styleLink = (href: string): string => `<link rel="stylesheet" href="${href}">`;

test("a route measures the fonts its stylesheets declare, once per file and with their context", () => {
  const geist = "assets/theme/fonts/geist-sans-400-normal.woff2";
  const mono = "assets/theme/fonts/geist-mono-400-normal.woff2";
  const { dir, route } = output(
    {
      // Two faces of one file, a `local()` fallback face with nothing to download, and a commented-out
      // face whose file the build never emitted: none of them may add a response.
      "assets/theme/base-aaaa.css": [
        faceBlock("Geist", "400", `/${geist}`),
        faceBlock("Geist", "700", `/${geist}`),
        '@font-face { font-family: "Geist Fallback"; src: local("Arial"); }',
        `/* ${faceBlock("Retired", "400", "/assets/theme/fonts/retired.woff2")} */`,
      ].join("\n"),
      // The page bundle repeats the Geist file and adds its own.
      "assets/theme/page-bbbb.css": [faceBlock("Geist", "400", `/${geist}`), faceBlock("Geist Mono", "400", `/${mono}`)].join("\n"),
      [geist]: "geist-bytes",
      [mono]: "mono-bytes-longer",
    },
    [
      "<!doctype html><html><head>",
      // A preload of the same file is a second reference, not a second transfer.
      `<link rel="preload" href="/${geist}" as="font" type="font/woff2" crossorigin>`,
      styleLink("/assets/theme/base-aaaa.css"),
      styleLink("/assets/theme/page-bbbb.css"),
      "</head><body></body></html>",
    ].join(""),
  );
  try {
    const result = inventory(dir, [route])["/"];
    assert.ok(result);
    const fonts = result[FONT_CLASS];
    assert.equal(fonts.count, 2, "two files, however many faces and references ask for them");
    assert.equal(fonts.raw, Buffer.byteLength("geist-bytes") + Buffer.byteLength("mono-bytes-longer"));
    assert.equal(fonts.gzip, gzip("geist-bytes") + gzip("mono-bytes-longer"));
    assert.deepEqual(
      fonts.assets?.map((asset) => asset.path),
      [mono, geist],
      "the rows come back in path order, whatever order the stylesheets declare them in",
    );
    const first = fonts.assets?.[1];
    assert.ok(first);
    assert.equal(first.path, geist);
    assert.equal(first.url, `/${geist}`);
    assert.equal(first.stylesheet, "assets/theme/base-aaaa.css");
    assert.equal(first.family, "Geist");
    assert.equal(first.weight, "400");
    assert.equal(first.style, "normal");
    assert.equal(first.display, "optional");
    assert.equal(first.format, "woff2");
    assert.equal(first.raw, Buffer.byteLength("geist-bytes"));
    assert.equal(first.gzip, gzip("geist-bytes"));
    // The stylesheets are still measured as CSS; the font class holds only the font responses.
    assert.equal(result["css/base"].count, 1);
    assert.equal(result["css/page"].count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("font and stylesheet URLs resolve through the site's base path", () => {
  const { dir, route } = output(
    {
      "assets/theme/base-aaaa.css": faceBlock("Geist", "400", "/docs/assets/theme/fonts/geist.woff2"),
      "assets/theme/fonts/geist.woff2": "geist-bytes",
    },
    `${styleLink("/docs/assets/theme/base-aaaa.css")}<body></body>`,
  );
  try {
    const result = inventory(dir, [route])["/"];
    assert.ok(result);
    assert.equal(result["css/base"].count, 1, "the base path is not part of the output layout");
    assert.deepEqual(result[FONT_CLASS].assets?.map((asset) => asset.path), ["assets/theme/fonts/geist.woff2"]);
    assert.equal(result[FONT_CLASS].gzip, gzip("geist-bytes"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a relative or escaped font URL names the file it points at", () => {
  assert.equal(outputUrl("/assets/theme/fonts/a%20b.woff2"), "assets/theme/fonts/a b.woff2");
  assert.equal(outputUrl("/assets/theme/fonts/a\\20 b.woff2"), "assets/theme/fonts/a b.woff2");
  assert.equal(outputUrl("../fonts/a.woff2?v=1#x", "assets/theme"), "assets/fonts/a.woff2");
  assert.equal(outputUrl("assets/theme/fonts/a.woff2"), "assets/theme/fonts/a.woff2");
  assert.throws(() => outputUrl("/assets/theme/fonts/bad%zz.woff2"), /malformed URL escape/);
  assert.throws(() => outputUrl("https://cdn.example/a.woff2"), /external assets are outside this budget/);
  assert.throws(() => outputUrl("../../outside.woff2"), /does not point into the built output/);

  const { dir, route } = output(
    {
      "assets/theme/base-aaaa.css": [
        faceBlock("Geist", "400", "/assets/theme/fonts/a%20b.woff2"),
        faceBlock("Geist", "700", "/assets/theme/fonts/c\\20 d.woff2"),
      ].join("\n"),
      "assets/theme/fonts/a b.woff2": "spaced",
      "assets/theme/fonts/c d.woff2": "escaped",
    },
    `${styleLink("/assets/theme/base-aaaa.css")}<body></body>`,
  );
  try {
    const fonts = inventory(dir, [route])["/"]?.[FONT_CLASS];
    assert.deepEqual(fonts?.assets?.map((asset) => asset.path), ["assets/theme/fonts/a b.woff2", "assets/theme/fonts/c d.woff2"]);
    assert.equal(fonts?.count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing, external, or malformed font fails by name instead of reading small", () => {
  const cases: { readonly name: string; readonly css: string; readonly files?: Record<string, string>; readonly pattern: RegExp }[] = [
    {
      name: "a face whose file the build did not emit",
      css: faceBlock("Geist", "400", "/assets/theme/fonts/gone.woff2"),
      pattern: /assets\/theme\/base-aaaa\.css.*gone\.woff2.*not a file in the built output/s,
    },
    { name: "a CDN face", css: faceBlock("Geist", "400", "https://cdn.example/fonts/geist.woff2"), pattern: /external assets are outside this budget/ },
    { name: "a broken percent escape", css: faceBlock("Geist", "400", "/assets/theme/fonts/bad%zz.woff2"), pattern: /malformed URL escape/ },
    {
      name: "a block without its closing brace",
      css: '@font-face { font-family: "Geist"; src: url("/assets/theme/fonts/geist.woff2") format("woff2")',
      files: { "assets/theme/fonts/geist.woff2": "geist-bytes" },
      pattern: /no closing brace/,
    },
    {
      name: "a url() without its closing paren",
      css: '@font-face { font-family: "Geist"; src: url("/assets/theme/fonts/geist.woff2" format("woff2"); }',
      files: { "assets/theme/fonts/geist.woff2": "geist-bytes" },
      pattern: /malformed @font-face src/,
    },
    { name: "a face with an empty url()", css: '@font-face { font-family: "Geist"; src: url("") format("woff2"); }', pattern: /no usable url/ },
    { name: "a stylesheet with no src at all", css: '@font-face { font-family: "Geist"; }', pattern: /no src/ },
  ];
  for (const item of cases) {
    const { dir, route } = output(
      { "assets/theme/base-aaaa.css": item.css, ...item.files },
      `${styleLink("/assets/theme/base-aaaa.css")}<body></body>`,
    );
    try {
      assert.throws(() => inventory(dir, [route]), item.pattern, item.name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("fontFaces keeps the descriptors that explain a face", () => {
  const faces = fontFaces(
    [
      '@font-face { font-family: "Vazirmatn"; font-weight: 500; font-display: swap; src: url("/f.woff2") format("woff2"); }',
      '@font-face { src: local("Tahoma"); }',
      "@font-face { font-family: 'Bare'; src: url(/bare.woff2); }",
    ].join("\n"),
  );
  assert.equal(faces.length, 3);
  assert.deepEqual(
    faces.map((face) => [face.family, face.weight, face.style, face.display, face.url, face.format]),
    [
      ["Vazirmatn", "500", "normal", "swap", "/f.woff2", "woff2"],
      ["unknown", "normal", "normal", "auto", undefined, "unknown"],
      ["Bare", "normal", "normal", "auto", "/bare.woff2", "unknown"],
    ],
  );
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

/** One font response, with the face context a budget records. */
const fontAsset = (path: string, value: { raw?: number; gzip?: number } = {}): FontAsset => ({
  path,
  url: `/${path}`,
  stylesheet: "assets/theme/base-aaaa.css",
  family: "Geist",
  weight: "400",
  style: "normal",
  display: "optional",
  format: "woff2",
  raw: value.raw ?? 1000,
  gzip: value.gzip ?? 900,
});

/** A single-route measurement whose font class holds `assets`. */
function fontMeasurement(assets: readonly FontAsset[]): Measurements {
  const route = Object.fromEntries(ASSET_CLASSES.map((name) => [name, { raw: 0, gzip: 0, count: 0 }])) as Measurements[string];
  route[FONT_CLASS] = {
    raw: assets.reduce((total, asset) => total + asset.raw, 0),
    gzip: assets.reduce((total, asset) => total + asset.gzip, 0),
    count: assets.length,
    assets,
  };
  return { "/": route };
}

test("a new or enlarged font fails the route and class it belongs to", () => {
  const baseline = fontMeasurement([fontAsset("assets/theme/fonts/geist.woff2"), fontAsset("assets/theme/fonts/mono.woff2")]);
  assert.deepEqual(compare(baseline, budgetOf(baseline)), []);

  // A bigger file: both the class total and the named file are over the baseline.
  const grown = fontMeasurement([
    fontAsset("assets/theme/fonts/geist.woff2", { raw: 2000, gzip: 1900 }),
    fontAsset("assets/theme/fonts/mono.woff2"),
  ]);
  const grownFailures = compare(grown, budgetOf(baseline));
  assert.ok(
    grownFailures.some(
      (failure) => failure.includes("route /") && failure.includes(FONT_CLASS) && failure.includes("geist.woff2") && failure.includes("limit"),
    ),
    grownFailures.join("\n"),
  );

  // A face the theme did not ship before: the count and the file are both named.
  const added = fontMeasurement([
    ...(baseline["/"]?.[FONT_CLASS]?.assets ?? []),
    fontAsset("assets/theme/fonts/new.woff2", { raw: 10_000, gzip: 9_900 }),
  ]);
  const addedFailures = compare(added, budgetOf(baseline));
  assert.ok(
    addedFailures.some(
      (failure) => failure.includes("route /") && failure.includes(FONT_CLASS) && failure.includes("new.woff2") && failure.includes("not in the budget"),
    ),
    addedFailures.join("\n"),
  );
  assert.ok(addedFailures.some((failure) => failure.includes("loads 3 assets")), addedFailures.join("\n"));
});

test("a font swap that keeps the totals level and a stale baseline are both failures", () => {
  const baseline = fontMeasurement([fontAsset("assets/theme/fonts/geist.woff2", { gzip: 900 })]);
  const swapped = fontMeasurement([fontAsset("assets/theme/fonts/large.woff2", { gzip: 900 })]);
  const failures = compare(swapped, budgetOf(baseline));
  assert.equal(failures.filter((failure) => failure.includes(FONT_CLASS)).length, 2, failures.join("\n"));
  assert.ok(failures.some((failure) => failure.includes("large.woff2") && failure.includes("not in the budget")), failures.join("\n"));
  assert.ok(failures.some((failure) => failure.includes("geist.woff2") && failure.includes("no longer loads")), failures.join("\n"));
});

test("per-file font checks use the same gzip tolerance as the classes", () => {
  const baseline = [fontAsset("assets/theme/fonts/geist.woff2", { gzip: 1000 })];
  const atLimit = compareFonts("/", [fontAsset("assets/theme/fonts/geist.woff2", { gzip: 1000 + TOLERANCE_BYTES })], baseline);
  assert.deepEqual(atLimit, []);
  const over = compareFonts("/", [fontAsset("assets/theme/fonts/geist.woff2", { gzip: 1000 + TOLERANCE_BYTES + 1 })], baseline);
  assert.equal(over.length, 1);
  assert.ok(over[0]?.includes(FONT_CLASS) && over[0]?.includes("geist.woff2"), over.join("\n"));
});

test("a budget without the font detail is still checked on its totals", () => {
  const measured = fontMeasurement([fontAsset("assets/theme/fonts/geist.woff2")]);
  const legacy = budgetOf(measured);
  legacy.routes["/"]![FONT_CLASS] = { raw: 0, gzip: 0, count: 0 };
  const failures = compare(measured, legacy);
  assert.ok(failures.some((failure) => failure.includes(FONT_CLASS) && failure.includes("loads 1 assets")), failures.join("\n"));

  // A baseline that lists no files is not a per-file failure: the totals still match here.
  const totals = measured["/"]?.[FONT_CLASS];
  assert.ok(totals);
  const withoutDetail: Budget = { routes: { "/": { ...structuredClone(measured)["/"]!, [FONT_CLASS]: { raw: totals.raw, gzip: totals.gzip, count: totals.count } } } };
  assert.deepEqual(compare(measured, withoutDetail), []);
});

test("the font rows are sorted and stable, so a run is diffable", () => {
  const measured: Measurements = {
    "/": fontMeasurement([fontAsset("assets/theme/fonts/zebra.woff2")])["/"]!,
    "/guide/": fontMeasurement([fontAsset("assets/theme/fonts/alpha.woff2"), fontAsset("assets/theme/fonts/zebra.woff2")])["/"]!,
  };
  const table = formatFonts(measured);
  assert.equal(table, formatFonts(measured));
  const lines = table.split("\n");
  assert.ok(lines[0]?.startsWith("font"), "the rows start with a header");
  assert.deepEqual(
    lines.slice(1).map((line) => (line.trim().split(/\s+/)[0] ?? "")),
    ["assets/theme/fonts/alpha.woff2", "assets/theme/fonts/zebra.woff2"],
  );
  assert.ok(lines[2]?.includes("2"), "a file two routes load is listed once with its route count");
});

test("the committed budget covers every fixture route and asset class", () => {
  const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Budget;
  assert.ok(budget.note?.includes("not a product target"), "the budget should say what its numbers mean");
  assert.ok(budget.note?.includes(FONT_CLASS), "the budget should say what its font numbers mean");
  assert.deepEqual(Object.keys(budget.routes).sort(), ["/", "/guide/", "/reference/"]);
  for (const [route, classes] of Object.entries(budget.routes)) {
    for (const assetClass of ASSET_CLASSES) assert.ok(classes[assetClass], `${route} has no ${assetClass} baseline`);
    assert.ok(classes["css/base"].gzip > 0, `${route} should load the base stylesheet`);
    assert.ok(classes["js/chrome"].count > 0, `${route} should load the chrome islands`);

    const fonts = classes[FONT_CLASS];
    assert.ok(fonts.count > 0, `${route} should load the self-hosted fonts`);
    const assets = fonts.assets;
    assert.ok(Array.isArray(assets) && assets.length === fonts.count, `${route} should list every font response`);
    assert.deepEqual(
      assets.map((asset) => asset.path),
      [...assets.map((asset) => asset.path)].sort(),
      `${route} should list its fonts in path order`,
    );
    assert.equal(new Set(assets.map((asset) => asset.path)).size, assets.length, `${route} should list each font once`);
    assert.equal(assets.reduce((total, asset) => total + asset.raw, 0), fonts.raw, `${route} font raw bytes should match its files`);
    assert.equal(assets.reduce((total, asset) => total + asset.gzip, 0), fonts.gzip, `${route} font gzip should match its files`);
    for (const asset of assets) {
      assert.ok(asset.path.startsWith("assets/theme/fonts/"), `${route} lists ${asset.path}, outside the font folder`);
      assert.ok(asset.family !== "unknown", `${route} lists ${asset.path} without an @font-face family`);
      assert.ok(["woff", "woff2"].includes(asset.format), `${route} lists ${asset.path} as ${asset.format}`);
      assert.ok(asset.raw > 0 && asset.gzip > 0, `${route} lists an empty font ${asset.path}`);
    }
    const families = new Set(assets.map((asset) => asset.family));
    assert.ok(families.has("Geist") && families.has("Geist Mono"), `${route} should ship the Latin faces it styles with`);
  }
});

test("an unknown asset path is not silently counted in a class", () => {
  assert.throws(() => classOf("assets/theme/other-aaaa.css"), /not a base or page CSS bundle/);
  assert.throws(() => classOf("assets/theme/fonts/geist/geist.woff2"), /measured from the stylesheet/);
});
