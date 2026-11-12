import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps, NavItem, NavLink, SiteConfig } from "@velella/mizzen/contracts";
import { hrefFor, resolvedLanguages } from "../chrome/language-switcher/index.ts";
import { t } from "../i18n/index.ts";
import base from "./base.ts";

/** Id of the search field, which its label points to. */
export const SEARCH_ID = "not-found-search";

function isLink(item: NavItem): item is NavLink {
  return "url" in item;
}

/** A language tag in the matching form: trimmed, lower case, `_` read as `-`. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * The home URL for a page language: the configured language whose code equals `lang`, else the one
 * whose primary subtag equals it (`fa-IR` reads `fa`), built with that language's configured prefix
 * under the site base exactly once. A language nothing configures gets no guessed prefix: its home
 * is the site home.
 */
export function homeHref(config: SiteConfig, lang: string): string {
  const languages = resolvedLanguages(config);
  const wanted = tagKey(lang);
  const wantedPrimary = wanted.split("-")[0] ?? "";
  const match =
    languages.find((language) => tagKey(language.code) === wanted) ??
    languages.find((language) => (tagKey(language.code).split("-")[0] ?? "") === wantedPrimary);
  return match === undefined ? `${config.base}/` : hrefFor(config, match, "/");
}

/** Search box that submits the query to the site's search page, as a plain GET form. Root-relative and base-aware, so it works from any path. */
function searchForm(config: SiteConfig, lang: string) {
  return h(
    "form",
    { class: "not-found-search", role: "search", action: `${config.base}/search/`, method: "get" },
    h("label", { for: SEARCH_ID }, t(lang, "search_placeholder")),
    h("input", { id: SEARCH_ID, type: "search", name: "q", autocomplete: "off" }),
    h("button", { type: "submit" }, t(lang, "search")),
  );
}

/** Links to the home page and each top-level section of the `main` navigation list. */
function sectionNav(props: LayoutProps) {
  const lang = props.page.lang;
  const home = homeHref(props.site.config, lang);
  const items: ComponentChildren[] = [h("li", null, h("a", { href: home }, t(lang, "home")))];
  for (const item of props.site.nav.main ?? []) {
    if (isLink(item) && item.url !== home) items.push(h("li", null, h("a", { href: item.url }, item.title)));
  }
  return h("nav", { class: "not-found-sections", "aria-label": t(lang, "not_found_sections") }, h("ul", null, items));
}

/** The 404 content, in the page's own language: a code, a message, a search box, and links to the home page and the top sections. */
function content(props: LayoutProps) {
  const lang = props.page.lang;
  return h(
    "div",
    { class: "not-found" },
    h("p", { class: "not-found-code", "aria-hidden": "true" }, "404"),
    h("h1", null, t(lang, "not_found_title")),
    h("p", null, t(lang, "not_found_text")),
    searchForm(props.site.config, lang),
    sectionNav(props),
  );
}

/**
 * The 404 page: the base document shell around recovery content written in the page's own language
 * (the shell carries that language's `lang` and `dir`). The home link resolves the configured
 * current language's prefix under the site base; the search form stays a plain GET form and the
 * section links keep their authored titles and URLs, so the page recovers readers without JavaScript.
 */
const notFound: Layout = (props) => base({ ...props, main: content(props) });

export default notFound;
