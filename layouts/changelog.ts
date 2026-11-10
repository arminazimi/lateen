import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps, Page } from "@velella/mizzen/contracts";
import base from "./base.ts";
import drawer from "../chrome/drawer/index.ts";
import header from "../chrome/header/index.ts";
import sidebar from "../chrome/sidebar/index.ts";
import changelogEntry, {
  idOf,
  versionTextOf,
  type ChangelogEntryProps,
} from "../components/changelog-entry/index.ts";
import { t } from "../i18n/index.ts";

/** Class on the page's article. */
export const ARTICLE_CLASS = "changelog";

/** Class on the compact list of versions above the releases. */
export const TOC_CLASS = "changelog-toc";

/** Class on the heading of the version list. */
export const TOC_TITLE_CLASS = "changelog-toc-title";

/** Class on the version list itself. */
export const TOC_LIST_CLASS = "changelog-toc-list";

/** Class on the list that holds the release entries. */
export const RELEASES_CLASS = "changelog-releases";

/** Class on the body the layout falls back to when front matter gives no releases. */
export const BODY_CLASS = "changelog-body";

/** One release from front matter, normalized to the values the entry component reads. */
export interface Release {
  /** The version, such as `1.2.0`; `undefined` renders the "Unreleased" fallback. */
  readonly version: string | undefined;
  /** The release date as `YYYY-MM-DD`; `undefined` renders the component's date fallback. */
  readonly date: string | undefined;
  /** Categories as the component's comma list; a front-matter list is joined first. */
  readonly categories: string | undefined;
  /** The entry body as HTML, passed to the component's body slot. */
  readonly body: string;
  /** The entry's position in front matter, so ties keep the author's order. */
  readonly order: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A front-matter value as text: strings as written, numbers as their digits, anything else dropped. */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/** `categories` may be the component's comma list or a YAML list of names. */
function categoriesText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const names = value.filter((item): item is string => typeof item === "string");
  return names.length === 0 ? undefined : names.join(",");
}

/**
 * The releases in `releases` front matter: `[{ version, date, categories?, body? }]`. A record that
 * is not a mapping is dropped, so one malformed entry cannot break the page.
 */
export function releasesOf(page: Page): readonly Release[] {
  const value = page.frontMatter.releases;
  if (!Array.isArray(value)) return [];
  const releases: Release[] = [];
  for (const [order, item] of value.entries()) {
    if (!isRecord(item)) continue;
    releases.push({
      version: textOf(item.version),
      date: textOf(item.date),
      categories: categoriesText(item.categories),
      body: textOf(item.body) ?? "",
      order,
    });
  }
  return releases;
}

/** A version split at its first `-`: the numeric core and the pre-release identifiers. */
function splitVersion(version: string): { readonly core: readonly number[]; readonly pre: readonly string[] } {
  const text = version.trim().replace(/^v(?=\d)/i, "");
  const dash = text.indexOf("-");
  const core = dash === -1 ? text : text.slice(0, dash);
  const pre = dash === -1 ? "" : text.slice(dash + 1);
  return {
    core: (core.match(/\d+/g) ?? []).map((part) => Number.parseInt(part, 10)),
    pre: pre === "" ? [] : pre.split("."),
  };
}

