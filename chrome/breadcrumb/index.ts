import { h } from "preact";
import type { Chrome, NavLink } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Chevron pointing toward the current page; `style.css` mirrors it under `dir="rtl"`. Decorative, so it stays out of the accessibility tree. */
function separator() {
  return h(
    "svg",
    { class: "breadcrumb-sep", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    h("path", { d: "m9 6 6 6-6 6" }),
  );
}

/**
 * The authored title of a crumb. `<bdi>` isolates its own base direction, so a right-to-left,
 * left-to-right, or neutral-only run cannot reorder the crumbs or separators beside it, and the text
 * and the link's URL are carried through unchanged.
 */
function title(text: string) {
  return h("bdi", { class: "breadcrumb-title" }, text);
}

/** One crumb: every ancestor is an ordinary keyboard-accessible link, the last item is the current page and is not a link. */
function crumb(link: NavLink, current: boolean) {
  return current
    ? h("span", { "aria-current": "page" }, title(link.title))
    : h("a", { href: link.url }, title(link.title));
}

/**
 * The trail from the navigation tree above the title, as one ordered list with one item per crumb so
 * assistive technology can count the crumbs and find the current page. Decorative chevrons stay out of
 * the accessibility tree and each authored title is direction-isolated. Renders nothing without at least
 * one ancestor.
 */
const breadcrumb: Chrome = ({ page, trail }) => {
  if (trail.length < 2) return null;

  const items = [];
  for (let i = 0; i < trail.length; i += 1) {
    items.push(
      h("li", { class: "breadcrumb-item" }, i > 0 ? separator() : null, crumb(trail[i]!, i === trail.length - 1)),
    );
  }

  return h(
    "nav",
    { class: "breadcrumb", "aria-label": t(page.lang, "breadcrumbs") },
    h("ol", { class: "breadcrumb-list" }, ...items),
  );
};

export default breadcrumb;
