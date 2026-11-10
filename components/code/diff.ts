/**
 * Inserted and deleted lines in code blocks, from fence meta (`ins={2}`, `del={4}`) or from a `diff`
 * fence. Pure functions over the build-time HTML that Shiki produces, so the code component can call
 * them without any runtime cost. A marker is a class on the line's span that `style.css` turns into a
 * `+` or `−`, and in a `diff` fence the marker character is taken off the text here, at build time, so
 * selecting or copying a block gets only the code.
 */

import { isHighlighted, type LineRange } from "./lines.ts";

/** Class added to an inserted line; CSS renders its `+` marker. */
export const INS_CLASS = "ins";

/** Class added to a deleted line; CSS renders its `−` marker. */
export const DEL_CLASS = "del";

/** Languages whose lines carry the marker as their first character; `patch` is the common alias. */
export const DIFF_LANGS: ReadonlySet<string> = new Set(["diff", "patch"]);

/** True when a fence of this language is a diff fence. */
export function isDiffLang(lang: string | undefined): boolean {
  return DIFF_LANGS.has((lang ?? "").trim().toLowerCase());
}

export type DiffOptions = {
  /** Lines in the fence's `ins={…}`. */
  ins?: readonly LineRange[];
  /** Lines in the fence's `del={…}`. */
  del?: readonly LineRange[];
};

/** Puts `classes` at the end of the class attribute of the line's leading `span.line` wrapper. */
function withClasses(line: string, classes: string): string {
  return line.replace(/^<span class="([^"]*)"/, `<span class="$1 ${classes}"`);
}

/**
 * Marks lines from the fence's `ins={…}` and `del={…}`. Input is decorated line HTML — one
 * `<span class="line …">` per `\n`, as `decorateLines` returns it. A covered line gains the `ins`
 * or `del` class; CSS renders the marker, so the text keeps only the code. Nothing to mark leaves
 * the input as it is.
 */
export function markDiffLines(decorated: string, options: DiffOptions = {}): string {
  const ins = options.ins ?? [];
  const del = options.del ?? [];
  if (ins.length === 0 && del.length === 0) return decorated;
  return decorated
    .split("\n")
    .map((line, index) => {
      const number = index + 1;
      const classes = [isHighlighted(number, ins) ? INS_CLASS : "", isHighlighted(number, del) ? DEL_CLASS : ""]
        .filter(Boolean)
        .join(" ");
      return classes === "" ? line : withClasses(line, classes);
    })
    .join("\n");
}

/** A file or hunk header: never a marker line, so its text is left alone. Mirrors the copy island. */
const DIFF_HEADER = /^(diff |index |--- |\+\+\+ |@@ )/;

/** The HTML fragment's text: tags dropped, so a header split across token spans is still one text. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Index of the first character outside tags, where a marker character lives; `0` when no tag leads. */
function firstTextIndex(html: string): number {
  return /^(?:<[^>]*>)+/.exec(html)?.[0].length ?? 0;
}

/**
 * Turns a `diff` fence's markers into classes. Input is decorated line HTML — one `<span class="line …">`
 * per `\n`, as `decorateLines` returns it. Each line's first character is the marker: `+` becomes the
 * `ins` class, `-` the `del` class, a space a context line, and the character itself is taken off the
 * text, so the marker exists only in CSS and never in what a visitor copies. Headers (`diff `, `index `,
 * `--- `, `+++ `, `@@ `), lines without a marker, and blank lines keep their text and gain no class.
 */
export function stripDiffMarkers(decorated: string): string {
  return decorated
    .split("\n")
    .map((line) => {
      const text = textOf(line);
      if (DIFF_HEADER.test(text)) return line;
      const marker = text.charAt(0);
      const at = firstTextIndex(line);
      if (marker !== "+" && marker !== "-" && marker !== " ") return line;
      const stripped = line.slice(0, at) + line.slice(at + 1);
      return marker === "+" ? withClasses(stripped, INS_CLASS) : marker === "-" ? withClasses(stripped, DEL_CLASS) : stripped;
    })
    .join("\n");
}
