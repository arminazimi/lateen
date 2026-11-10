import { h } from "preact";
import type { Chrome, NavLink } from "@velella/mizzen/contracts";

const LABEL = "Breadcrumb";

/** Chevron pointing toward the current page; `style.css` mirrors it under `dir="rtl"`. */
function separator() {
  return h(
    "svg",
    { class: "breadcrumb-sep", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    h("path", { d: "m9 6 6 6-6 6" }),
  );
}

/** One crumb: every ancestor is a link, the last item is the current page and not a link. */
function crumb(link: NavLink, current: boolean) {
  return current
    ? h("span", { "aria-current": "page" }, link.title)
    : h("a", { href: link.url }, link.title);
}

/** The trail from the navigation tree above the title; renders nothing without at least one ancestor. */
const breadcrumb: Chrome = ({ trail }) => {
  if (trail.length < 2) return null;

  const items = [];
  for (let i = 0; i < trail.length; i += 1) {
    if (i > 0) items.push(separator());
    items.push(crumb(trail[i]!, i === trail.length - 1));
  }

  return h("nav", { class: "breadcrumb", "aria-label": LABEL }, ...items);
};

export default breadcrumb;
