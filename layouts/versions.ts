import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps, Page, Site } from "@velella/mizzen/contracts";
import { t } from "../i18n/index.ts";
import base from "./base.ts";

/**
 * The versions index: every version of a page in one list, each row a link to the same page in
 * that version when the data has one and to the version's home otherwise.
 *
 * ## Where the versions come from
 *
 * `site.data.versions` wins; front matter `versions` is the fallback. The data file
 * (`_data/versions.yml` or `_data/versions.json`) has three accepted shapes:
 *
 * 1. A version list, used as written:
 *
 *    ```yaml
 *    - version: v2
 *      url: /v2/guide/install/
 *      status: latest
 *    ```
 *
 * 2. A page → versions map, at the top level or under `pages`. The key is the page's URL without
 *    `base` or its source path, with or without the `.md` extension, and `index` at the end either
 *    way: `/guide/install/`, `guide/install`, and `guide/install.md` name the same page.
 *
 *    ```yaml
 *    pages:
 *      "/guide/install/":
 *        - version: v2
 *          url: /v2/guide/install/
 *          status: latest
 *    ```
 *
 * 3. A `pages` list, where each entry names its page (or omits `page` to be the default list) and
 *    holds that page's versions under `versions`:
 *
 *    ```yaml
 *    pages:
 *      - page: "/guide/install/"
 *        versions:
 *          - version: v2
 *            url: /v2/guide/install/
 *            status: latest
 *    ```
 *
 * The front matter fallback is a version list, so a single page (such as `/versions/`) can list
 * versions without a data file:
 *
 * ```yaml
 * versions:
 *   - version: v2
 *     url: /v2/
 *     status: latest
 * ```
 *
 * The two engines' versioned-docs recipe, N15's folder discovery, and N17's `versions.json` all
 * describe the same records: `version` is a folder name such as `v2`, `url` is where the same page
 * lives in that version, and `status` is `latest`, `deprecated` (or `old`), or `dev`. A row without
 * a safe `url` links to the version home, `/<version>/` under the site's `base`. A row whose URL is
 * the page being rendered is the current version. Empty or malformed records are dropped, never
 * rendered as a broken link, and no data at all gives the empty state.
 */

/** The statuses a version row can carry. `old` is read as `deprecated`. */
export const STATUSES = ["latest", "deprecated", "dev"] as const;

export type VersionStatus = (typeof STATUSES)[number];

/** One version row, from `site.data.versions` or the `versions` front matter key. */
export interface VersionEntry {
  /** The version folder name, such as `v2`; blank or non-string rows are dropped. */
  readonly version: string;
  /** The same page in this version, without the site `base`; omitted links to the version's home. */
  readonly url?: string;
  /** `latest`, `deprecated` (or `old`), or `dev`; other values show no status. */
  readonly status?: VersionStatus;
}

/** The i18n key of each status label. */
export const LABEL_KEYS: Readonly<Record<VersionStatus, string>> = {
  latest: "version_latest",
  deprecated: "version_deprecated",
  dev: "version_dev",
};

/** The icon before each status label; the label is the meaning, the icon a second cue. */
export const ICONS: Readonly<Record<VersionStatus, string>> = {
  latest: "↑",
  deprecated: "!",
  dev: "~",
};

