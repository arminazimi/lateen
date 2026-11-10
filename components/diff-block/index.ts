import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { bodyText, copyText, parseDiff, type DiffLine } from "./lines.ts";

/** The Markdown directive this component handles: `:::diff-block`. */
export const directive = "diff-block";

/** Class on the outer group. `style.css` styles it; `client.ts` finds the copy control inside it. */
export const GROUP_CLASS = "diff-block";

/** Class on the bar that holds the copy button. */
export const BAR_CLASS = "diff-block-bar";

/** Class on the copy button. It starts `hidden`; `client.ts` reveals it. */
export const COPY_CLASS = "diff-block-copy";

/** Class on the ordered list of lines. */
export const LIST_CLASS = "diff-block-lines";

/** Class every line carries, next to its kind's class. */
export const LINE_CLASS = "diff-block-line";

/** Class on an added line. */
export const ADDED_CLASS = "diff-block-added";

/** Class on a removed line. */
export const REMOVED_CLASS = "diff-block-removed";

/** Class on a context or header line. */
export const CONTEXT_CLASS = "diff-block-context";

/** Class on the visible `+`, `−`, or space marker, which is hidden from assistive tech. */
export const MARKER_CLASS = "diff-block-marker";

/** Class on the line's code text. */
export const TEXT_CLASS = "diff-block-text";

/** Class on text for assistive tech only: the block's label and each line's kind. */
export const SR_CLASS = "diff-block-sr";

const KIND_CLASS: Readonly<Record<DiffLine["kind"], string>> = {
  added: ADDED_CLASS,
  removed: REMOVED_CLASS,
  context: CONTEXT_CLASS,
};

export type DiffBlockProps = {
  /** Prefix for the block's label id. Give each identical block on a page its own id. */
  id?: string;
};

/** A stable id from the block's text, so two different blocks on a page get different label ids. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The id prefix from the prop, or one derived from the text when the prop gives none. */
export function idBase(raw: string | undefined, text: string): string {
  const clean = (raw ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean || `diff-block-${fingerprint(text)}`;
}

/** One line: its kind for assistive tech, its visible marker, and its code. */
function lineElement(line: DiffLine, lang: string) {
  const added = line.kind === "added";
  const removed = line.kind === "removed";
  const prefix = added ? t(lang, "diff_added") : removed ? t(lang, "diff_removed") : "";
  return h(
    "li",
    { class: `${LINE_CLASS} ${KIND_CLASS[line.kind]}` },
    prefix === "" ? null : h("span", { class: SR_CLASS }, `${prefix} `),
    h("span", { class: MARKER_CLASS, "aria-hidden": "true" }, added ? "+" : removed ? "−" : ""),
    h("span", { class: TEXT_CLASS }, line.text),
  );
}

/**
 * `:::diff-block` renders a diff as an ordered list: added lines carry a `+`, removed lines a `−`, and
 * every added or removed line also says "Added:" or "Removed:" to a screen reader, so the meaning never
 * rests on colour. The copy control starts `hidden` and `client.ts` reveals it; without JavaScript the
 * list still shows and selects the whole diff, and the copy text is on the button's `data-diff`.
 */
export default function diffBlock({ props, html, page }: ComponentProps<DiffBlockProps>) {
  const lines = parseDiff(bodyText(html));
  if (lines.length === 0) return null;

  const lang = page.lang;
  const labelId = `${idBase(props.id, html)}-label`;
  const text = copyText(lines);

  return h(
    "div",
    { class: GROUP_CLASS, role: "group", "aria-labelledby": labelId },
    h("span", { class: SR_CLASS, id: labelId }, t(lang, "diff")),
    h(
      "div",
      { class: BAR_CLASS },
      h(
        "button",
        {
          type: "button",
          class: COPY_CLASS,
          hidden: true,
          "data-diff-copy": true,
          "data-diff": text,
          "data-copied": t(lang, "copied"),
          "data-copy-failed": t(lang, "copy_failed"),
        },
        t(lang, "copy"),
      ),
    ),
    h("ol", { class: LIST_CLASS }, ...lines.map((line) => lineElement(line, lang))),
  );
}
