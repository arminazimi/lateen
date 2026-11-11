import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `:::terminal`. */
export const directive = "terminal";

/** Class on the frame that holds the copy bar and the body. `style.css` styles it. */
export const TERMINAL_CLASS = "terminal";

/** Class on the `pre` that holds the session. */
export const BODY_CLASS = "terminal-body";

/** Class on the copy button. It starts `hidden`; `client.ts` reveals it. */
export const COPY_CLASS = "terminal-copy";

/** The prompt a command line starts with. Lines that do not start with it are output. */
export const PROMPT = "$";

/** One line of a session: a command the reader can copy, or output that is only shown. */
export type TerminalLine = { readonly kind: "command" | "output"; readonly text: string };

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
 * newlines, every tag is dropped, and entities are decoded. Trailing newlines are removed. Works for a
 * paragraph of lines and for a fenced block inside `:::terminal` alike.
 */
export function bodyText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|pre|li|div)>/gi, "\n");
  return decode(stripTags(withBreaks))
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
}

/**
 * Splits session text into lines. A line that starts with `$` is a command: the prompt and one space
 * after it are removed. Every other line is output, kept as written.
 */
export function parseLines(text: string): TerminalLine[] {
  if (text === "") return [];
  return text.split("\n").map((line): TerminalLine => {
    if (!line.startsWith(PROMPT)) return { kind: "output", text: line };
    return { kind: "command", text: line.slice(PROMPT.length).replace(/^ /, "") };
  });
}

/** A `{{name}}` in plain text: the engine's rule, so `.` and `-` names work and spaces inside the braces do. */
const PLACEHOLDER = /\{\{[ \t]*([A-Za-z0-9_.-]+)[ \t]*\}\}/g;

/**
 * The variables a plain-text body names, in order, once each. `\{{name}}` is escape-written and stays
 * literal, so it is not a variable: an odd run of backslashes before the braces escapes one.
 */
export function variableNamesOf(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    let slashes = 0;
    for (let i = (match.index ?? 0) - 1; i >= 0 && text.charAt(i) === "\\"; i--) slashes += 1;
    const name = match[1];
    if (slashes % 2 === 1 || name === undefined || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

/** The commands of a session, one per line, and nothing else: this is what the copy button takes. */
export function commandsOf(lines: readonly TerminalLine[]): string {
  return lines
    .filter((line) => line.kind === "command")
    .map((line) => line.text)
    .join("\n");
}

function lineElement(line: TerminalLine) {
  if (line.kind === "output") {
    return h("span", { class: "terminal-line terminal-output" }, line.text);
  }
  return h(
    "span",
    { class: "terminal-line terminal-command" },
    h("span", { class: "terminal-prompt", "aria-hidden": "true" }, `${PROMPT} `),
    h("span", { class: "terminal-text" }, line.text),
  );
}

/**
 * A shell session: each `$` line is a command with its prompt, every other line is output. The copy
 * button, when there is a command, puts only the commands on the clipboard. It starts `hidden` and
 * `client.ts` reveals it, so a visitor without JavaScript sees no control that would do nothing.
 *
 * The code element records the variables the session names in `data-placeholders`, the shape the engine gives
 * a code block, so the variables form island follows the reader's values here too. The button's `data-commands`
 * is the command text without the prompts, and `client.ts` reads the commands from the page again when it
 * copies, so a value changed on screen is the value copied.
 */
export default function terminal({ html, page }: ComponentProps) {
  const text = bodyText(html);
  const lines = parseLines(text);
  const variables = variableNamesOf(text);
  const commands = commandsOf(lines);
  const lang = page.lang;
  const hasCommands = lines.some((line) => line.kind === "command");

  return h(
    "div",
    { class: TERMINAL_CLASS },
    hasCommands
      ? h(
          "div",
          { class: "terminal-bar" },
          h(
            "button",
            {
              type: "button",
              class: COPY_CLASS,
              hidden: true,
              "data-terminal-copy": true,
              "data-commands": commands,
              "data-copied": t(lang, "copied"),
              "data-copy-failed": t(lang, "copy_failed"),
            },
            t(lang, "copy"),
          ),
        )
      : null,
    h(
      "pre",
      { class: BODY_CLASS, tabindex: 0 },
      h(
        "code",
        variables.length === 0 ? {} : { "data-placeholders": JSON.stringify(variables.map((name) => ({ name }))) },
        ...lines.map(lineElement),
      ),
    ),
  );
}
