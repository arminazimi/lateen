import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { paletteActions, palettePayload, type PaletteInput, type PalettePayload } from "./actions.ts";

/** Marks the server's JSON inside the search dialog; `chrome/search/client.ts` reads it once. */
export const PALETTE_ATTRIBUTE = "data-palette-actions";

/** The payload for a page, with the site's base folded into URLs that need it. */
export function payloadFor(page: PaletteInput["page"], base: string): PalettePayload {
  return palettePayload({ page, base });
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
export function paletteJson(payload: PalettePayload): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/**
 * The command palette's data: one JSON script the search dialog carries. The visible palette is the
 * search dialog itself, so this unit renders no second dialog: it only publishes the actions
 * (`chrome/command-palette/actions.ts`) for `chrome/search/client.ts` to group, filter, and run.
 *
 * `chrome/search/index.ts` places this inside the dialog. Nothing appears without JavaScript, and
 * the script is inert markup a reader never sees.
 */
const commandPalette: Chrome = ({ page, site }) =>
  h("script", {
    type: "application/json",
    [PALETTE_ATTRIBUTE]: "",
    dangerouslySetInnerHTML: { __html: paletteJson(payloadFor(page, site.config.base)) },
  });

export default commandPalette;

export { paletteActions, palettePayload };
export type { PaletteAction, PaletteInput, PalettePayload, PaletteRun, ThemeChoice } from "./actions.ts";
