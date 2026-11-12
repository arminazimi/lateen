// Measures the JavaScript, CSS, and self-hosted fonts the theme ships on `fixtures/performance`,
// compares each route and asset class with the checked-in budget, and fails when one grows. The budget is
// a regression baseline, not a product target: see docs/performance.md for the adjustment policy.
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

/** The class every self-hosted font file is measured in: one response per file per route. */
export const FONT_CLASS = "font/self-hosted";

/** Each route counts its assets in these classes. Order is the order they are printed and checked. */
export const ASSET_CLASSES = ["css/base", "css/page", "js/chrome", "js/components", "js/inline", FONT_CLASS] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/**
 * One font response: the file a browser downloads for an `@font-face`, and the descriptors that declare
 * it. Two faces of one file are one download, and a `local()` fallback face is no download at all.
 */
export interface FontAsset {
  /** The file's path from the output folder, escapes and the site base resolved; the deduplication key. */
  readonly path: string;
  /** The URL as the stylesheet writes it. */
  readonly url: string;
  /** The stylesheet that declares the face, as a path from the output folder. */
  readonly stylesheet: string;
  /** The face's `font-family`, without its quotes. */
  readonly family: string;
  /** The face's `font-weight`, `normal` when it omits the descriptor. */
  readonly weight: string;
  /** The face's `font-style`, `normal` when it omits the descriptor. */
  readonly style: string;
  /** The face's `font-display`, `auto` when it omits the descriptor. */
  readonly display: string;
  /** The `format()` of the measured source, `unknown` when the face omits it. */
  readonly format: string;
  readonly raw: number;
  readonly gzip: number;
}

/** What one asset class ships on one route: bytes before and after gzip, and how many assets it is. */
export interface Measurement {
  readonly raw: number;
  readonly gzip: number;
  readonly count: number;
  /**
   * The files behind the totals, for `font/self-hosted`: every font the route's stylesheets declare,
   * sorted by path. A budget written before fonts were measured has none, so only its totals are checked.
   */
  readonly assets?: readonly FontAsset[];
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

const emptyMeasurement = (): Measurement => ({ raw: 0, gzip: 0, count: 0 });

const emptyRoute = (): RouteMeasurement =>
  Object.fromEntries(
    ASSET_CLASSES.map((assetClass) => [
      assetClass,
      assetClass === FONT_CLASS ? { ...emptyMeasurement(), assets: [] } : emptyMeasurement(),
    ]),
  ) as RouteMeasurement;

/** The class of a built asset, from the path the engine writes: only these paths are measured. */
export function classOf(path: string): AssetClass {
  if (/^assets\/theme\/base-[^/]+\.css$/.test(path)) return "css/base";
  if (/^assets\/theme\/page-[^/]+\.css$/.test(path)) return "css/page";
  if (path.startsWith("assets/theme/islands/chrome/")) return "js/chrome";
  if (path.startsWith("assets/theme/islands/components/")) return "js/components";
  if (path.startsWith("assets/theme/fonts/")) {
    throw new Error(`${path}: a font is measured from the stylesheet that declares it, not from the page`);
  }
  throw new Error(`${path}: not a base or page CSS bundle or a chrome or component island`);
}

/** A local URL from the HTML as a path from the output folder. An external URL is not measured. */
function assetPath(url: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) throw new Error(`${url}: external assets are outside this budget`);
  return url.replace(/^\/+/, "");
}

/**
 * A URL or CSS string with its backslash escapes replaced: `\20 ` is how CSS writes a space and `\a` how
 * it writes a letter. A value with no escape comes back unchanged, so an ordinary URL is untouched.
 */
export function unescapeCss(value: string): string {
  let out = "";
  let cursor = 0;
  for (const match of value.matchAll(/\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|(.))/g)) {
    const start = match.index ?? 0;
    out += value.slice(cursor, start);
    cursor = start + match[0].length;
    const hex = match[1];
    const literal = match[2];
    if (hex !== undefined) out += String.fromCodePoint(Number.parseInt(hex, 16));
    else if (literal !== undefined) out += literal;
  }
  return `${out}${value.slice(cursor)}`;
}

/**
 * The output-folder path a URL points at: CSS escapes and percent-escapes resolved, the query and
 * fragment dropped, and a relative URL read from `from`, the directory of the file that writes it. The
 * site's base path belongs to the URL and not to the folder layout, so the caller removes it.
 */
