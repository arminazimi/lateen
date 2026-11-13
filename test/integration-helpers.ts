import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

/** The repository root, so the installed engine and the theme in this checkout are the ones measured. */
export const root = fileURLToPath(new URL("../", import.meta.url));

/** The installed engine. `npm ci` provides it; no sibling checkout is needed. */
const MIZZEN = join(root, "node_modules/@velella/mizzen/bin/mizzen.js");

/** One built fixture: its output folder, and readers for the files the tests inspect. */
export interface BuiltSite {
  /** Build a page path such as `/guide/install/` and return its HTML document. */
  document(path: string): Document;
  /** The HTML text of a page path. */
  html(path: string): string;
  /** A file from the output folder, as text. */
  file(path: string): string;
  /** The output folder. */
  readonly out: string;
}

/** The HTML file a route writes: `/guide/install/` is `guide/install/index.html`. */
export function outputFile(path: string): string {
  if (path.endsWith("/")) return `${path.slice(1)}index.html`;
  return path.slice(1);
}

/**
 * Builds a fixture with the engine and this theme, then hands back its output. The build is
 * synchronous and isolated in a temporary folder, so a test never reads a stale public build.
 */
export function build(name: string, env: NodeJS.ProcessEnv = process.env): BuiltSite {
  if (!existsSync(MIZZEN)) throw new Error(`${MIZZEN} is missing; run \`npm ci\` before the integration tests`);
  const out = mkdtempSync(join(tmpdir(), `lateen-${name}-`));
  // Build from a copy so the engine's own `.mizzen` cache in the fixture never makes a run stale.
  const source = mkdtempSync(join(tmpdir(), `lateen-${name}-source-`));
  cpSync(join(root, "fixtures", name), source, {
    recursive: true,
    filter: (path) => !path.includes(`${join("fixtures", name, ".mizzen")}`),
  });
  // Node injects its coverage directory into every child, even one given a clean environment; an empty
  // value disables it. Without this the build's workers add a second, partly unexecuted record for every
  // theme module they load and halve the reported percentage.
  const childEnv = { ...env, NODE_V8_COVERAGE: "" };
  const run = spawnSync(process.execPath, [MIZZEN, "build", source, "--out", out, "--theme", root], {
    encoding: "utf8",
    env: childEnv,
  });
  rmSync(source, { recursive: true, force: true });
  if (run.status !== 0) {
    rmSync(out, { recursive: true, force: true });
    throw new Error(`mizzen build failed for fixtures/${name}:\n${run.stderr || run.stdout || run.error?.message || "no output"}`);
  }
  return {
    out,
    html(path) {
      return readFileSync(join(out, outputFile(path)), "utf8");
    },
    file(path) {
      return readFileSync(join(out, path), "utf8");
    },
    document(path) {
      return new JSDOM(readFileSync(join(out, outputFile(path)), "utf8")).window.document;
    },
  };
}

/** Every element matching `selector`, as an array so a test can map and assert without live collections. */
export function all(root: ParentNode, selector: string): Element[] {
  return [...root.querySelectorAll(selector)];
}

/** The text of an element with its whitespace collapsed, for readable assertions. */
export function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** All attribute values named `name`, in document order. */
export function attrs(root: ParentNode, selector: string, name: string): string[] {
  return all(root, selector).map((element) => element.getAttribute(name) ?? "");
}
