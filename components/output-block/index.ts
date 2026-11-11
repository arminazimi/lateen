import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { bodyText, variableNamesOf } from "../terminal/index.ts";

/** The Markdown directive this component handles: `:::output-block`. */
export const directive = "output-block";

/** Class on the frame that holds the copy bar and the body. `style.css` styles it. */
export const BLOCK_CLASS = "output-block";

/** Class on the bar that holds the copy button and the live status. */
export const BAR_CLASS = "output-block-bar";

/** Class on the `pre` that holds the output. */
export const BODY_CLASS = "output-block-body";

/** Class on the copy button. It starts `hidden`; `client.ts` reveals it. */
export const COPY_CLASS = "output-block-copy";

/** Class on the live region that reports a copy. `client.ts` writes to it. */
export const STATUS_CLASS = "output-block-status";

/** Class on the note that says the output is older than the inputs. `client.ts` fills it in. */
export const STALE_CLASS = "output-block-stale";

/** The i18n key of the default accessible name. */
export const LABEL_KEY = "output";

/** The i18n key of the note shown when the reader changed a value the output was produced with. */
export const STALE_KEY = "output_stale";

export type OutputBlockProps = {
  /** Accessible name of the group; "Output" when absent. */
  label?: string;
  /** JSON array of variable names this output was produced with, in addition to the ones its text mentions: `["project"]`. */
  deps?: string;
};

/** The variable-name contract a declaration must follow: letters, digits, `.`, `_`, and `-`. */
const VARIABLE_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * The explicit dependency names in the `deps` prop, in order, once each. The value is a JSON array of
 * strings; anything that is not a JSON array gives none, and an item that is not a variable name is
 * dropped so one malformed declaration cannot hide the valid ones beside it.
 */
export function parseDependencies(raw: string | undefined): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (name === "" || !VARIABLE_NAME.test(name) || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

/** The plain text of a rendered body, or `""` when it holds nothing but whitespace. */
export function outputText(html: string): string {
  const text = bodyText(html);
  return text.trim() === "" ? "" : text;
}

/**
 * The result of a command, kept apart from the input above it by a dashed edge and the surface color.
 * The body is plain text, so it reads as written with no JavaScript and no highlighting. The copy
 * button copies the whole body and nothing else; it starts `hidden` and `client.ts` reveals it, so a
 * visitor without JavaScript sees no control that would do nothing.
 *
 * A body that names variables records them in `data-output-deps`, and the variables form island marks the
 * block stale when the reader changes one: nobody can run the command again from here, so the recorded text
 * is never rewritten into output it did not print. An output that never repeats its inputs, such as an exit
 * status or a timing result, declares them in `deps`; the declared names join the ones the text mentions.
 */
export default function outputBlock({ props, html, page }: ComponentProps<OutputBlockProps>) {
  const text = outputText(html);
  if (text === "") return null;

  const lang = page.lang;
  const label = props.label?.trim() || t(lang, LABEL_KEY);
  const dependencies = [...new Set([...variableNamesOf(text), ...parseDependencies(props.deps)])];

  return h(
    "div",
    {
      class: BLOCK_CLASS,
      role: "group",
      "aria-label": label,
      ...(dependencies.length === 0
        ? {}
        : {
            "data-output-deps": JSON.stringify(dependencies.map((name) => ({ name }))),
            "data-stale-text": t(lang, STALE_KEY),
          }),
    },
    h(
      "div",
      { class: BAR_CLASS },
      dependencies.length === 0
        ? null
        : h("span", { class: STALE_CLASS, role: "status", "data-output-stale-note": true }),
      h(
        "button",
        {
          type: "button",
          class: COPY_CLASS,
          hidden: true,
          "data-output-copy": true,
          "data-output": text,
          "data-copied": t(lang, "copied"),
          "data-copy-failed": t(lang, "copy_failed_select"),
        },
        t(lang, "copy"),
      ),
      h("span", { class: STATUS_CLASS, role: "status", "data-output-status": true }),
    ),
    h("pre", { class: BODY_CLASS, tabindex: 0 }, h("code", null, text)),
  );
}
