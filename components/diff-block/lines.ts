/**
 * Diff block lines: the pure part of the `diff-block` component. A line's first character says what it
 * is — `+` for an added line, `-` for a removed one, a space for context — and is taken off the text
 * here, at build time, so the copy controls receive clean code and the visible line keeps only the
 * code. File and hunk headers keep their authored text and carry whatever metadata the author wrote;
 * a header this parser cannot read stays text and is marked unknown, never given invented positions.
 */

/** What a line does: add text, remove it, keep it, or head a file, hunk, or the diff itself. */
export type DiffLineKind = "added" | "removed" | "context" | "file" | "hunk" | "meta";

/** The numbered range of one side of a hunk. A count the author left out stays undefined. */
export interface DiffHunkRange {
  /** The first line on this side, as authored. */
  readonly start: number;
  /** The number of lines on this side, only when the author wrote one. */
  readonly count?: number;
}

/** The authored metadata of a hunk header: its two ranges and any section text after them. */
export interface DiffHunk {
  readonly old: DiffHunkRange;
  readonly new: DiffHunkRange;
  /** The text after the closing `@@`, which names the enclosing function or section. */
  readonly section?: string;
}

/** The paths a file header names. A side that is `/dev/null` or absent stays undefined. */
export interface DiffFile {
  readonly oldPath?: string;
  readonly newPath?: string;
}

/** One line of a diff, after its marker has been read. */
export interface DiffLine {
  /** Whether the line is added, removed, context, or a file, hunk, or meta header. */
  readonly kind: DiffLineKind;
  /** The display text: the code without its marker, or the whole header as authored. */
  readonly text: string;
  /** The authored line, marker and all, so the patch export can reproduce it exactly. */
  readonly raw: string;
  /** Present on a file header the parser could read. */
  readonly file?: DiffFile;
  /** Present on a hunk header whose ranges could be read. */
  readonly hunk?: DiffHunk;
  /** Present on a header-shaped line whose metadata could not be read; its text is preserved. */
  readonly unknown?: true;
}

/** A file header, which is never a marker line. Mirrors `components/code/diff.ts`. */
const FILE_HEADER =
  /^(diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files |GIT binary patch)/;

/** A hunk header: two ranges and an optional section. The counts are optional, as in a real patch. */
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: (.*))?$/;

/** The authored path on one side of a file header; `/dev/null` names no file. */
function pathOf(value: string): string | undefined {
  return value === "/dev/null" ? undefined : value;
}

/** A file header's paths, read from whichever of `diff --git`, `---`, or `+++` is present. */
function fileOf(raw: string): DiffFile {
  const git = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
  const old = /^--- ([^\t]*)/.exec(raw)?.[1];
  const next = /^\+\+\+ ([^\t]*)/.exec(raw)?.[1];
  const oldPath = git?.[1] ?? (old === undefined ? undefined : pathOf(old));
  const newPath = git?.[2] ?? (next === undefined ? undefined : pathOf(next));
  return {
    ...(oldPath === undefined ? {} : { oldPath }),
    ...(newPath === undefined ? {} : { newPath }),
  };
}

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

/** A hunk header as authored, with only the counts the author wrote. */
function hunkOf(raw: string): DiffHunk | undefined {
  const match = HUNK.exec(raw);
  if (match === null) return undefined;
  const [, oldStart, oldCount, newStart, newCount, section] = match;
  return {
    old: { start: Number(oldStart), ...(oldCount === undefined ? {} : { count: Number(oldCount) }) },
    new: { start: Number(newStart), ...(newCount === undefined ? {} : { count: Number(newCount) }) },
    ...(section === undefined ? {} : { section }),
  };
}

/**
 * Splits diff text into lines and reads each line's marker and metadata. `+` is added, `-` removed, a
 * leading space context, and a file or hunk header keeps its authored text and any positions it
 * declares. A header whose metadata is malformed stays text with `unknown`, so no invented line
 * number reaches the page. Every content marker is taken off the display text, so it exists only in
 * the component's markup and in the patch export, never in the resulting source.
 */
export function parseDiff(text: string): DiffLine[] {
  if (text === "") return [];
  return text.split("\n").map((line): DiffLine => {
    if (line.startsWith("@@")) {
      const hunk = hunkOf(line);
      return hunk === undefined
        ? { kind: "hunk", text: line, raw: line, unknown: true }
        : { kind: "hunk", text: line, raw: line, hunk };
    }
    if (FILE_HEADER.test(line)) {
      const file = fileOf(line);
      return Object.keys(file).length === 0
        ? { kind: "file", text: line, raw: line }
        : { kind: "file", text: line, raw: line, file };
    }
    if (line.startsWith("\\ ")) return { kind: "meta", text: line, raw: line };
    const marker = line.charAt(0);
    if (marker === "+") return { kind: "added", text: line.slice(1), raw: line };
    if (marker === "-") return { kind: "removed", text: line.slice(1), raw: line };
    if (marker === " ") return { kind: "context", text: line.slice(1), raw: line };
    return { kind: "context", text: line, raw: line };
  });
}

/** The new version of the file: added and context lines, without markers or headers, one per line. */
export function copyText(lines: readonly DiffLine[]): string {
  return lines
    .filter((line) => line.kind === "added" || line.kind === "context")
    .map((line) => line.text)
    .join("\n");
}

/** The authored unified diff exactly as written: every marker, header, and context line, in order. */
export function patchText(lines: readonly DiffLine[]): string {
  return lines.map((line) => line.raw).join("\n");
}
