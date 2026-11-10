import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Head, LayoutProps, LinkTag, MetaTag } from "@velella/mizzen/contracts";
import announcement from "../chrome/announcement/index.ts";
import footnotePopover from "../chrome/footnote-popover/index.ts";
import shortcuts from "../chrome/shortcuts/index.ts";
import skipLinks, { MAIN_ID, NAVIGATION_ID } from "../chrome/skip-links/index.ts";

export { MAIN_ID, NAVIGATION_ID };

/** localStorage key that holds the visitor's choice: `light`, `dark`, or `system`. */
export const THEME_KEY = "slipway-theme";

/**
 * Sets `data-theme` on `<html>` before first paint. A stored `light` or `dark` wins; `system` follows
 * `prefers-color-scheme`; a first visit (nothing stored) is dark. Storage may throw (private mode), so it
 * falls back to dark.
 */
export const THEME_SCRIPT =
  `(function(){var d=document.documentElement,t="dark";try{var s=localStorage.getItem("${THEME_KEY}");` +
  `if(s==="light"||s==="dark")t=s;else if(s==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}` +
  `catch(e){}d.setAttribute("data-theme",t)})()`;

/** Content for the slots the layout places around the page. Each is optional and renders nothing when empty. */
export interface BaseSlots {
  /** Site header: logo, tabs, search, theme switch. */
  readonly header?: ComponentChildren;
  /** Sidebar navigation, beside the main column. */
  readonly sidebar?: ComponentChildren;
  /** The page itself; falls back to the page's rendered HTML. */
  readonly main?: ComponentChildren;
  /** Aside beside the main column, such as the table of contents. */
  readonly aside?: ComponentChildren;
  /** Site footer. */
  readonly footer?: ComponentChildren;
}

export type BaseProps = LayoutProps & BaseSlots;

function metaTag(tag: MetaTag) {
  return h("meta", { [tag.property ? "property" : "name"]: tag.name, content: tag.content });
}

function linkTag(tag: LinkTag) {
  return h("link", { ...tag.attrs, rel: tag.rel, href: tag.href });
}

/** JSON-LD must not close its own script element, so `<` is escaped. */
function jsonLd(data: Readonly<Record<string, unknown>>) {
  return h("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, "\\u003c") },
  });
}

/** Everything inside `<head>`, in a fixed order, with the theme script first so nothing paints before it. */
function headNodes(head: Head) {
  return [
    h("meta", { charset: "utf-8" }),
    h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    h("script", { dangerouslySetInnerHTML: { __html: THEME_SCRIPT } }),
    h("title", null, head.title),
    ...head.meta.map(metaTag),
    ...head.links.map(linkTag),
    ...head.jsonLd.map(jsonLd),
  ];
}

/**
 * The document shell every page uses: `<html lang dir>`, the head, the skip links, and header, main, and
 * footer landmarks, with slots for header, sidebar, main, aside, and footer. It places the footnote
 * popover's mount point once per page. Islands load at the end of the body. The navigation skip link is
 * left out when no sidebar slot is given, since its target is not there.
 */
export default function base(props: BaseProps) {
  const { page, head, islands, header, sidebar, main, aside, footer } = props;
  return h(
    "html",
    { lang: page.lang, dir: page.dir, "data-theme": "dark" },
    h("head", null, ...headNodes(head)),
    h(
      "body",
      null,
      skipLinks({ ...props, navigation: sidebar != null }),
      announcement(props) as ComponentChildren,
      header == null ? null : h("header", null, header),
      h(
        "div",
        { class: "layout" },
        sidebar == null
          ? null
          : h("aside", { class: "sidebar", id: NAVIGATION_ID, "aria-label": "Site navigation" }, sidebar),
        h(
          "main",
          { id: MAIN_ID, tabIndex: -1 },
          main ?? h("div", { dangerouslySetInnerHTML: { __html: page.html } }),
        ),
        aside == null ? null : h("aside", { class: "aside", "aria-label": "On this page" }, aside),
      ),
      footnotePopover(props) as ComponentChildren,
      footer == null ? null : h("footer", null, footer),
      shortcuts(props) as ComponentChildren,
      ...islands.map((island) => h("script", { type: "module", src: island.src })),
    ),
  );
}
