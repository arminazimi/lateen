import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Class on the outer `<figure>`; `style.css` styles it. */
export const MERMAID_CLASS = "mermaid";

/** Class on the element that receives the rendered SVG. */
export const DIAGRAM_CLASS = "mermaid-diagram";

/** Class on the `<details>` block that keeps the diagram source for readers and agents. */
export const SOURCE_CLASS = "mermaid-source";

/** Class on the message shown when a diagram cannot be rendered. */
export const FALLBACK_CLASS = "mermaid-fallback";

/** Props from the engine: `source` is the diagram text, `alt` its text alternative. */
export type MermaidProps = {
  /** The Mermaid source. Without it the component renders nothing. */
  source?: string;
  /** Text alternative: the fence's `alt="…"`, else a leading `%% alt: …` comment. */
  alt?: string;
  /** Source position, kept as `data-src` on the figure. */
  src?: string;
};

type RenderResult =
  | { readonly ok: true; readonly svg: string }
  | { readonly ok: false; readonly error: string };

/** One render per source string per build process. */
const cache = new Map<string, RenderResult>();

/** True when Node was started with this module, so the child renderer runs. */
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The text alternative from a leading `%% alt: …` Mermaid comment, or an empty string. */
export function altFromSource(source: string): string {
  const match = /^\s*%%\s*alt\s*:\s*(.+)$/im.exec(source);
  return match?.[1]?.trim() ?? "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * Adds the accessible name and role to a rendered SVG, and removes anything that would run in the
 * browser. Mermaid's own script and event hooks stay out of the page: rendering happened at build time.
 */
export function accessibleSvg(svg: string, alt: string): string {
  let out = svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\srole\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
  out = out.replace(/<svg\b/i, '<svg role="img"');
  if (alt !== "") {
    out = out.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
      const clean = attrs.replace(/\saria-label\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
      return `<svg${clean} aria-label="${escapeAttr(alt)}"><title>${escapeHtml(alt)}</title>`;
    });
  }
  return out;
}

/** Renders a diagram through the child renderer, or returns its cached result. */
export function renderDiagram(source: string): RenderResult {
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  const result = runRenderer(source);
  cache.set(source, result);
  return result;
}

function runRenderer(source: string): RenderResult {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--render"], {
    input: source,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  if (child.error) return { ok: false, error: child.error.message };
  const stdout = typeof child.stdout === "string" ? child.stdout : "";
  if (child.status !== 0) {
    const stderr = typeof child.stderr === "string" ? child.stderr.trim() : "";
    return { ok: false, error: stderr === "" ? `renderer exited with ${String(child.status)}` : stderr };
  }
  try {
    const parsed = JSON.parse(stdout) as { ok?: unknown; svg?: unknown; error?: unknown };
    if (parsed.ok === true && typeof parsed.svg === "string") return { ok: true, svg: parsed.svg };
    return { ok: false, error: typeof parsed.error === "string" ? parsed.error : "renderer returned no SVG" };
  } catch {
    return { ok: false, error: "renderer produced invalid output" };
  }
}

