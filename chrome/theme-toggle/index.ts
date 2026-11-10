import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";

const LABEL = "Color theme";

/** The three choices, in the order the switch shows them; `client.ts` stores them verbatim. */
const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
] as const;

/**
 * The theme switch. Hidden until `client.ts` runs, so a visitor without JavaScript never sees a
 * control that would do nothing. Native radios inside a fieldset give the group name, the three
 * choices, and arrow-key navigation without any script of their own; the `role=status` region is
 * where `client.ts` announces every change.
 */
const themeToggle: Chrome = () =>
  h(
    "fieldset",
    { class: "theme-toggle", "data-theme-toggle": true, hidden: true },
    h("legend", { class: "theme-toggle-legend" }, LABEL),
    h(
      "div",
      { class: "theme-toggle-options" },
      ...OPTIONS.map((option) =>
        h(
          "label",
          { class: "theme-toggle-option" },
          h("input", { class: "theme-toggle-input", type: "radio", name: "color-theme", value: option.value }),
          h("span", { class: "theme-toggle-option-text" }, option.label),
        ),
      ),
    ),
    h("p", { class: "theme-toggle-status", role: "status" }, ""),
  );

export default themeToggle;
