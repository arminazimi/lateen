import { h, type ComponentChildren } from "preact";
import type { Chrome, NavGroup, NavItem, NavLink, NavTree } from "@velella/mizzen/contracts";

const LABEL = "Site navigation";

/** A group with more pages under it than this renders as one link, not every child. */
const MAX_LISTED = 20;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

/** Compares by code point, never by locale (ADR 0022, rule 5). */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The list the sidebar shows: `main`, else `docs`, else the first list by code point. */
function listOf(nav: NavTree): readonly NavItem[] {
  for (const name of ["main", "docs"]) {
    const items = nav[name];
    if (items !== undefined) return items;
  }
  const names = Object.keys(nav).sort(byCodePoint);
  return names.length > 0 ? (nav[names[0]!] ?? []) : [];
}

/** True when `url` is under `prefix`, observing path-segment boundaries (the same rule as the engine's `navState`). */
function under(url: string, prefix: string): boolean {
  if (!url.startsWith(prefix)) return false;
  if (prefix.endsWith("/")) return true;
  const boundary = url.charAt(prefix.length);
  return boundary === "" || boundary === "/";
}

/** Every link in a subtree, in reading order. */
function leaves(items: readonly NavItem[]): NavLink[] {
  const out: NavLink[] = [];
  for (const item of items) {
    if (isGroup(item)) out.push(...leaves(item.children));
    else out.push(item);
  }
  return out;
}

/** True when the subtree marks itself on `url`: it holds the page, or a section whose `match` covers it. */
function marks(item: NavItem, url: string): boolean {
  if (isGroup(item)) return item.children.some((child) => marks(child, url));
  if (item.url === url) return true;
  return item.match !== undefined && under(url, item.match);
}

/** Longest shared prefix of site-local urls, cut back to a `/`: the `match` of a collapsed section. */
function sectionPrefix(urls: readonly string[]): string | undefined {
  if (urls.length === 0 || !urls.every((url) => url.startsWith("/"))) return undefined;
  let prefix = urls[0]!;
  for (const url of urls) {
    while (!url.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const cut = prefix.lastIndexOf("/");
  return cut > 0 ? prefix.slice(0, cut + 1) : undefined;
}

/** `aria-current` of a link: `page` when it is the page, `true` when its section covers the page. */
function currentOf(link: NavLink, url: string): "page" | "true" | undefined {
  if (link.url === url) return "page";
  if (link.match !== undefined && under(url, link.match)) return "true";
  return undefined;
}

function linkNode(link: NavLink, url: string) {
  const current = currentOf(link, url);
  return h(
    "a",
    { href: link.url, ...(current === undefined ? {} : { "aria-current": current }) },
    link.title,
  );
}

/** A large section: one link to its first page, active on any page under the shared prefix. */
function collapsedNode(group: NavGroup, pages: readonly NavLink[], url: string) {
  const first = pages[0]!;
  const prefix = sectionPrefix(pages.map((page) => page.url));
  const current =
    url === first.url ? "page" : prefix !== undefined && under(url, prefix) ? "true" : undefined;
  return h(
    "a",
    { href: first.url, ...(current === undefined ? {} : { "aria-current": current }) },
    group.title,
  );
}

/**
 * A group as a native `<details>`, so it opens and closes without JavaScript. The group that holds the
 * page is open; the others start closed. `data-sidebar-group` is the key the client remembers the state under.
 */
function groupNode(group: NavGroup, key: string, url: string, depth: number) {
  const current = marks(group, url);
  return h(
    "details",
    {
      class: "sidebar-group",
      "data-sidebar-group": key,
      ...(current ? { "data-current": "true", open: true } : {}),
    },
    h(
      "summary",
      null,
      h(`h${Math.min(depth, 6)}`, current ? { "aria-current": "true" } : {}, group.title),
    ),
    h("ul", null, entries(group.children, url, depth + 1, key)),
  );
}

/** The `<li>` entries of one list: links, and small groups nested as a disclosure with their own list. */
function entries(
  items: readonly NavItem[],
  url: string,
  depth: number,
  parent: string | undefined,
): ComponentChildren[] {
  const nodes = [];
  for (const item of items) {
    if (!isGroup(item)) {
      nodes.push(h("li", null, linkNode(item, url)));
      continue;
    }
    const pages = leaves(item.children);
    if (pages.length === 0) continue;
    if (pages.length > MAX_LISTED) {
      nodes.push(h("li", null, collapsedNode(item, pages, url)));
      continue;
    }
    const key = parent === undefined ? item.title : `${parent}/${item.title}`;
    nodes.push(h("li", null, groupNode(item, key, url, depth)));
  }
  return nodes;
}

/** The blocks of the top level: the leading links first, then each group as a disclosure with its list. */
function blocks(items: readonly NavItem[], url: string): ComponentChildren[] {
  const out = [];
  let leading = [];
  for (const item of items) {
    if (!isGroup(item)) {
      leading.push(h("li", null, linkNode(item, url)));
      continue;
    }
    const pages = leaves(item.children);
    if (pages.length === 0) continue;
    if (leading.length > 0) {
      out.push(h("ul", null, leading));
      leading = [];
    }
    if (pages.length > MAX_LISTED) {
      out.push(h("ul", null, h("li", null, collapsedNode(item, pages, url))));
      continue;
    }
    out.push(groupNode(item, item.title, url, 2));
  }
  if (leading.length > 0) out.push(h("ul", null, leading));
  return out;
}

/** The left column: groups and links from the navigation tree, the current page and active section marked. */
const sidebar: Chrome = ({ site, page }) => {
  const items = listOf(site.nav);
  if (items.length === 0) return null;

  return h("nav", { class: "sidebar-nav", "aria-label": LABEL }, blocks(items, page.url));
};

export default sidebar;
