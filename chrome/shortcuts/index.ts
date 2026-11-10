import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Id the dialog's heading carries; `aria-labelledby` points at it. */
export const SHORTCUTS_TITLE_ID = "shortcuts-title";

/** One row of the shortcut list: the keys, the string key of what they do, and whether they need a script. */
interface Shortcut {
  /** The keys that trigger the action, shown in order. */
  readonly keys: readonly string[];
  /** The i18n key of the action's name. */
  readonly label: string;
  /** Whether the action is a client island, so it does nothing without JavaScript. */
  readonly needsScript: boolean;
}

/**
 * Every shortcut the theme defines, in the order a reader meets them. The list is static: it names
 * the keys the theme's scripts accept, including `m` for the copy-page action, and marks each action
 * that the browser can only run with JavaScript.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ["/", "Ctrl/Cmd+K"], label: "search", needsScript: true },
  { keys: ["m"], label: "copy_page_md", needsScript: true },
  { keys: ["?"], label: "shortcuts_open", needsScript: true },
];

/** One key of a shortcut, drawn as a keycap. */
function keycap(key: string) {
  return h("kbd", { class: "shortcut-key" }, key);
}

/** The keys of one shortcut, with a separator between alternatives. */
function keysOf(shortcut: Shortcut) {
  const children = shortcut.keys.flatMap((key, index) =>
    index === 0 ? [keycap(key)] : [h("span", { class: "shortcut-separator", "aria-hidden": "true" }, " / "), keycap(key)],
  );
  return h("dt", { class: "shortcut-keys" }, ...children);
}

/**
 * The keyboard shortcuts dialog: a heading and a definition list of every shortcut the theme defines.
 * It starts `hidden` and `client.ts` opens it on `?` and closes it on Escape, so a visitor without
 * JavaScript sees no control that would do nothing. `layouts/base.ts` places it on every page.
 *
 * The list is static, so it names `Ctrl/Cmd+K` rather than the platform's one hint; the search
 * button itself carries the platform-specific hint once `client.ts` runs.
 */
const shortcuts: Chrome = ({ page }) => {
  const lang = page.lang;
  return h(
    "dialog",
    { class: "shortcuts", "data-shortcuts": "", "aria-labelledby": SHORTCUTS_TITLE_ID, hidden: true },
    h(
      "div",
      { class: "shortcuts-panel" },
      h(
        "div",
        { class: "shortcuts-header" },
        h("h2", { class: "shortcuts-title", id: SHORTCUTS_TITLE_ID }, t(lang, "shortcuts_title")),
        h(
          "button",
          {
            type: "button",
            class: "shortcuts-close",
            "aria-label": t(lang, "shortcuts_close"),
            "data-shortcuts-close": "",
          },
          h("span", { "aria-hidden": "true" }, "×"),
        ),
      ),
      h(
        "dl",
        { class: "shortcuts-list" },
        ...SHORTCUTS.map((shortcut) =>
          h(
            "div",
            { class: "shortcut" },
            keysOf(shortcut),
            h(
              "dd",
              { class: "shortcut-action" },
              t(lang, shortcut.label),
              shortcut.needsScript
                ? h("span", { class: "shortcut-needs-js" }, t(lang, "shortcuts_needs_js"))
                : null,
            ),
          ),
        ),
      ),
    ),
  );
};

export default shortcuts;
