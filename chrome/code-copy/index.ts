import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/**
 * Renders no visible chrome: a hidden template carries the copy control's localized words for the
 * island, which adds the control to every code block. A layout draws most blocks itself and the
 * engine loads a component's island only when page Markdown uses that component, so the behaviour
 * lives in the always-loaded chrome islands. Without the island the template stays inert.
 */
const codeCopy: Chrome = ({ page }) => {
  const lang = page.lang;
  return h("template", {
    "data-code-copy": true,
    "data-copy": t(lang, "copy"),
    "data-copied": t(lang, "copied"),
    "data-failed": t(lang, "copy_failed_select"),
  });
};

export default codeCopy;
