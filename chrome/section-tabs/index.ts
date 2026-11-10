import { h } from "preact";
import type { Chrome, NavGroup, NavItem, NavLink } from "@velella/mizzen/contracts";

/** True when a navigation item carries the `tab: true` mark from the navigation data. */
function isTab(item: NavItem): boolean {
  return "tab" in item && item.tab === true;
}

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

/** The first leaf under `items`, in reading order; a section tab links there. */
function firstLeaf(items: readonly NavItem[]): NavLink | undefined {
  for (const item of items) {
    if (isGroup(item)) {
      const found = firstLeaf(item.children);
      if (found !== undefined) return found;
    } else {
      return item;
    }
  }
  return undefined;
}

/** The top-level items of the list marked `tab: true`, in order; a group keeps its title and links to its first leaf. */
function tabs(items: readonly NavItem[]): NavLink[] {
  const out: NavLink[] = [];
  for (const item of items) {
    if (!isTab(item)) continue;
    if (isGroup(item)) {
      const leaf = firstLeaf(item.children);
      if (leaf !== undefined) out.push({ title: item.title, url: leaf.url });
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * Tabs for the header's section-tabs slot: the top-level items of the `main` navigation list
 * marked `tab: true`. The breadcrumb trail starts at the active section of the navigation tree,
 * so a tab is current when the trail's root carries its title.
 */
const sectionTabs: Chrome = ({ site, trail }) => {
  const items = site.nav.main;
  if (items === undefined) return null;
  const links = tabs(items);
  if (links.length === 0) return null;
  const section = trail[0];
  return h(
    "nav",
    { class: "section-tabs", "aria-label": "Sections" },
    links.map((tab) =>
      h(
        "a",
        {
          class: "section-tab",
          href: tab.url,
          ...(section !== undefined && tab.title === section.title ? { "aria-current": "page" } : {}),
        },
        tab.title,
      ),
    ),
  );
};

export default sectionTabs;