/** Compares numeric cores segment by segment; a missing segment counts as zero. */
function compareCore(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** Compares pre-release identifiers the way semver does: numeric before text, numbers by value. */
function comparePre(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    const leftNumber = /^\d+$/.test(left);
    const rightNumber = /^\d+$/.test(right);
    if (leftNumber && rightNumber) {
      const difference = Number(left) - Number(right);
      if (difference !== 0) return difference < 0 ? -1 : 1;
      continue;
    }
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    if (left !== right) return left < right ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/**
 * Orders two version texts, ascending: `1.9.0` before `1.10.0`, and `2.0.0-rc.1` before `2.0.0`.
 * Text that holds no number sorts before numbered versions, so it stays out of the way.
 */
export function compareVersions(a: string, b: string): number {
  const left = splitVersion(a);
  const right = splitVersion(b);
  const core = compareCore(left.core, right.core);
  if (core !== 0) return core;
  if (left.pre.length === 0 || right.pre.length === 0) {
    if (left.pre.length === right.pre.length) return 0;
    // A release is newer than any pre-release of the same core.
    return left.pre.length === 0 ? 1 : -1;
  }
  return comparePre(left.pre, right.pre);
}

/** A release with no usable version, which the component renders as "Unreleased". */
function isUnreleased(release: Release): boolean {
  return release.version === undefined || release.version.trim() === "";
}

/**
 * Releases newest first: the unreleased entry leads, then versions descend by number (not by text,
 * so `1.10.0` comes before `1.9.0`), and the author's order breaks ties.
 */
export function newestFirst(releases: readonly Release[]): readonly Release[] {
  return [...releases].sort((a, b) => {
    const aUnreleased = isUnreleased(a);
    const bUnreleased = isUnreleased(b);
    if (aUnreleased !== bUnreleased) return aUnreleased ? -1 : 1;
    if (!aUnreleased && !bUnreleased) {
      const byVersion = compareVersions(b.version!, a.version!);
      if (byVersion !== 0) return byVersion;
    }
    return a.order - b.order;
  });
}

/** The same rule as `doc.ts`: the body supplies the `h1`, so the layout must not render a second one. */
function titleFromBody(props: LayoutProps): boolean {
  return props.page.headings.some((heading) => heading.depth === 1);
}

/** One release through the `changelog-entry` component, props-shaped. */
function entry(release: Release, props: LayoutProps): ComponentChildren {
  const entryProps: ChangelogEntryProps = {
    ...(release.version === undefined ? {} : { version: release.version }),
    ...(release.date === undefined ? {} : { date: release.date }),
    ...(release.categories === undefined ? {} : { categories: release.categories }),
  };
  return changelogEntry({
    props: entryProps,
    page: props.page,
    site: props.site,
    html: release.body,
  }) as ComponentChildren;
}

/**
 * The compact contents at the top of the page: one link per release. The ids come from the entry
 * component's `idOf`, so the links and the section anchors can never drift apart.
 */
function versionToc(releases: readonly Release[], lang: string): ComponentChildren {
  if (releases.length === 0) return null;
  const label = t(lang, "versions");
  return h(
    "nav",
    { class: TOC_CLASS, "aria-label": label },
    h("h2", { class: TOC_TITLE_CLASS }, label),
    h(
      "ul",
      { class: TOC_LIST_CLASS },
      releases.map((release) =>
        h(
          "li",
          null,
          h("a", { href: `#${idOf(release.version)}` }, versionTextOf(release.version, lang)),
        ),
      ),
    ),
  );
}

/**
 * The page: its title, the version contents, and one entry per release, newest first. Without
 * releases it renders the page's Markdown body instead, so a hand-written Keep a Changelog page
 * still works.
 */
function article(props: LayoutProps): ComponentChildren {
  const { page } = props;
  const releases = newestFirst(releasesOf(page));

  if (releases.length === 0) {
    return h(
      "article",
      { class: ARTICLE_CLASS, "data-pagefind-body": true },
      titleFromBody(props) ? null : h("h1", { class: "changelog-title" }, page.title),
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: page.html } }),
    );
  }

  return h(
    "article",
    { class: ARTICLE_CLASS, "data-pagefind-body": true },
    h("h1", { class: "changelog-title" }, page.title),
    versionToc(releases, page.lang),
    h(
      "div",
      { class: RELEASES_CLASS },
      releases.map((release) => entry(release, props)),
    ),
  );
}

/**
 * The changelog page: the base shell with the usual header and mobile drawer, the navigation
 * sidebar, and the release list. `changelog.css` styles the version contents and the page.
 */
const changelog: Layout = (props) =>
  base({
    ...props,
    header: h(
      Fragment,
      null,
      header(props) as ComponentChildren,
      drawer(props) as ComponentChildren,
    ),
    sidebar: sidebar(props) as ComponentChildren,
    main: article(props),
  });

export default changelog;
