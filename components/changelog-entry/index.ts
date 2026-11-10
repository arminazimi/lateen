import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { calendarDate } from "../../src/dates.ts";
import { t } from "../../i18n/index.ts";

/** The category names a changelog entry can mark. The order here is the order the documentation lists them. */
export const CATEGORIES = ["added", "changed", "fixed", "removed", "security"] as const;

export type Category = (typeof CATEGORIES)[number];

/** Class on the section that wraps one entry. */
export const SECTION_CLASS = "changelog-entry";

/** Class on the h2 that holds the version. */
export const HEADING_CLASS = "changelog-entry-version";

/** Class on the span that holds the version text, so the heading's name excludes the link icon. */
export const VERSION_CLASS = "changelog-entry-version-text";

/** Class on the self-link anchor beside the version. */
export const ANCHOR_CLASS = "changelog-entry-anchor";

/** Class on the machine-readable date. */
export const DATE_CLASS = "changelog-entry-date";

/** Class on the row that holds the date and the categories. */
export const META_CLASS = "changelog-entry-meta";

/** Class on the category list. */
export const CATEGORIES_CLASS = "changelog-entry-categories";

/** Class every category item carries, followed by `-<category>`. */
export const CATEGORY_CLASS = "changelog-entry-category";

/** Class on a category's visible label. */
export const CATEGORY_LABEL_CLASS = "changelog-entry-category-label";

/** Class on the rendered entry body. */
export const BODY_CLASS = "changelog-entry-body";

/** Class on the paragraph shown when the author gives no body. */
export const EMPTY_CLASS = "changelog-entry-empty";

/** Props from the directive: `:::changelog-entry{version="1.2.0" date="2026-11-09" categories="added,fixed"}`. */
export type ChangelogEntryProps = {
  /** The release version, such as `1.2.0` or `v1.2.0`. Missing or blank falls back to "Unreleased". */
  version?: string;
  /** The release date as `YYYY-MM-DD`; the date part of an ISO date-time is used too. */
  date?: string;
  /** Categories separated by commas, or a JSON array of strings: `added`, `changed`, `fixed`, `removed`, `security`. */
  categories?: string;
};

/** The i18n key of each category's visible label. */
const CATEGORY_KEYS: Readonly<Record<Category, string>> = {
  added: "changelog_added",
  changed: "changelog_changed",
  fixed: "changelog_fixed",
  removed: "changelog_removed",
  security: "changelog_security",
};

/**
 * Stroke paths for each category's icon, drawn on a 16×16 grid. Every icon is symmetric along the reading
 * direction, so it needs no mirror rule under right-to-left.
 */
const CATEGORY_ICONS: Readonly<Record<Category, readonly string[]>> = {
  added: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M8 5v6", "M5 8h6"],
  changed: ["M11.5 2.5a2.12 2.12 0 0 1 3 3L5 15H2v-3Z", "M10 4l2 2"],
  fixed: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M5.5 8.25l1.75 1.75 3.5-3.5"],
  removed: ["M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M5 8h6"],
  security: ["M8 1.75 13.25 4v4.25c0 3-2.2 5.2-5.25 6-3.05-.8-5.25-3-5.25-6V4Z", "M5.75 8l1.75 1.75L10.5 6.5"],
};

/** Chain path data of the self-link icon, the same 16×16 link the heading anchor uses. */
const LINK_PATH =
  "m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z";

/** The slug an id is built from: lower case, dots to dashes, runs of other characters to one dash. */
export function slugOf(version: unknown): string {
  if (typeof version !== "string") return "unversioned";
  const text = version.trim().toLowerCase().replace(/^v(?=\d)/, "");
  const slug = text
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug === "" ? "unversioned" : slug;
}

/** The section id of an entry: `v` followed by {@link slugOf}, such as `v1-2-0`. */
export function idOf(version: unknown): string {
  return `v${slugOf(version)}`;
}

/** The id of the span that holds the version text; unique per entry as long as versions are. */
export function versionTextId(version: unknown): string {
  return `changelog-version-${idOf(version)}`;
}

