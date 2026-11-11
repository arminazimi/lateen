import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { bodyText, parseDiff, patchText, sourceFilesOf, type DiffLine } from "./lines.ts";

/** The Markdown directive this component handles: `:::diff-block`. */
export const directive = "diff-block";

/** Class on the outer group. `style.css` styles it; `client.ts` finds the copy controls inside it. */
export const GROUP_CLASS = "diff-block";

/** Class on the bar that holds the copy actions. */
export const BAR_CLASS = "diff-block-bar";

/** Class on one copy action: its button and its live status. */
export const ACTION_CLASS = "diff-block-action";

/** Class on the copy buttons. They start `hidden`; `client.ts` reveals them. */
export const COPY_CLASS = "diff-block-copy";

/** Class on the live region that announces a copy's result for its own action. */
export const STATUS_CLASS = "diff-block-status";

/** Class on the ordered list of lines. */
export const LIST_CLASS = "diff-block-lines";

/** Class every line carries, next to its kind's class. */
export const LINE_CLASS = "diff-block-line";

/** Class on an added line. */
export const ADDED_CLASS = "diff-block-added";

/** Class on a removed line. */
export const REMOVED_CLASS = "diff-block-removed";

/** Class on a context line and on the file, hunk, and meta headers shown between them. */
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
  file: CONTEXT_CLASS,
  hunk: CONTEXT_CLASS,
  meta: CONTEXT_CLASS,
};

export type DiffBlockProps = {
  /** Prefix for the block's label id. Give each identical block on a page its own id. */
  id?: string;
};

/** The labels of the two copy actions, in the languages the theme ships. */
const LABELS: Readonly<Record<string, { readonly source: string; readonly patch: string }>> = {
  en: { source: "Copy source", patch: "Copy patch" },
  fa: { source: "کپی نتیجه", patch: "کپی وصله" },
  ar: { source: "نسخ الناتج", patch: "نسخ التصحيح" },
};

/**
 * The two action labels for a page language. They live here, not in the shared catalogs: this
 * component owns its wording until the catalogs carry diff-export keys, and a language without an
 * entry falls back to English the way `t()` does.
 */
export function actionLabels(lang: string): { readonly source: string; readonly patch: string } {
  const code = (lang.toLowerCase().split(/[-_]/)[0] ?? "").toLowerCase();
  return LABELS[code] ?? LABELS.en!;
}

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

/** The machine-readable line kind and any authored file or hunk metadata, without invented values. */
function lineData(line: DiffLine): Record<string, string | number> {
  const data: Record<string, string | number> = { "data-kind": line.kind };
  if (line.file?.oldPath !== undefined) data["data-file-old"] = line.file.oldPath;
  if (line.file?.newPath !== undefined) data["data-file-new"] = line.file.newPath;
  if (line.hunk !== undefined) {
    data["data-hunk-old-start"] = line.hunk.old.start;
    if (line.hunk.old.count !== undefined) data["data-hunk-old-count"] = line.hunk.old.count;
    data["data-hunk-new-start"] = line.hunk.new.start;
    if (line.hunk.new.count !== undefined) data["data-hunk-new-count"] = line.hunk.new.count;
    if (line.hunk.section !== undefined) data["data-hunk-section"] = line.hunk.section;
  }
  if (line.unknown === true) data["data-hunk-unknown"] = "true";
  return data;
}

/** One line: its kind for assistive tech, its visible marker, and its code. */
function lineElement(line: DiffLine, lang: string) {
  const added = line.kind === "added";
  const removed = line.kind === "removed";
  const prefix = added ? t(lang, "diff_added") : removed ? t(lang, "diff_removed") : "";
  return h(
    "li",
    { class: `${LINE_CLASS} ${KIND_CLASS[line.kind]}`, ...lineData(line) },
    prefix === "" ? null : h("span", { class: SR_CLASS }, `${prefix} `),
    h("span", { class: MARKER_CLASS, "aria-hidden": "true" }, added ? "+" : removed ? "−" : ""),
    h("span", { class: TEXT_CLASS }, line.text),
  );
}

/** One copy action: a button that starts hidden and a live region of its own. */
function actionElement(
  label: string,
  data: Record<string, string | boolean>,
  lang: string,
) {
  return h(
    "span",
    { class: ACTION_CLASS },
    h(
      "button",
      {
        type: "button",
        class: COPY_CLASS,
        hidden: true,
        ...data,
        "data-copied": t(lang, "copied"),
        "data-copy-failed": t(lang, "copy_failed"),
      },
      label,
    ),
    h("span", { class: `${SR_CLASS} ${STATUS_CLASS}`, role: "status", "data-diff-status": true }),
  );
}

/**
 * `:::diff-block` renders a diff as an ordered list: added lines carry a `+`, removed lines a `−`, and
 * every added or removed line also says "Added:" or "Removed:" to a screen reader, so the meaning never
 * rests on colour. Copy actions start `hidden` and `client.ts` reveals them: one copies the authored
 * patch line for line, and each file gets its own source action with removed lines and headers left out.
 * Without JavaScript the list still shows and selects the whole diff, and both texts are on the
 * buttons' `data-*` attributes.
 */
export default function diffBlock({ props, html, page }: ComponentProps<DiffBlockProps>) {
  const lines = parseDiff(bodyText(html));
  if (lines.length === 0) return null;

  const lang = page.lang;
  const labelId = `${idBase(props.id, html)}-label`;
  const labels = actionLabels(lang);
  const sources = sourceFilesOf(lines);

  return h(
    "div",
    { class: GROUP_CLASS, role: "group", "aria-labelledby": labelId },
    h("span", { class: SR_CLASS, id: labelId }, t(lang, "diff")),
    h(
      "div",
      { class: BAR_CLASS },
      ...sources.map((source, index) =>
        actionElement(
          sources.length > 1 ? `${labels.source}: ${source.path ?? String(index + 1)}` : labels.source,
          { "data-diff-copy": true, "data-diff": source.text },
          lang,
        ),
      ),
      actionElement(labels.patch, { "data-patch-copy": true, "data-patch": patchText(lines) }, lang),
    ),
    h("ol", { class: LIST_CLASS }, ...lines.map((line) => lineElement(line, lang))),
  );
}
