import { h } from "preact";
import type { Chrome, Page, Site } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Class on the navigation landmark. */
export const NAV_CLASS = "version-switcher";

/** Class on the native disclosure that holds the list. */
export const DETAILS_CLASS = "version-switcher-details";

/** Class on the disclosure control. */
export const SUMMARY_CLASS = "version-switcher-summary";

/** Class on the visible label inside the summary. */
export const LABEL_CLASS = "version-switcher-label";

/** Class on the current version's name inside the summary. */
export const VALUE_CLASS = "version-switcher-value";

/** Class on the decorative disclosure marker. */
export const MARKER_CLASS = "version-switcher-marker";

/** Class on the list of versions. */
export const LIST_CLASS = "version-switcher-list";

/** Class on one list item. */
export const ITEM_CLASS = "version-switcher-item";

/** Class on one version's link. */
export const LINK_CLASS = "version-switcher-link";

/** Class on a version's name inside its link. */
export const VERSION_CLASS = "version-switcher-version";

/** Class on the "current version" badge next to the current version's name. */
export const CURRENT_CLASS = "version-switcher-current";

/** The i18n key with the label of the control and the name of its list. */
export const LABEL_KEY = "versions";

/** The i18n key with the text that marks the current version. */
export const CURRENT_KEY = "version_current";

/** One version a page can switch to. */
export interface VersionLink {
  /** The version's name, shown as written in the data. */
  readonly version: string;
  /** The URL to visit for this page in that version, or the version's home when the page is missing there. */
  readonly url: string;
  /** Whether this entry is the page being rendered. */
  readonly current: boolean;
}

/** One entry after parsing: a version, the page's URL in it, and an optional version home. */
interface Entry {
  /** The version's name. */
  readonly version: string;
  /** The page's URL in that version, as the data wrote it. */
  readonly url: string;
  /** The version's home URL, when the data gives one instead of leaving it to be derived. */
  readonly home?: string;
}

/** One page's versions as the data wrote them. */
interface DataPage {
  /** The page's path or URL, as the data keyed it. */
  readonly key: string;
  /** The page's versions, in the data's order. */
  readonly entries: readonly Entry[];
}

/** `site.data.versions`, normalized: its pages and the URL-to-page lookup the N17 output writes. */
interface VersionsData {
  /** Every page the file lists. */
  readonly pages: readonly DataPage[];
  /** URL (with `base`) to page path, from the file's `byUrl` member. */
  readonly byUrl: ReadonlyMap<string, string>;
}

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty trimmed string, or undefined. */
function textOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
}

/** The site's `base` without a trailing slash, so paths join with one `/`. The root is the empty string. */
function baseOf(site: Site): string {
  const base = site.config.base;
  if (base === "" || base === "/") return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * A URL from the data with `base` in front of a site path. A URL that already carries `base`, an external URL, and
 * anything that is not a site path are returned as written; {@link isSafeUrl} decides what may be linked.
 */
function withBase(base: string, url: string): string {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (base === "" || url === base || url.startsWith(`${base}/`)) return url;
  return `${base}${url}`;
}

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/** True when the normalized URL is safe to put in an `href`. */
function isSafeUrl(url: string): boolean {
  return SAFE_URL.test(url);
}

/** Parses one `{ version, url, status? }` entry; anything missing a name or a URL is skipped. */
function entryOf(value: unknown): Entry | undefined {
  if (!isRecord(value)) return undefined;
  const version = textOf(value.version);
  const url = textOf(value.url);
  if (version === undefined || url === undefined) return undefined;
  const home = textOf(value.home);
  return { version, url, ...(home === undefined ? {} : { home }) };
}

/**
 * The entries in a versions value. An array is a list of `{ version, url }` objects. An object maps a version to a
 * URL or to an entry, which covers the terse `{ v1: "/v1/guide/", v2: "/v2/guide/" }` form. Unknown members are
 * ignored.
 */
function entriesOf(value: unknown): Entry[] {
  if (Array.isArray(value)) {
    const out: Entry[] = [];
    for (const item of value) {
      const entry = entryOf(item);
      if (entry !== undefined) out.push(entry);
    }
    return out;
  }
  if (!isRecord(value)) return [];

  const out: Entry[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      const url = textOf(item);
      if (url !== undefined) out.push({ version: key, url });
      continue;
    }
    if (!isRecord(item)) continue;
    const url = textOf(item.url);
    if (url === undefined) continue;
    const home = textOf(item.home);
    out.push({ version: textOf(item.version) ?? key, url, ...(home === undefined ? {} : { home }) });
  }
  return out;
}

/**
 * `site.data.versions`, read as either the N17 `versions.json` shape
 *
 * ```json
 * { "pages": [{ "path": "guide/install.md", "versions": [{ "version": "v1", "url": "/v1/guide/install/" }] }] }
 * ```
 *
 * with an optional `byUrl` lookup, or as a simple page-to-versions map
 *
 * ```json
 * { "/guide/install/": [{ "version": "v1", "url": "/v1/guide/install/" }] }
 * ```
 *
 * where a key is a page URL (with or without `base`) or a page path. An array is one page's list. Returns undefined
 * when there is nothing usable.
 */
