import { h } from "preact";
import type { Chrome, NavLink } from "@velella/mizzen/contracts";

const LABEL = "Previous and next pages";

/** Arrow pointing toward the page it leads to; `style.css` mirrors it under `dir="rtl"`. */
function arrow(kind: "prev" | "next") {
  const d = kind === "prev" ? "M11 6l-6 6 6 6M5 12h14" : "M13 6l6 6-6 6M19 12H5";
  return h(
    "svg",
    { class: "pager-arrow", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    h("path", { d }),
  );
}

/** One card: the direction label with its arrow on the outer side, then the title of the linked page. */
function card(kind: "prev" | "next", link: NavLink) {
  const label = kind === "prev" ? "Previous" : "Next";
  const text = kind === "prev" ? [arrow(kind), label] : [label, arrow(kind)];
  return h(
    "a",
    { class: `pager-link pager-${kind}`, href: link.url, rel: kind },
    h("span", { class: "pager-label" }, ...text),
    h("span", { class: "pager-title" }, link.title),
  );
}

/** Previous and next pages in reading order; renders nothing when the page has neither. */
const pager: Chrome = ({ pager: { prev, next } }) => {
  if (prev === undefined && next === undefined) return null;

  return h(
    "nav",
    { class: "pager", "aria-label": LABEL },
    prev === undefined ? null : card("prev", prev),
    next === undefined ? null : card("next", next),
  );
};

export default pager;
