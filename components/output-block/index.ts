import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { bodyText } from "../terminal/index.ts";

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

/** The i18n key of the default accessible name. */
export const LABEL_KEY = "output";

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
 */
export default function outputBlock({ props, html, page }: ComponentProps<OutputBlockProps>) {
  const text = outputText(html);
  if (text === "") return null;

  const lang = page.lang;
  const label = props.label?.trim() || t(lang, LABEL_KEY);

  return h(
    "div",
    { class: BLOCK_CLASS, role: "group", "aria-label": label },
    h(
      "div",
      { class: BAR_CLASS },
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