function dataOf(value: unknown): VersionsData | undefined {
  if (Array.isArray(value)) {
    const entries = entriesOf(value);
    return entries.length === 0 ? undefined : { pages: [{ key: "", entries }], byUrl: new Map() };
  }
  if (!isRecord(value)) return undefined;

  const byUrl = new Map<string, string>();
  if (isRecord(value.byUrl)) {
    for (const [url, path] of Object.entries(value.byUrl)) {
      if (typeof path === "string") byUrl.set(url, path);
    }
  }

  if (Array.isArray(value.pages)) {
    const pages: DataPage[] = [];
    for (const item of value.pages) {
      if (!isRecord(item)) continue;
      const key = textOf(item.path) ?? textOf(item.url);
      if (key === undefined) continue;
      const entries = entriesOf(item.versions);
      if (entries.length > 0) pages.push({ key, entries });
    }
    return pages.length === 0 ? undefined : { pages, byUrl };
  }

  const pages: DataPage[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (key === "pages" || key === "byUrl") continue;
    const entries = entriesOf(item);
    if (entries.length > 0) pages.push({ key, entries });
  }
  return pages.length === 0 ? undefined : { pages, byUrl };
}

/** The data page that holds `pageUrl`, through `byUrl`, an entry's URL, or a URL-shaped key. */
function pageOf(data: VersionsData, base: string, pageUrl: string): DataPage | undefined {
  const path = data.byUrl.get(pageUrl);
  if (path !== undefined) {
    const found = data.pages.find((page) => page.key === path);
    if (found !== undefined) return found;
  }
  return data.pages.find(
    (page) =>
      page.entries.some((entry) => withBase(base, entry.url) === pageUrl) ||
      withBase(base, page.key) === pageUrl,
  );
}

/**
 * The version's home from an entry's URL: the folder that holds the version. The segment equal to the version name
 * wins, so `/docs/v1/guide/` gives `/docs/v1/`; otherwise the first segment after `base` does. Data can set `home`
 * on an entry to override it.
 */
function homeOf(base: string, version: string, url: string, declared: string | undefined): string {
  if (declared !== undefined) return withBase(base, declared);
  if (!url.startsWith("/")) return url;
  const rest = base !== "" && url.startsWith(`${base}/`) ? url.slice(base.length) : url;
  const parts = rest.split("/").filter((part) => part !== "");
  const at = parts.indexOf(version);
  const segments = at >= 0 ? parts.slice(0, at + 1) : parts.slice(0, 1);
  return segments.length === 0 ? `${base}/` : `${base}/${segments.join("/")}/`;
}

/** Every version the data knows, in first-seen order, with its home. */
function homesOf(data: VersionsData, base: string): ReadonlyMap<string, string> {
  const homes = new Map<string, string>();
  for (const page of data.pages) {
    for (const entry of page.entries) {
      if (!homes.has(entry.version)) homes.set(entry.version, homeOf(base, entry.version, entry.url, entry.home));
    }
  }
  return homes;
}

/** The versions a page can switch between, from `site.data.versions` first and its front matter second. */
export function versionsOf(site: Site, page: Page): readonly VersionLink[] | undefined {
  const base = baseOf(site);
  const data = dataOf(site.data.versions);

  if (data !== undefined) {
    const current = pageOf(data, base, page.url);
    if (current === undefined) return undefined;

    const homes = homesOf(data, base);
    const links: VersionLink[] = [];
    for (const [version, home] of homes) {
      const entry = current.entries.find((candidate) => candidate.version === version);
      const url = entry === undefined ? home : withBase(base, entry.url);
      if (!isSafeUrl(url)) continue;
      links.push({ version, url, current: entry !== undefined && url === page.url });
    }
    return links.length === 0 ? undefined : links;
  }

  const entries = entriesOf(page.frontMatter.versions);
  if (entries.length === 0) return undefined;

  const links: VersionLink[] = [];
  for (const entry of entries) {
    const url = withBase(base, entry.url);
    if (!isSafeUrl(url)) continue;
    links.push({ version: entry.version, url, current: url === page.url });
  }
  return links.length === 0 ? undefined : links;
}

/**
 * The version switcher: a native `<details>` whose list links the same page in every version the site keeps, with the
 * current one marked. A page that is missing from another version links that version's home instead. It reads
 * `_data/versions.*` (the N17 `versions.json` shape or a page-to-versions map) and falls back to the page's `versions`
 * front matter. Fewer than two versions, or a page the data does not list, renders nothing. `<details>`/`<summary>`
 * are keyboard operable with no script; the header places it, and it hides behind the summary until opened.
 */
const versionSwitcher: Chrome = ({ site, page }) => {
  const versions = versionsOf(site, page);
  if (versions === undefined || versions.length < 2) return null;

  const current = versions.find((version) => version.current);

  return h(
    "nav",
    { class: NAV_CLASS, "aria-label": t(page.lang, LABEL_KEY) },
    h(
      "details",
      { class: DETAILS_CLASS },
      h(
        "summary",
        { class: SUMMARY_CLASS },
        h("span", { class: LABEL_CLASS }, t(page.lang, LABEL_KEY)),
        current === undefined ? null : h("span", { class: VALUE_CLASS, dir: "ltr" }, current.version),
        h("span", { class: MARKER_CLASS, "aria-hidden": "true" }, "▾"),
      ),
      h(
        "ul",
        { class: LIST_CLASS },
        ...versions.map((version) =>
          h(
            "li",
            { class: ITEM_CLASS },
            h(
              "a",
              { class: LINK_CLASS, href: version.url, ...(version.current ? { "aria-current": "true" } : {}) },
              h("span", { class: VERSION_CLASS, dir: "ltr" }, version.version),
              version.current ? h("span", { class: CURRENT_CLASS }, t(page.lang, CURRENT_KEY)) : null,
            ),
          ),
        ),
      ),
    ),
  );
};

export default versionSwitcher;
