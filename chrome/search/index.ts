import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import commandPalette from "../command-palette/index.ts";

/** Id the search field's label points to; the page carries one dialog. */
export const SEARCH_INPUT_ID = "search-input";

const LABEL = "Search";
const CLOSE_LABEL = "Close search";
const PLACEHOLDER = "Search the docs";

/**
 * The search dialog, extended into a command palette: a field, a status region, and a listbox that
 * `client.ts` fills with page results and actions. The actions are published by
 * `chrome/command-palette/` as inert JSON inside the same dialog, so there is still one dialog.
 * The dialog starts `hidden` and the header's search button stays `hidden`, so a visitor without
 * JavaScript never sees a control that would do nothing. `client.ts` removes both when it runs.
 *
 * The `data-base` attribute tells `client.ts` where the Pagefind index sits on a site published under
 * a subfolder (`base: /example`), because the island cannot tell from its own URL.
 */
const search: Chrome = (props) =>
  h(
    "dialog",
    {
      class: "search",
      "data-search": "",
      "data-base": props.site.config.base,
      "aria-label": LABEL,
      hidden: true,
    },
    h(
      "div",
      { class: "search-panel" },
      h(
        "div",
        { class: "search-form", role: "search" },
        h("label", { class: "search-label", for: SEARCH_INPUT_ID }, LABEL),
        h("input", {
          class: "search-input",
          id: SEARCH_INPUT_ID,
          type: "search",
          name: "q",
          placeholder: PLACEHOLDER,
          autocomplete: "off",
          "data-search-input": "",
        }),
        h(
          "button",
          { type: "button", class: "search-close", "aria-label": CLOSE_LABEL, "data-search-close": "" },
          h("span", { "aria-hidden": "true" }, "×"),
        ),
      ),
      h("p", { class: "search-status", role: "status", "data-search-status": "" }, ""),
      h("div", { class: "search-results", role: "listbox", "aria-label": LABEL, "data-search-results": "" }),
      commandPalette(props) as ComponentChildren,
    ),
  );

export default search;
