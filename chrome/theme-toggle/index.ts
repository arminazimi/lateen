import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";

const LABEL = "Color theme";

/** The three choices, in the order a press cycles through them; `client.ts` stores them verbatim. */
const OPTIONS = [{ value: "light" }, { value: "system" }, { value: "dark" }] as const;

/** The icon drawn for each choice: a sun, a screen, and a moon. */
function icon(value: (typeof OPTIONS)[number]["value"]) {
  const paths =
    value === "light"
      ? [h("circle", { cx: "12", cy: "12", r: "4" }), h("path", { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" })]
      : value === "dark"
        ? [h("path", { d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" })]
        : [h("rect", { x: "3", y: "4", width: "18", height: "12", rx: "2" }), h("path", { d: "M8 20h8M12 16v4" })];
  return h("svg", { class: `theme-toggle-icon theme-toggle-icon-${value}`, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, ...paths);
}

/**
 * The theme switch: one icon button that shows the current choice and cycles to the next on a click,
 * Space, or Enter (a native button gives all three). Hidden until `client.ts` runs, so a visitor without
 * JavaScript never sees a control that would do nothing. The `role=status` region sits beside the button,
 * not inside it, and is where `client.ts` announces every change.
 */
const themeToggle: Chrome = () =>
  h(
    "span",
    { class: "theme-toggle", "data-theme-toggle": true, hidden: true },
    h(
      "button",
      { class: "theme-toggle-button", type: "button", "aria-label": LABEL },
      ...OPTIONS.map((option) => icon(option.value)),
    ),
    h("span", { class: "theme-toggle-status", role: "status" }, ""),
  );

export default themeToggle;
