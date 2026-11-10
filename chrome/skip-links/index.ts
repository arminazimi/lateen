import { h } from "preact";
import type { ChromeProps, NavTree } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Id of the `<main>` landmark, the first skip link's target. */
export const MAIN_ID = "main";

/** Id of the navigation `<aside>`, the second skip link's target. */
export const NAVIGATION_ID = "site-navigation";

/**
 * Props for the skip links. `navigation` says whether this layout renders the `#site-navigation`
 * landmark, so a page without a sidebar never links to a target that is not there.
 */
export interface SkipLinksProps extends ChromeProps {
  /** Whether the layout places the navigation landmark. Defaults to true. */
  readonly navigation?: boolean;
}

/** True when at least one list in the navigation tree has an item. */
function hasItems(nav: NavTree): boolean {
  return Object.values(nav).some((items) => (items?.length ?? 0) > 0);
}

/**
 * The skip links at the start of the body: the first goes to the main content, the second to the
 * sidebar. They stay in the tab order and the stylesheet keeps them out of sight until one has
 * keyboard focus. The navigation link appears only when the site has navigation and this layout
 * renders its landmark.
 */
export default function skipLinks({ site, page, navigation = true }: SkipLinksProps) {
  const lang = page.lang;
  const links = [h("a", { class: "skip-link", href: `#${MAIN_ID}` }, t(lang, "skip_to_content"))];
  if (navigation && hasItems(site.nav)) {
    links.push(h("a", { class: "skip-link", href: `#${NAVIGATION_ID}` }, t(lang, "skip_to_navigation")));
  }
  return links;
}