/** A page entry in the `pages` shape of the data file. */
interface PageVersions {
  /** The page key; omitted makes the entry the default when the current page has no entry. */
  readonly page?: string;
  readonly versions: readonly VersionEntry[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty trimmed string, or undefined. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Compares by code point, never by locale (ADR 0022, rule 5). */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The status of a row: one of {@link STATUSES}, without case or surrounding spaces; `old` is `deprecated`. */
export function statusOf(value: unknown): VersionStatus | undefined {
  if (typeof value !== "string") return undefined;
  const status = value.trim().toLowerCase();
  if (status === "old") return "deprecated";
  return (STATUSES as readonly string[]).includes(status) ? (status as VersionStatus) : undefined;
}

/** One version record, or undefined when it has no usable `version`. */
export function entryOf(value: unknown): VersionEntry | undefined {
  if (!isRecord(value)) return undefined;
  const version = text(value.version);
  if (version === undefined) return undefined;
  const url = text(value.url);
  const status = statusOf(value.status);
  return {
    version,
    ...(url === undefined ? {} : { url }),
    ...(status === undefined ? {} : { status }),
  };
}

/** The version records of an array, or of a `{ versions: [...] }` record; anything else is empty. */
function entriesOf(value: unknown): readonly VersionEntry[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.versions) ? value.versions : undefined;
  if (list === undefined) return [];
  return list.map(entryOf).filter((entry): entry is VersionEntry => entry !== undefined);
}

/** A page entry in the `pages` shape, or undefined when it has no page key and no versions. */
function pageEntryOf(value: unknown): PageVersions | undefined {
  if (!isRecord(value)) return undefined;
  const versions = entriesOf(value.versions);
  if (versions.length === 0) return undefined;
  const page = text(value.page) ?? text(value.url) ?? text(value.path);
  return { ...(page === undefined ? {} : { page }), versions };
}

/** The path with the site `base` and a final `index` removed, the `.md` extension dropped. */
function keyOf(path: string, base: string): string {
  const parts = path
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((part) => part !== "" && part !== ".");
  const baseParts = base
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".");
  const start = baseParts.every((part, index) => parts[index] === part) ? baseParts.length : 0;
  const kept = parts.slice(start);
  const last = kept.length - 1;
  if (last >= 0) {
    const name = (kept[last] ?? "").replace(/\.(?:md|mdx|markdown)$/i, "");
    if (name === "index") kept.pop();
    else kept[last] = name;
  }
  return kept.join("/");
}

/** The keys a data entry may use for this page: its URL without `base`, and its source path. */
function pageKeys(page: Page, base: string): ReadonlySet<string> {
  return new Set([keyOf(page.url, base), keyOf(page.source.file, base)]);
}

/** The version list of the first entry that names the page, else the first entry with no page key. */
function listForPage(
  entries: readonly PageVersions[],
  page: Page,
  base: string,
): readonly VersionEntry[] {
  const keys = pageKeys(page, base);
  let fallback: readonly VersionEntry[] = [];
  for (const entry of entries) {
    if (entry.page === undefined) {
      if (fallback.length === 0) fallback = entry.versions;
      continue;
    }
    if (keys.has(keyOf(entry.page, base))) return entry.versions;
  }
  return fallback;
}

/** The data file as page entries: a `pages` list, a `pages` map, or every other key as a page → versions map. */
function dataEntries(value: Readonly<Record<string, unknown>>): readonly PageVersions[] {
  const pages = value.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    const versionList = pages.every((entry) => isRecord(entry) && text(entry.version) !== undefined);
    if (versionList) return [{ versions: entriesOf(pages) }];
    return pages.map(pageEntryOf).filter((entry): entry is PageVersions => entry !== undefined);
  }
  if (isRecord(pages)) {
    const entries = mapEntries(pages);
    if (entries.length > 0) return entries;
  }
  return mapEntries(value);
}

/** A page → versions map: each key names a page, each value its version list. */
function mapEntries(value: Readonly<Record<string, unknown>>): readonly PageVersions[] {
  const entries: PageVersions[] = [];
  for (const key of Object.keys(value).sort(byCodePoint)) {
    if (key === "pages") continue;
    const versions = entriesOf(value[key]);
    if (versions.length > 0) entries.push({ page: key, versions });
  }
  return entries;
}

/** The versions a page shows, from `site.data.versions` when it has any, else from front matter. */
export function versionsOf(site: Site, page: Page): readonly VersionEntry[] {
  const value = site.data.versions;
  if (Array.isArray(value)) {
    const versions = entriesOf(value);
    if (versions.length > 0) return versions;
  } else if (isRecord(value)) {
    const versions = listForPage(dataEntries(value), page, site.config.base);
    if (versions.length > 0) return versions;
  }
  return entriesOf(page.frontMatter.versions);
}

