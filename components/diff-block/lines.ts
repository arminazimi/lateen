/**
 * Diff block lines: the pure part of the `diff-block` component. A line's first character says what it
 * is — `+` for an added line, `-` for a removed one, a space for context — and is taken off the text
 * here, at build time, so the copy control receives clean code and the visible line keeps only the
 * code. A line with no marker is context, and a file or hunk header keeps its text but stays out of
 * the copy, since a header is not part of the new file.
 */

/** What a line does to the file: adds text, removes it, or keeps it. */
export type DiffLineKind = "added" | "removed" | "context";

/** One line of a diff, after its marker has been read. */
export interface DiffLine {
  /** Whether the line is added, removed, or context. */
  readonly kind: DiffLineKind;
  /** The line's text without its `+`, `-`, or leading space. */
  readonly text: string;
  /** Present on a file or hunk header: shown with the diff, never part of what a copy takes. */
  readonly header?: true;
}

/** A file or hunk header, which is never a marker line. Mirrors `components/code/diff.ts`. */
const HEADER = /^(diff |index |--- |\+\+\+ |@@ )/;

const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes the entities a Markdown body carries: the named ones above and numeric references. */
function decode(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[ref.toLowerCase()] ?? match;
  });
}

/**
 * Drops every tag, repeating until none is left: removing one tag can join the pieces of another
 * (`<scrip<script>t>` becomes `<script>` after one pass), so a single pass is not enough.
 */
function stripTags(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== previous);
  return text;
}

/**
 * The plain text of a rendered body, with its line breaks kept: `<br>` and the end of a block become
 * newlines, every tag is dropped, and entities are decoded. Trailing newlines are removed. Works for
 * a paragraph of lines and for a fenced block inside `:::diff-block` alike.
 */
export function bodyText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|pre|li|div)>/gi, "\n");
  return decode(stripTags(withBreaks))
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
}

/**
 * Splits diff text into lines and reads each line's marker. `+` is added, `-` removed, a leading space
 * context, and a file or hunk header context that the copy leaves out. Every marker is taken off the
 * text, so it exists only in the component's markup, never in what a visitor copies.
 */
export function parseDiff(text: string): DiffLine[] {
  if (text === "") return [];
  return text.split("\n").map((line): DiffLine => {
    if (HEADER.test(line)) return { kind: "context", text: line, header: true };
    const marker = line.charAt(0);
    if (marker === "+") return { kind: "added", text: line.slice(1) };
    if (marker === "-") return { kind: "removed", text: line.slice(1) };
    if (marker === " ") return { kind: "context", text: line.slice(1) };
    return { kind: "context", text: line };
  });
}

/** The new version of the file: added and context lines, without markers or headers, one per line. */
export function copyText(lines: readonly DiffLine[]): string {
  return lines
    .filter((line) => line.kind !== "removed" && line.header !== true)
    .map((line) => line.text)
    .join("\n");
}
