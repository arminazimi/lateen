// Measures the JavaScript and CSS the theme ships on `fixtures/performance`, compares each route and
// asset class with the checked-in budget, and fails when one grows. The budget is a regression
// baseline, not a product target: see docs/performance.md for the adjustment policy.
// Usage: node scripts/performance-budget.ts [--update]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const fixture = join(root, "fixtures/performance");
export const budgetPath = join(fixture, "budget.json");

/** The installed engine. A clean checkout gets it from `npm ci`; no sibling checkout is needed. */
const MIZZEN = join(root, "node_modules/@velella/mizzen/bin/mizzen.js");

/**
 * Headroom for gzip differences between Node and zlib builds, in bytes per asset class. Compression
 * of the same bytes is not guaranteed to be identical across zlib releases; this is not a growth allowance.
 */
export const TOLERANCE_BYTES = 64;

/** Each route counts its assets in these classes. Order is the order they are printed and checked. */
export const ASSET_CLASSES = ["css/base", "css/page", "js/chrome", "js/components", "js/inline"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** What one asset class ships on one route: bytes before and after gzip, and how many assets it is. */
export interface Measurement {
  readonly raw: number;
  readonly gzip: number;
  readonly count: number;
}

export type RouteMeasurement = Record<AssetClass, Measurement>;
/** Route URL (including the site's base) to its measurement. */
export type Measurements = Record<string, RouteMeasurement>;

export interface Budget {
  /** Why the numbers exist and how to change them. */
  readonly note?: string;
  readonly routes: Measurements;
}

/** Compressed size as one response per asset, so the sum is what a visitor transfers. */
const gzip = (bytes: Buffer): number => gzipSync(bytes, { level: 9 }).byteLength;

const emptyRoute = (): RouteMeasurement =>
  Object.fromEntries(ASSET_CLASSES.map((assetClass) => [assetClass, { raw: 0, gzip: 0, count: 0 }])) as RouteMeasurement;

/** The class of a built asset, from the path the engine writes: only these paths are measured. */
export function classOf(path: string): AssetClass {
  if (/^assets\/theme\/base-[^/]+\.css$/.test(path)) return "css/base";
  if (/^assets\/theme\/page-[^/]+\.css$/.test(path)) return "css/page";
  if (path.startsWith("assets/theme/islands/chrome/")) return "js/chrome";
  if (path.startsWith("assets/theme/islands/components/")) return "js/components";
  throw new Error(`${path}: not a base or page CSS bundle or a chrome or component island`);
}

/** A local URL from the HTML as a path from the output folder. An external URL is not measured. */
function assetPath(url: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) throw new Error(`${url}: external assets are outside this budget`);
  return url.replace(/^\/+/, "");
}

/** A page's HTML file and URL, from the manifest the build writes. */
export interface BuiltPage {
  readonly url: string;
  readonly html: string;
}

export function builtPages(dir: string): BuiltPage[] {
  const file = join(dir, ".mizzen/manifest.json");
  if (!existsSync(file)) throw new Error(`${file} is missing; the build did not write a manifest`);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as { pages?: { url?: string; outputs?: string[] }[] };
  const pages: BuiltPage[] = [];
  for (const page of manifest.pages ?? []) {
    const html = page.outputs?.find((output) => output.endsWith(".html"));
    if (page.url === undefined || html === undefined) throw new Error(`${file}: a page has no URL or no HTML output`);
    pages.push({ url: page.url, html: join(dir, html) });
  }
  return pages.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/** A relative module specifier: `from "./x.js"`, `import "./x.js"`, `import("./x.js")`, or an `export … from`. */
const RELATIVE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

/**
 * The entry module and every module it imports with a relative path, each once, in discovery order.
 * Bare specifiers cannot appear in an island: the engine rejects them before the browser sees one.
 */
export function moduleFiles(dir: string, entry: string, seen: Set<string>): string[] {
  const found: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    found.push(file);
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const specifier = match[1] as string;
      queue.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
    }
  }
  return found;
}

/** The attribute in an open tag, when it is written with double quotes as the engine writes it. */
const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs)?.[1];

/** An inline script the browser evaluates: no `src`, and no non-JavaScript `type`. Data blocks are not work. */
const isJavaScript = (type: string | undefined): boolean =>
  type === undefined || /^(?:module|text\/javascript|application\/javascript)$/i.test(type);