/** The category names in a `categories` value, in author order, deduplicated, with unknown values dropped. */
export function categoriesOf(value: unknown): Category[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(text);
        values = Array.isArray(parsed) ? parsed : [];
      } catch {
        values = text.split(",");
      }
    } else {
      values = text.split(",");
    }
  }

  const found: Category[] = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const name = item.trim().toLowerCase();
    if ((CATEGORIES as readonly string[]).includes(name) && !found.includes(name as Category)) {
      found.push(name as Category);
    }
  }
  return found;
}

/** The visible version text, or the translated fallback when the author gave none. */
export function versionTextOf(version: unknown, lang: string): string {
  if (typeof version === "string" && version.trim() !== "") return version.trim();
  return t(lang, "changelog_unreleased");
}

/** The link icon: a chain drawn in `currentColor`, hidden from assistive technology. */
function anchorIcon() {
  return h(
    "svg",
    {
      class: "changelog-entry-anchor-icon",
      viewBox: "0 0 16 16",
      width: 16,
      height: 16,
      "aria-hidden": "true",
      focusable: "false",
    },
    h("path", { d: LINK_PATH }),
  );
}

/** One category's icon, hidden from assistive technology because the label beside it names the category. */
function categoryIcon(category: Category) {
  return h(
    "svg",
    {
      class: "changelog-entry-category-icon",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    CATEGORY_ICONS[category].map((d) => h("path", { d })),
  );
}

/** The date, machine-readable when it is a real calendar date, and clear fallback text when it is not. */
function dateNode(value: unknown, lang: string) {
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = text === "" ? undefined : calendarDate(text, lang);
  if (parsed === undefined) {
    return h("span", { class: DATE_CLASS }, t(lang, "changelog_date_unknown"));
  }
  return h("time", { class: DATE_CLASS, datetime: parsed.datetime }, parsed.text);
}

/** The category list: an icon and a text label per category, so the meaning never depends on color alone. */
function categoryList(categories: readonly Category[], lang: string) {
  return h(
    "ul",
    { class: CATEGORIES_CLASS, "aria-label": t(lang, "categories") },
    categories.map((category) =>
      h(
        "li",
        { class: `${CATEGORY_CLASS} ${CATEGORY_CLASS}-${category}` },
        categoryIcon(category),
        h("span", { class: CATEGORY_LABEL_CLASS }, t(lang, CATEGORY_KEYS[category])),
      ),
    ),
  );
}

/**
 * One release in a changelog: a version heading that links to itself, a machine-readable date, the categories
 * the release touches, and the entry text. Missing version or date values render clear fallback text instead of
 * an empty heading or a bare "v". An empty body keeps the heading and shows a short "no details" paragraph, so a
 * stub entry is visibly a stub rather than an empty section.
 */
export default function changelogEntry({ props, page, html }: ComponentProps<ChangelogEntryProps>) {
  const lang = page.lang;
  const id = idOf(props.version);
  const textId = versionTextId(props.version);
  const version = versionTextOf(props.version, lang);
  const categories = categoriesOf(props.categories);

  return h(
    "section",
    { class: SECTION_CLASS, id, "aria-labelledby": textId },
    h(
      "h2",
      { class: HEADING_CLASS, "aria-labelledby": textId },
      h("span", { id: textId, class: VERSION_CLASS }, version),
      h(
        "a",
        { class: ANCHOR_CLASS, href: `#${id}`, "aria-label": t(lang, "changelog_anchor", { version }) },
        anchorIcon(),
      ),
    ),
    h(
      "div",
      { class: META_CLASS },
      dateNode(props.date, lang),
      categories.length === 0 ? null : categoryList(categories, lang),
    ),
    h(
      "div",
      { class: BODY_CLASS },
      html === ""
        ? h("p", { class: EMPTY_CLASS }, t(lang, "changelog_empty"))
        : h("div", { dangerouslySetInnerHTML: { __html: html } }),
    ),
  );
}