export function outputUrl(url: string, from = "."): string {
  const local = assetPath(unescapeCss(url));
  const bare = (local.split(/[?#]/)[0] ?? "").trim();
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    throw new Error(`${url}: a malformed URL escape`);
  }
  const path = posix.normalize(from === "." ? decoded : posix.join(from, decoded));
  if (path === "" || path === "." || path.startsWith("..")) throw new Error(`${url}: it does not point into the built output`);
  return path;
}

/**
 * The file a URL names in the output folder. A site served under a base path writes `/docs/assets/…`
 * while the build emits `assets/…`, so leading segments are dropped until a candidate exists. A file that
 * is nowhere in the output fails by name: a silent gap would lower the budget instead of raising it.
 */
export function resolveOutput(dir: string, url: string, from = ".", source = url): string {
  const path = outputUrl(url, from);
  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = segments.slice(index).join("/");
    if (candidate !== "" && existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error(`${source}: ${url} is not a file in the built output`);
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

/** One descriptor's value in a declaration block, without the quotes a `font-family` is written in. */
function descriptor(block: string, name: string): string | undefined {
  const value = new RegExp(`\\b${name}\\s*:\\s*([^;]*)`, "i").exec(block)?.[1]?.trim();
  if (value === undefined || value === "") return undefined;
  return value.replace(/^["']|["']$/g, "");
}

/** The `url()` and `local()` sources of a `src` value, in written order, each with its `format()`. */
function srcSources(src: string): { readonly name: string; readonly value: string; readonly format: string }[] {
  const found: { name: string; value: string; format: string }[] = [];
  for (const match of src.matchAll(
    /\b(url|local)\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)(?:\s*format\(\s*(?:"([^"]*)"|'([^"]*)'|([^)]*))\s*\))?/gi,
  )) {
    const quoted = match[2] ?? match[3];
    const bare = match[4] ?? "";
    if (quoted === undefined && /["'()]/.test(bare)) throw new Error(`a malformed @font-face src: ${src.trim()}`);
    const value = (quoted ?? bare).trim();
    const format = (match[5] ?? match[6] ?? match[7] ?? "").trim().toLowerCase();
    found.push({ name: (match[1] ?? "url").toLowerCase(), value, format });
  }
  const written = (src.match(/\b(?:url|local)\s*\(/gi) ?? []).length;
  if (written !== found.length) throw new Error(`a malformed @font-face src: ${src.trim()}`);
  return found;
}

/** A `@font-face` as authored. `url` is absent for a `local()`-only face and for a block with no source. */
export interface FontFace {
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly display: string;
  readonly url?: string;
  readonly format: string;
}

/**
 * Every `@font-face` of a stylesheet, with comments removed so a commented-out face transfers nothing. A
 * block without its closing brace and a broken `src` are failures: a budget may not quietly read small.
 */
export function fontFaces(css: string): FontFace[] {
  const source = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  const blocks = [...source.matchAll(/@font-face\s*\{([^}]*)\}/gi)];
  const declared = (source.match(/@font-face/gi) ?? []).length;
  if (blocks.length !== declared) throw new Error(`${declared - blocks.length} of ${declared} @font-face blocks have no closing brace`);
  return blocks.map((match) => {
    const block = match[1] ?? "";
    const src = [...block.matchAll(/\bsrc\s*:([^;]*)/gi)].at(-1)?.[1]?.trim() ?? "";
    if (src === "") throw new Error("an @font-face block with no src");
    const file = srcSources(src).find((entry) => entry.name === "url");
    // A `local()`-only face has no url and transfers nothing; a `url()` with nothing in it is a typo.
    if (file !== undefined && file.value === "") throw new Error(`an @font-face src with no usable url(): ${src}`);
    const face: FontFace = {
      family: descriptor(block, "font-family") ?? "unknown",
      weight: descriptor(block, "font-weight") ?? "normal",
      style: descriptor(block, "font-style") ?? "normal",
      display: descriptor(block, "font-display") ?? "auto",
      format: file === undefined || file.format === "" ? "unknown" : file.format,
    };
    return file === undefined ? face : { ...face, url: file.value };
  });
}

/** The faces of a stylesheet, named with the file that declares them so a failure is traceable. */
function facesIn(cssPath: string, css: string): FontFace[] {
  try {
    return fontFaces(css);
  } catch (error) {
    throw new Error(`${cssPath}: ${(error as Error).message}`);
  }
}

/** The directory of a page's HTML, as a path from the output folder. */
function pageDir(dir: string, html: string): string {
  const parts = relative(dir, html).split(/[\\/]/).filter(Boolean).slice(0, -1);
  return parts.length === 0 ? "." : parts.join("/");
}

/**
 * Measures every route of a built fixture folder: CSS bundles, the island modules they reach, inline
 * scripts, and the self-hosted fonts the loaded stylesheets declare.
 */
export function inventory(dir: string, routes: readonly BuiltPage[]): Measurements {
  const measured: Measurements = {};
  for (const route of routes) {
    const result = emptyRoute();
    const html = readFileSync(route.html, "utf8");
    const seenModules = new Set<string>();
    const from = pageDir(dir, route.html);

    const add = (assetClass: AssetClass, bytes: number, compressed: number): void => {
      const current = result[assetClass];
      result[assetClass] = { ...current, raw: current.raw + bytes, gzip: current.gzip + compressed, count: current.count + 1 };
    };

    const styleSheets: string[] = [];
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (attr(tag, "rel") !== "stylesheet") continue;
      const href = attr(tag, "href");
      if (href === undefined) continue;
      const path = resolveOutput(dir, href, from, `page ${route.url}`);
      const bytes = readFileSync(join(dir, path));
      add(classOf(path), bytes.byteLength, gzip(bytes));
      styleSheets.push(path);
    }

    // One response per font file per route, whichever stylesheet or face asks for it.
    const fonts = new Map<string, FontAsset>();
    for (const cssPath of styleSheets) {
      const css = readFileSync(join(dir, cssPath), "utf8");
      for (const face of facesIn(cssPath, css)) {
        const url = face.url;
        if (url === undefined) continue;
        const source = `${cssPath} @font-face ${face.family} ${face.weight}`;
        const path = resolveOutput(dir, url, posix.dirname(cssPath), source);
        if (fonts.has(path)) continue;
        const bytes = readFileSync(join(dir, path));
        fonts.set(path, {
          path,
          url,
          stylesheet: cssPath,
          family: face.family,
          weight: face.weight,
          style: face.style,
          display: face.display,
          format: face.format,
          raw: bytes.byteLength,
          gzip: gzip(bytes),
        });
      }
    }
    const assets = [...fonts.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    result[FONT_CLASS] = {
      raw: assets.reduce((total, asset) => total + asset.raw, 0),
      gzip: assets.reduce((total, asset) => total + asset.gzip, 0),
      count: assets.length,
      assets,
    };

    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs = match[1] ?? "";
      const body = match[2] ?? "";
      const src = attr(attrs, "src");
      if (src !== undefined) {
        for (const file of moduleFiles(dir, resolveOutput(dir, src, from, `page ${route.url}`), seenModules)) {
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

/** The font files of an inventory: one row per file, its `@font-face` context, and the routes that load it. */
export function formatFonts(measured: Measurements): string {
  const files = new Map<string, { raw: number; gzip: number; face: string; display: string; routes: number }>();
  for (const route of Object.keys(measured)) {
    for (const asset of measured[route]?.[FONT_CLASS]?.assets ?? []) {
      const current = files.get(asset.path);
      if (current === undefined) {
        files.set(asset.path, {
          raw: asset.raw,
          gzip: asset.gzip,
          face: `${asset.family} ${asset.weight} ${asset.style} ${asset.format}`,
          display: asset.display,
          routes: 1,
        });
        continue;
      }
      current.routes += 1;
    }
  }
  const rows = [["font", "face", "display", "raw B", "gzip B", "routes"]];
  for (const [path, value] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    rows.push([path, value.face, value.display, number(value.raw), number(value.gzip), String(value.routes)]);
  }
  const widths = [0, 1, 2, 3, 4].map((column) => Math.max(...rows.map((row) => (row[column] ?? "").length)));
  // The last column is the row's end, so it needs no padding of its own.
  return rows.map((row) => row.map((cell, column) => (column > 2 ? cell.padStart(widths[column] ?? 0) : cell.padEnd(widths[column] ?? 0))).join("  ")).join("\n");
}

/** Every font file a route loads that the baseline does not list, lists smaller, or no longer reaches. */
export function compareFonts(route: string, actual: readonly FontAsset[], baseline: readonly FontAsset[]): string[] {
  const failures: string[] = [];
  const expected = new Map(baseline.map((asset) => [asset.path, asset]));
  for (const asset of actual) {
    const before = expected.get(asset.path);
    if (before === undefined) {
      failures.push(
        `route ${route}: ${FONT_CLASS} loads ${asset.path} (${asset.family} ${asset.weight} ${asset.style}), ` +
          `which is not in the budget; run \`node scripts/performance-budget.ts --update\``,
      );
      continue;
    }
    const limit = before.gzip + TOLERANCE_BYTES;
    if (asset.gzip > limit) {
      failures.push(
        `route ${route}: ${FONT_CLASS} ${asset.path} is ${asset.gzip} B gzip, the baseline is ${before.gzip} B (limit ${limit} B)`,
      );
    }
  }
  const loaded = new Set(actual.map((asset) => asset.path));
  for (const asset of baseline) {
    if (!loaded.has(asset.path)) {
      failures.push(`route ${route}: ${FONT_CLASS} baselines ${asset.path}, which the route no longer loads; run --update`);
    }
  }
  return failures;
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
      // Fonts are also checked file by file: a swap that keeps the totals level is still a typography change.
      if (assetClass === FONT_CLASS && baseline.assets !== undefined) {
        failures.push(...compareFonts(route, actual.assets ?? [], baseline.assets));
      }
    }
  }
  return failures;
}

const NOTE =
  "Measured baseline for fixtures/performance, not a product target. Update with `node scripts/performance-budget.ts --update` " +
  "and explain in the pull request what grew and why. gzip is level 9 per asset; count is the stylesheets, modules, inline " +
  "scripts, or font files the route loads. A font counts once per route whichever stylesheet or face declares it, so the " +
  "font/self-hosted assets list the file, its URL, and the @font-face behind the totals.";

export function main(argv = process.argv.slice(2)): void {
  const measured = measure();
  console.log(formatTable(measured));
  console.log(formatFonts(measured));
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
