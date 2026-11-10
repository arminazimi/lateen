/**
 * Line highlighting and line numbers for code blocks. Pure functions over the build-time HTML that Shiki
 * produces, so the code component can call them without any runtime cost.
 */

/** A run of 1-based line numbers, inclusive: `3-5` is `{ from: 3, to: 5 }`. Same shape as the engine's `LineRange`. */
export type LineRange = { readonly from: number; readonly to: number };

export type LinesOptions = {
  /** Lines to highlight, from the fence's `{1,3-5}`. */
  highlight?: readonly LineRange[];
  /**
   * Number each line. The number is a `data-line` attribute and never text, so copying or selecting the
   * block gets only the code.
   */
  numbers?: boolean;
};

/** Class on each line's `span`. */
export const LINE_CLASS = "line";

/** Class added to a line that a highlight range covers. */
export const HIGHLIGHT_CLASS = "highlighted";

/** The wrapper Shiki puts around each line: `<span class="line">…</span>`. */
const SHIKI_LINE = /^<span class="line">([\s\S]*)<\/span>$/;

/** True when some range covers `line`. */
export function isHighlighted(line: number, ranges: readonly LineRange[]): boolean {
  return ranges.some((range) => line >= range.from && line <= range.to);
}

/** The line's own tokens, without Shiki's wrapper, so the wrapper is not nested twice. */
function unwrapLine(line: string): string {
  return SHIKI_LINE.exec(line)?.[1] ?? line;
}

/**
 * Wraps each line of Shiki's inner HTML (one line per `\n`) in a `span.line`. Covered lines get the
 * `highlighted` class, and with `numbers` every line gets its number as `data-line`.
 */
export function decorateLines(innerHtml: string, options: LinesOptions = {}): string {
  const ranges = options.highlight ?? [];
  return innerHtml
    .split("\n")
    .map((line, index) => {
      const number = index + 1;
      const classes = isHighlighted(number, ranges) ? `${LINE_CLASS} ${HIGHLIGHT_CLASS}` : LINE_CLASS;
      const numberAttr = options.numbers ? ` data-line="${number}"` : "";
      return `<span class="${classes}"${numberAttr}>${unwrapLine(line)}</span>`;
    })
    .join("\n");
}