/** The diagram and its source. The SVG is rendered at build time; the page never loads Mermaid. */
export default function mermaid({ props }: ComponentProps<MermaidProps>) {
  const source = text(props.source);
  if (source === "") return null;

  const alt = text(props.alt) || altFromSource(source);
  const src = text(props.src);
  const result = renderDiagram(source);

  const diagram =
    result.ok
      ? h("div", {
          class: DIAGRAM_CLASS,
          dangerouslySetInnerHTML: { __html: accessibleSvg(result.svg, alt) },
        })
      : h(
          "div",
          { class: FALLBACK_CLASS, role: "note" },
          h("p", null, "This diagram could not be rendered. The source below is complete."),
        );

  return h(
    "figure",
    { class: MERMAID_CLASS, ...(src === "" ? {} : { "data-src": src }) },
    diagram,
    h(
      "details",
      { class: SOURCE_CLASS },
      h("summary", null, "Diagram source"),
      h("pre", null, h("code", { class: "language-mermaid" }, source)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Child renderer: Mermaid + jsdom, run in its own process so the build stays synchronous.
// ---------------------------------------------------------------------------

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** A jsdom element as the measurement code sees it, without pulling DOM types into the theme. */
interface AnyElement {
  readonly tagName: string;
  readonly children: ArrayLike<AnyElement>;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface MeasureTarget {
  getBBox(this: AnyElement): { x: number; y: number; width: number; height: number };
  getComputedTextLength(this: AnyElement): number;
}

/** jsdom has no CSSStyleSheet; Mermaid only inserts and reads rules. */
class StyleSheetPolyfill {
  cssRules: Array<{ cssText: string }> = [];

  insertRule(rule: string, index = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }

  replaceSync(text: string): void {
    this.cssRules = [{ cssText: text }];
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0]! * right[0]! + left[2]! * right[1]!,
    left[1]! * right[0]! + left[3]! * right[1]!,
    left[0]! * right[2]! + left[2]! * right[3]!,
    left[1]! * right[2]! + left[3]! * right[3]!,
    left[0]! * right[4]! + left[2]! * right[5]! + left[4]!,
    left[1]! * right[4]! + left[3]! * right[5]! + left[5]!,
  ];
}

function parseTransform(value: string): Matrix {
  let matrix = IDENTITY;
  for (const match of value.matchAll(/(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g)) {
    const numbers = (match[2] ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
    const name = match[1];
    if (name === "translate") {
      matrix = multiply(matrix, [1, 0, 0, 1, numbers[0] ?? 0, numbers[1] ?? 0]);
    } else if (name === "scale") {
      matrix = multiply(matrix, [numbers[0] ?? 1, 0, 0, numbers[1] ?? numbers[0] ?? 1, 0, 0]);
    } else if (name === "rotate") {
      const radians = ((numbers[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      matrix = multiply(matrix, [cos, sin, -sin, cos, 0, 0]);
    } else if (name === "matrix" && numbers.length === 6) {
      matrix = multiply(matrix, numbers as unknown as Matrix);
    }
  }
  return matrix;
}

function numberAttribute(element: AnyElement, name: string): number {
  const value = Number(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : 0;
}

function addPoint(box: Box, matrix: Matrix, x: number, y: number): void {
  const tx = matrix[0]! * x + matrix[2]! * y + matrix[4]!;
  const ty = matrix[1]! * x + matrix[3]! * y + matrix[5]!;
  if (tx < box.x0) box.x0 = tx;
  if (ty < box.y0) box.y0 = ty;
  if (tx > box.x1) box.x1 = tx;
  if (ty > box.y1) box.y1 = ty;
}

function localBox(element: AnyElement, matrix: Matrix, box: Box): void {
  const tag = element.tagName.toLowerCase();
  const points: Array<readonly [number, number]> = [];
  if (tag === "rect") {
    const x = numberAttribute(element, "x");
    const y = numberAttribute(element, "y");
    const width = numberAttribute(element, "width");
    const height = numberAttribute(element, "height");
    points.push([x, y], [x + width, y], [x, y + height], [x + width, y + height]);
  } else if (tag === "circle") {
    const cx = numberAttribute(element, "cx");
    const cy = numberAttribute(element, "cy");
    const radius = numberAttribute(element, "r");
    points.push([cx - radius, cy - radius], [cx + radius, cy + radius]);
  } else if (tag === "ellipse") {
    const cx = numberAttribute(element, "cx");
    const cy = numberAttribute(element, "cy");
    const rx = numberAttribute(element, "rx");
    const ry = numberAttribute(element, "ry");
    points.push([cx - rx, cy - ry], [cx + rx, cy + ry]);
  } else if (tag === "line") {
    points.push(
      [numberAttribute(element, "x1"), numberAttribute(element, "y1")],
      [numberAttribute(element, "x2"), numberAttribute(element, "y2")],
    );
  } else if (tag === "polygon" || tag === "polyline") {
    const numbers = (element.getAttribute("points") ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i] ?? 0, numbers[i + 1] ?? 0]);
  } else if (tag === "path") {
    const numbers = (element.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i] ?? 0, numbers[i + 1] ?? 0]);
  } else if (tag === "text" || tag === "tspan") {
    const x = numberAttribute(element, "x");
    const y = numberAttribute(element, "y");
    const lines = (element.textContent ?? "").split("\n");
    const width = Math.max(0, ...lines.map((line) => line.length)) * 8;
    const height = Math.max(1, lines.length) * 16;
    points.push([x, y - height], [x + width, y - height], [x, y], [x + width, y]);
  } else if (tag === "foreignobject") {
    const x = numberAttribute(element, "x");
    const y = numberAttribute(element, "y");
    const width = numberAttribute(element, "width");
    const height = numberAttribute(element, "height");
    points.push([x, y], [x + width, y], [x, y + height], [x + width, y + height]);
  }
  for (const [x, y] of points) addPoint(box, matrix, x, y);
}

const SKIP = new Set([
  "defs",
  "style",
  "marker",
  "clippath",
  "mask",
  "pattern",
  "lineargradient",
  "radialgradient",
  "filter",
  "symbol",
]);

function walk(element: AnyElement, matrix: Matrix, box: Box): void {
  if (SKIP.has(element.tagName.toLowerCase())) return;
  const transform = element.getAttribute("transform");
  const own = transform === null ? matrix : multiply(matrix, parseTransform(transform));
  localBox(element, own, box);
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (child !== undefined) walk(child, own, box);
  }
}

function measured(element: AnyElement, box: Box): { x: number; y: number; width: number; height: number } {
  if (box.x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 };
}

export function installMeasurement(prototype: MeasureTarget): void {
  prototype.getBBox = function (this: AnyElement) {
    const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const tag = this.tagName.toLowerCase();
    if (tag === "svg" || tag === "g") {
      const transform = this.getAttribute("transform");
      const own = transform === null ? IDENTITY : parseTransform(transform);
      for (let i = 0; i < this.children.length; i++) {
        const child = this.children[i];
        if (child !== undefined) walk(child, own, box);
      }
    } else {
      localBox(this, IDENTITY, box);
    }
    return measured(this, box);
  };
  prototype.getComputedTextLength = function (this: AnyElement) {
    return (this.textContent ?? "").length * 8;
  };
}

async function renderInProcess(source: string): Promise<string> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { pretendToBeVisual: true });
  const global = globalThis as unknown as Record<string, unknown>;
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  global.DOMParser = dom.window.DOMParser;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.SVGElement = dom.window.SVGElement;
  global.CSSStyleSheet = StyleSheetPolyfill;
  installMeasurement(dom.window.SVGElement.prototype as unknown as MeasureTarget);

  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "inherit",
    // SVG text labels, not foreignObject HTML: they measure in jsdom, style from tokens, and read
    // as text when JavaScript is off.
    htmlLabels: false,
  });
  // A stable id per source keeps marker and accessibility ids unique when a page has several diagrams.
  const id = `mermaid-${createHash("sha1").update(source).digest("hex").slice(0, 12)}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}

async function runChild(): Promise<number> {
  // Mermaid logs through console.log; keep stdout for the one JSON result.
  console.log = (...args: unknown[]) => console.error(...args);
  const source = await readStdin();
  try {
    const svg = await renderInProcess(source);
    process.stdout.write(JSON.stringify({ ok: true, svg }));
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return 0;
  }
}

if (invokedDirectly) process.exitCode = await runChild();
