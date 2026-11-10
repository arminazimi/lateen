import { h, type ComponentChildren } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import sidebar from "../sidebar/index.ts";

const LABEL = "Menu";
const CLOSE_LABEL = "Close menu";

/**
 * The mobile navigation drawer: the sidebar inside a `<dialog>`, opened by the header's menu button below
 * 768 px. The close button and the dialog wait for `client.ts`: the dialog is closed until it opens, and
 * `hidden` controls stay hidden for a visitor without JavaScript. That visitor gets no dialog; `style.css`
 * shows the sidebar above the article on narrow screens instead.
 */
const drawer: Chrome = (props) => {
  const nav = sidebar(props);
  if (nav == null) return null;
  return h(
    "dialog",
    { class: "drawer", "data-drawer": true, "aria-label": LABEL },
    h(
      "button",
      { type: "button", class: "drawer-close", "aria-label": CLOSE_LABEL, hidden: true, "data-drawer-close": true },
      h("span", { "aria-hidden": "true" }, "×"),
    ),
    nav as ComponentChildren,
  );
};

export default drawer;
