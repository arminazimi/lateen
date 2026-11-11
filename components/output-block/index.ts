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
};

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
 * is never rewritten into output it did not print.
 *
 * shortcut: only a body that mentions a variable is known to depend on it, so an output whose text does not
 * repeat the value is never marked stale; give such an output a body that names the variable, or upgrade this
 * when the engine can tie a command to the block that follows it.
 */
export default function outputBlock({ props, html, page }: ComponentProps<OutputBlockProps>) {
  const text = outputText(html);
  if (text === "") return null;

  const lang = page.lang;
  const label = props.label?.trim() || t(lang, LABEL_KEY);
  const dependencies = variableNamesOf(text);

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