/** Only a root-relative path (not `//host`) or an https link is followed. */
const SAFE_URL = /^(?:https:\/\/|\/(?![/\\]))[^\s"'<>]*$/i;

/** A version's home: `/<version>/` below the site `base`, for a row with no same-page URL. */
export function versionHome(base: string, version: string): string {
  const name = version.replace(/^\/+|\/+$/g, "");
  return name === "" ? `${base}/` : `${base}/${name}/`;
}

/** The link of a row: its safe same-page URL with `base`, else the version's home. */
export function hrefOf(base: string, entry: VersionEntry): string {
  const url = entry.url;
  if (url !== undefined && SAFE_URL.test(url)) {
    return url.startsWith("/") ? `${base}${url}` : url;
  }
  return versionHome(base, entry.version);
}

/** A URL without a trailing slash, so `/v2/` and `/v2` are the same page. */
function bare(url: string): string {
  return url.length > 1 && url.endsWith("/") ? url.slice(0, -1) : url;
}

/** True when the row points at the page being rendered. */
function isCurrent(page: Page, href: string): boolean {
  return bare(href) === bare(page.url);
}

/** The row classes: the base, the status when it has one, and the current mark. */
function rowClass(entry: VersionEntry, current: boolean): string {
  return [
    "versions-item",
    ...(entry.status === undefined ? [] : [`versions-item-${entry.status}`]),
    ...(current ? ["versions-item-current"] : []),
  ].join(" ");
}

/** One version row: its name, status in text and icon, and the current mark on the page's own URL. */
function row(entry: VersionEntry, page: Page, base: string): ComponentChildren {
  const href = hrefOf(base, entry);
  const current = isCurrent(page, href);
  const status = entry.status;

  return h(
    "li",
    { class: rowClass(entry, current), "data-version": entry.version },
    h(
      "a",
      {
        class: "versions-link",
        href,
        ...(current ? { "aria-current": "page" } : {}),
      },
      h("span", { class: "versions-name" }, entry.version),
      status === undefined
        ? null
        : h(
            "span",
            { class: `versions-status versions-status-${status}` },
            h("span", { class: "versions-icon", "aria-hidden": "true" }, ICONS[status]),
            h("span", { class: "versions-status-label" }, t(page.lang, LABEL_KEYS[status])),
          ),
      current ? h("span", { class: "versions-current" }, t(page.lang, "version_current")) : null,
    ),
  );
}

/** True when the body already supplies the page's `h1`, by the same rule the doc layout uses. */
function titleFromBody(page: Page): boolean {
  return page.headings.some((heading) => heading.depth === 1);
}

/** The list, or the empty state when the page has no versions. */
function content(props: LayoutProps): ComponentChildren {
  const { page, site } = props;
  const entries = versionsOf(site, page);
  const rows = entries.map((entry) => row(entry, page, site.config.base));

  return [
    h(
      "header",
      { class: "versions-header" },
      titleFromBody(page) ? null : h("h1", { class: "versions-title" }, page.title),
      entries.length === 0
        ? h("p", { class: "versions-empty" }, t(page.lang, "versions_empty"))
        : h("ol", { class: "versions-list" }, rows),
    ),
    page.html.length === 0
      ? null
      : h("div", { class: "versions-body", dangerouslySetInnerHTML: { __html: page.html } }),
  ];
}

/**
 * The versions index page: the base document shell around the page title, the version rows, and
 * the page body. `data-empty` marks the empty state so a stylesheet can give it its own room.
 */
const versions: Layout = (props) => {
  const entries = versionsOf(props.site, props.page);
  return base({
    ...props,
    main: h(
      "article",
      {
        class: "versions",
        "data-pagefind-body": true,
        ...(entries.length === 0 ? { "data-empty": true } : {}),
      },
      content(props) as ComponentChildren,
    ),
  });
};

export default versions;