/** Measures every route of a built fixture folder: CSS bundles, island modules, and inline scripts. */
export function inventory(dir: string, routes: readonly BuiltPage[]): Measurements {
  const measured: Measurements = {};
  for (const route of routes) {
    const result = emptyRoute();
    const html = readFileSync(route.html, "utf8");
    const seenModules = new Set<string>();

    const add = (assetClass: AssetClass, bytes: number, compressed: number): void => {
      const current = result[assetClass];
      result[assetClass] = { raw: current.raw + bytes, gzip: current.gzip + compressed, count: current.count + 1 };
    };

    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (attr(tag, "rel") !== "stylesheet") continue;
      const href = attr(tag, "href");
      if (href === undefined) continue;
      const path = assetPath(href);
      const bytes = readFileSync(join(dir, path));
      add(classOf(path), bytes.byteLength, gzip(bytes));
    }

    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs = match[1] ?? "";
      const body = match[2] ?? "";
      const src = attr(attrs, "src");
      if (src !== undefined) {
        for (const file of moduleFiles(dir, assetPath(src), seenModules)) {
          const bytes = readFileSync(join(dir, file));
          add(classOf(file), bytes.byteLength, gzip(bytes));
        }
        continue;
      }
      if (!isJavaScript(attr(attrs, "type")) || body.trim() === "") continue;
      const bytes = Buffer.from(body);
      add("js/inline", bytes.byteLength, gzip(bytes));
    }

    measured[route.url] = result;
  }
  return Object.fromEntries(Object.entries(measured).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Builds the fixture into a temporary folder and measures it, leaving the checkout untouched. */
export function measure(): Measurements {
  if (!existsSync(MIZZEN)) throw new Error(`${MIZZEN} is missing; run \`npm ci\` before measuring`);
  const out = mkdtempSync(join(tmpdir(), "lateen-performance-"));
  try {
    const run = spawnSync(process.execPath, [MIZZEN, "build", fixture, "--out", out, "--theme", root], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`mizzen build failed:\n${run.stderr || run.stdout || run.error?.message || "no output"}`);
    return inventory(out, builtPages(out));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const number = (value: number): string => value.toLocaleString("en-US");

/** The inventory as a fixed-width table, so a change is readable in the diff of a run. */
export function formatTable(measured: Measurements): string {
  const rows = [["route", "class", "assets", "raw B", "gzip B"]];
  for (const route of Object.keys(measured)) {
    for (const assetClass of ASSET_CLASSES) {
      const value = measured[route]?.[assetClass];
      if (value === undefined) continue;
      rows.push([route, assetClass, String(value.count), number(value.raw), number(value.gzip)]);
    }
  }
  const widths = [0, 1, 2, 3].map((column) => Math.max(...rows.map((row) => (row[column] ?? "").length)));
  return rows
    .map(
      (row) =>
        [0, 1].map((column) => (row[column] ?? "").padEnd(widths[column] ?? 0)).join("  ") +
        [2, 3, 4].map((column) => (row[column] ?? "").padStart(widths[column] ?? 0)).join("  "),
    )
    .join("\n");
}

/** Every way the measured inventory is worse than the budget, naming the route and asset class. */
export function compare(measured: Measurements, budget: Budget): string[] {
  const failures: string[] = [];
  const routes = budget.routes ?? {};
  for (const route of Object.keys(routes).sort()) {
    if (measured[route] === undefined) failures.push(`route ${route}: it is in the budget, but the fixture no longer builds it`);
  }
  for (const route of Object.keys(measured).sort()) {
    const expected = routes[route];
    if (expected === undefined) {
      failures.push(`route ${route}: it is not in the budget; run \`node scripts/performance-budget.ts --update\``);
      continue;
    }
    for (const assetClass of ASSET_CLASSES) {
      const actual = measured[route]?.[assetClass];
      const baseline = expected[assetClass];
      if (actual === undefined) continue;
      if (baseline === undefined) {
        failures.push(`route ${route}: ${assetClass} is not in the budget; run \`node scripts/performance-budget.ts --update\``);
        continue;
      }
      if (actual.count > baseline.count) {
        failures.push(`route ${route}: ${assetClass} loads ${actual.count} assets, the baseline is ${baseline.count}`);
      }
      const limit = baseline.gzip + TOLERANCE_BYTES;
      if (actual.gzip > limit) {
        failures.push(`route ${route}: ${assetClass} is ${actual.gzip} B gzip, the baseline is ${baseline.gzip} B (limit ${limit} B)`);
      }
    }
  }
  return failures;
}

const NOTE =
  "Measured baseline for fixtures/performance, not a product target. Update with `node scripts/performance-budget.ts --update` " +
  "and explain in the pull request what grew and why. gzip is level 9 per asset; count is the stylesheets, modules, or inline " +
  "scripts the page loads.";

export function main(argv = process.argv.slice(2)): void {
  const measured = measure();
  console.log(formatTable(measured));
  if (argv.includes("--update")) {
    const budget: Budget = { note: NOTE, routes: measured };
    writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
    console.log(`wrote ${relative(root, budgetPath)}`);
    return;
  }
  if (!existsSync(budgetPath)) throw new Error(`${budgetPath} is missing; run with --update to record the baseline`);
  const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Budget;
  const failures = compare(measured, budget);
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} performance budget problem(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: every route is within the checked-in budget (gzip tolerance ${TOLERANCE_BYTES} B).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
