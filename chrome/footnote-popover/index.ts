import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";

/** Id of the popover root, so `client.ts` can point `aria-describedby` at it. */
export const POPOVER_ID = "footnote-popover";

/** Whether a page's rendered HTML holds at least one GFM footnote reference. */
export function hasFootnoteRefs(html: string): boolean {
  return /data-footnote-ref(?:[\s=/>])/.test(html);
}

/**
 * The mount point for the footnote popover. GFM renders a reference as
 * `<sup><a … data-footnote-ref>1</a></sup>` and the notes in a `<section data-footnotes>`, so a
 * component cannot wrap either one: the island finds both and fills this span on hover or focus.
 *
 * It renders nothing on a page with no reference, and it starts `hidden`, so a visitor without
 * JavaScript sees no empty box and the reference stays a plain link to the note.
 */
const footnotePopover: Chrome = ({ page }) => {
  if (page.kind !== "doc" || !hasFootnoteRefs(page.html)) return null;

  return h("span", {
    id: POPOVER_ID,
    class: "footnote-popover",
    role: "tooltip",
    hidden: true,
    "data-footnote-popover": true,
  });
};

export default footnotePopover;
