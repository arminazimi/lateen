import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { patternOf, t } from "../../i18n/index.ts";
import commandPalette from "../command-palette/index.ts";

/** Id the search field's label points to, and the one the listbox is named by; the page has one dialog. */
export const SEARCH_INPUT_ID = "search-input";

/** Id of the result list, which the field controls through `aria-controls`. */
export const SEARCH_RESULTS_ID = "search-results-list";

/**
 * The search dialog, extended into a command palette: a combobox field, a status region, and the
 * listbox it controls, which `client.ts` fills with options — the page results and the page's actions,
 * as rows of one model (`chrome/search/options.ts`). The actions are published by
 * `chrome/command-palette/` as inert JSON inside the same dialog, so there is still one dialog.
 * The dialog starts `hidden` and the header's search button stays `hidden`, so a visitor without
 * JavaScript never sees a control that would do nothing. `client.ts` removes both when it runs, and
 * keeps `aria-expanded` on the field in step with the dialog.
 *
 * The static markup carries only what is true before a script has drawn a row: the field's relationship
 * to the list, not an active option. `client.ts` adds and removes `aria-activedescendant` itself, so a
 * row the reader has not been given cannot be named, and a row that is gone stops being named.
 *
 * The `data-base` attribute tells `client.ts` where the Pagefind index sits on a site published under
 * a subfolder (`base: /example`), because the island cannot tell from its own URL.
 *
 * Every message the island shows travels as a `data-search-*` attribute in the page language: the
 * island has no access to the catalogs at run time, and the text is already escaped by the renderer.
 * Count and empty messages keep their `{n}` and `{query}` placeholders for the island to fill.
 */
const search: Chrome = (props) =>
  h(
    "dialog",
    {
      class: "search",
      "data-search": "",
      "data-base": props.site.config.base,
      "data-search-lang": props.page.lang,
      "data-search-loading": t(props.page.lang, "search_loading"),
      "data-search-searching": t(props.page.lang, "search_results_loading"),
      "data-search-failed": t(props.page.lang, "search_results_failed"),
      "data-search-empty": patternOf(props.page.lang, "search_results_empty"),
      "data-search-count-zero": patternOf(props.page.lang, "search_count_zero"),
      "data-search-count-one": patternOf(props.page.lang, "search_count_one"),
      "data-search-count-two": patternOf(props.page.lang, "search_count_two"),
      "data-search-count-few": patternOf(props.page.lang, "search_count_few"),
      "data-search-count-many": patternOf(props.page.lang, "search_count_many"),
      "data-search-count-other": patternOf(props.page.lang, "search_count_other"),
      "data-search-other-section": t(props.page.lang, "search_other_section"),
      "data-search-copied": t(props.page.lang, "copied"),
      "data-search-copy-failed": t(props.page.lang, "search_copy_failed"),
      "data-search-actions": t(props.page.lang, "command_actions"),
      "aria-label": t(props.page.lang, "search"),
      hidden: true,
    },
    h(
      "div",
      { class: "search-panel" },
      h(
        "div",
        { class: "search-form", role: "search" },
        h("label", { class: "search-label", for: SEARCH_INPUT_ID }, t(props.page.lang, "search")),
        h("input", {
          class: "search-input",
          id: SEARCH_INPUT_ID,
          type: "search",
          name: "q",
          placeholder: t(props.page.lang, "search_placeholder"),
          autocomplete: "off",
          // The field is the combobox the list belongs to, closed until `client.ts` opens the dialog.
          role: "combobox",
          "aria-haspopup": "listbox",
          "aria-expanded": "false",
          "aria-controls": SEARCH_RESULTS_ID,
          "aria-autocomplete": "list",
          "data-search-input": "",
        }),
        h(
          "button",
          {
            type: "button",
            class: "search-close",
            "aria-label": t(props.page.lang, "search_close"),
            "data-search-close": "",
          },
          h("span", { "aria-hidden": "true" }, "×"),
        ),
      ),
      h("p", { class: "search-status", role: "status", "data-search-status": "" }, ""),
      h(
        "div",
        {
          class: "search-results",
          id: SEARCH_RESULTS_ID,
          role: "listbox",
          "aria-label": t(props.page.lang, "search"),
          "data-search-results": "",
        },
      ),
      commandPalette(props) as ComponentChildren,
    ),
  );

export default search;
