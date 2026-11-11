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

/** One line of a session: command input the reader can copy, or output that is only shown. */
export type TerminalLine = {
  readonly kind: "command" | "output";
  readonly text: string;
  /** The 0-based command this line belongs to; `null` for output before the first command. */
  readonly command: number | null;
  /** True for command input after the prompt line: a backslash continuation or a heredoc line. */
  readonly continuation: boolean;
};

/** One complete command and the output recorded after it: the record agents read. */
export type TerminalCommand = {
  /** The prompt that introduced the command, without the space after it. */
  readonly prompt: string;
  /** The whole command input without prompts, continuation and heredoc lines joined by newlines. */
  readonly input: string;
  /** The output lines that follow the command, unchanged. */
  readonly output: readonly string[];
};

/** One pending heredoc: its delimiter and whether `<<-` lets every line start with tabs. */
export interface Heredoc {
  readonly delimiter: string;
  readonly stripTabs: boolean;
}

/**
 * A heredoc opener in a command line: `<<EOF`, `<<-EOF`, `<< 'EOF'`, `<<"EOF"`, and `<<\EOF`.
 * `<<<` is a here-string, not a heredoc, and does not match.
 */
const HEREDOC = /(?<!<)<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\([A-Za-z0-9_.-]+)|([A-Za-z0-9_.-]+))/g;

/**
 * The heredocs a command line opens, in the order their bodies follow it. The text is read, never
 * shell-interpreted: quotes are not tracked, so any `<<` followed by a word opens a heredoc.
 */
export function heredocsOf(text: string): Heredoc[] {
  const found: Heredoc[] = [];
  for (const match of text.matchAll(HEREDOC)) {
    const delimiter = match[2] ?? match[3] ?? match[4] ?? match[5];
    if (delimiter === undefined || delimiter === "") continue;
    found.push({ delimiter, stripTabs: match[1] === "-" });
  }
  return found;
}

/** True when an odd run of backslashes ends the line, so the shell joins the next line to it. */
function continues(text: string): boolean {
  let count = 0;
  for (let index = text.length - 1; index >= 0 && text.charAt(index) === "\\"; index -= 1) count += 1;
  return count % 2 === 1;
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
 * Splits session text into lines and follows the command input. A line that starts with `$` opens a
 * command: the prompt and one space after it are removed. A command also keeps the lines its trailing
 * backslash continues and the bodies of the heredocs it opens, so no input line becomes output. Every
 * other line is output, kept as written. Nothing is executed or expanded.
 */
export function parseLines(text: string): TerminalLine[] {
  if (text === "") return [];
  const raw = text.split("\n");
  const lines: TerminalLine[] = [];
  let command = -1;
  let index = 0;

  while (index < raw.length) {
    const line = raw[index]!;
    if (!line.startsWith(PROMPT)) {
      lines.push({ kind: "output", text: line, command: command < 0 ? null : command, continuation: false });
      index += 1;
      continue;
    }

    command += 1;
    const own = command;
    const input = line.slice(PROMPT.length).replace(/^ /, "");
    lines.push({ kind: "command", text: input, command: own, continuation: false });
    index += 1;

    // Input past the prompt: heredoc bodies in order, then backslash continuations.
    const pending = heredocsOf(input);
    while (index < raw.length) {
      const next = raw[index]!;
      if (pending.length > 0) {
        const heredoc = pending[0]!;
        const terminates = (heredoc.stripTabs ? next.replace(/^\t+/, "") : next) === heredoc.delimiter;
        lines.push({ kind: "command", text: next, command: own, continuation: true });
        index += 1;
        if (terminates) pending.shift();
        continue;
      }
      if (!continues(lines[lines.length - 1]!.text)) break;
      lines.push({ kind: "command", text: next, command: own, continuation: true });
      index += 1;
      pending.push(...heredocsOf(next));
    }
  }

  return lines;
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

/** The commands of a session, complete with their continuations, and nothing else: this is what the copy button takes. */
export function commandsOf(lines: readonly TerminalLine[]): string {
  return lines
    .filter((line) => line.kind === "command")
    .map((line) => line.text)
    .join("\n");
}

/** The session as one record per command, in order, with the output that follows each of them. */
export function commandRecords(lines: readonly TerminalLine[]): TerminalCommand[] {
  const inputs: string[][] = [];
  const outputs: string[][] = [];
  for (const line of lines) {
    if (line.command === null) continue;
    if (line.kind === "command") (inputs[line.command] ??= []).push(line.text);
    else (outputs[line.command] ??= []).push(line.text);
  }

  return inputs.map((parts, index) => ({
    prompt: PROMPT,
    input: parts.join("\n"),
    output: outputs[index] ?? [],
  }));
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
export function commandJson(commands: readonly TerminalCommand[]): string {
  return JSON.stringify(commands).replace(/</g, "\\u003c");
}

function lineElement(line: TerminalLine) {
  if (line.kind === "output") {
    return h(
      "span",
      {
        class: "terminal-line terminal-output",
        "data-line": "output",
        ...(line.command === null ? {} : { "data-command": String(line.command) }),
      },
      line.text,
    );
  }

  const text = h("span", { class: "terminal-text" }, line.text);
  const attributes =
    line.command === null ? { "data-line": "command" } : { "data-line": "command", "data-command": String(line.command) };
  if (line.continuation) {
    return h("span", { class: "terminal-line terminal-command terminal-continuation", ...attributes }, text);
  }
  return h(
    "span",
    { class: "terminal-line terminal-command", ...attributes },
    h("span", { class: "terminal-prompt", "aria-hidden": "true" }, `${PROMPT} `),
    text,
  );
}

/**
 * A shell session: each `$` line is a command with its prompt, every other line is output. A command
 * keeps the lines a trailing backslash continues and the bodies of its heredocs, shown without a prompt,
 * so the copy button takes the whole input and never mixes output into it. The button starts `hidden`
 * and `client.ts` reveals it, so a visitor without JavaScript sees no control that would do nothing.
 *
 * The code element records the variables the session names in `data-placeholders`, the shape the engine gives
 * a code block, so the variables form island follows the reader's values here too. The button's `data-commands`
 * is the command text without the prompts, and `client.ts` reads the commands from the page again when it
 * copies, so a value changed on screen is the value copied. Each row says whether it is `command` or `output`
 * and, in `data-command`, which complete command it belongs to. An inert JSON script publishes the same
 * commands with the output recorded after each of them, so an agent can tell them apart without the styling.
 */
export default function terminal({ html, page }: ComponentProps) {
  const text = bodyText(html);
  const lines = parseLines(text);
  const variables = variableNamesOf(text);
  const commands = commandsOf(lines);
  const records = commandRecords(lines);
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
    records.length === 0
      ? null
      : h("script", {
          type: "application/json",
          "data-terminal-commands": "",
          dangerouslySetInnerHTML: { __html: commandJson(records) },
        }),
  );
}
