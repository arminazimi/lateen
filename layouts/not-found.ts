import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps, NavItem, NavLink } from "@velella/mizzen/contracts";
import base from "./base.ts";

/** Id of the search field, which its label points to. */
export const SEARCH_ID = "not-found-search";

function isLink(item: NavItem): item is NavLink {
  return "url" in item;
}

/** Search box that submits the query to the site's search page, as a plain GET form. Root-relative, so it works from any path. */
function searchForm(root: string) {
  return h(
    "form",
    { class: "not-found-search", role: "search", action: `${root}/search/`, method: "get" },
    h("label", { for: SEARCH_ID }, "Search the docs"),
    h("input", { id: SEARCH_ID, type: "search", name: "q", autocomplete: "off" }),
    h("button", { type: "submit" }, "Search"),
  );
}

/** Links to the home page and each top-level section of the `main` navigation list. */
function sectionNav(props: LayoutProps) {
  const home = `${props.site.config.base}/`;
  const items: ComponentChildren[] = [h("li", null, h("a", { href: home }, "Home"))];
  for (const item of props.site.nav.main ?? []) {
    if (isLink(item) && item.url !== home) items.push(h("li", null, h("a", { href: item.url }, item.title)));
  }
  return h("nav", { class: "not-found-sections", "aria-label": "Sections" }, h("ul", null, items));
}

/** The 404 content: a code, a message, a search box, and links to the home page and the top sections. */
function content(props: LayoutProps) {
  return h(
    "div",
    { class: "not-found" },
    h("p", { class: "not-found-code", "aria-hidden": "true" }, "404"),
    h("h1", null, "Page not found"),
    h("p", null, "The page you asked for does not exist or has moved."),
    searchForm(props.site.config.base),
    sectionNav(props),
  );
}

/** The 404 page: the base document shell around a search box and links to the home page and top sections. */
const notFound: Layout = (props) => base({ ...props, main: content(props) });

export default notFound;
