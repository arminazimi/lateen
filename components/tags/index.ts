import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::tags{items='["guide","api"]'}`. */
export const directive = "tags";

/** Class on the list. `style.css` styles it; the accessibility gate finds it by this class. */
export const TAGS_CLASS = "tags";

/** Class on each chip. */
export const TAG_CLASS = "tag";

/** Props from the directive: `::tags{items='["guide",{"label":"API","url":"/api/"}]'}`. */
export type TagsProps = {
  /**
   * JSON array of tags, each a string or an object with a `label` and an optional `url`:
   * `'["guide",{"label":"API","url":"/api/"}]'`. When it is missing or invalid, the page's
   * `tags` front matter is used instead.
   */
  items?: string;
};

/** One chip: its visible label and, when it is a safe URL, where it goes. */
export interface Tag {
  readonly label: string;
  readonly url?: string;
}

/**
 * A URL a tag may link to: root-relative (`/guide/`, but not protocol-relative `//host`) or
 * `http`/`https`. Anything else (`javascript:`, `mailto:`, a relative path) stays plain text.
 */
const SAFE_URL = /^(?:\/(?![/\\])|https?:\/\/)[^\s"'<>\\]*$/i;

/** One tag from a string or an object; a blank label or an unsafe URL is not a tag. */
export function tagOf(value: unknown): Tag | undefined {
  if (typeof value === "string") {
    const label = value.trim();
    return label === "" ? undefined : { label };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const record = value as Readonly<Record<string, unknown>>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (label === "") return undefined;

  const url = typeof record.url === "string" ? record.url.trim() : "";
  return SAFE_URL.test(url) ? { label, url } : { label };
}

/** The tags in the `items` prop, or undefined when it is absent or not a JSON array (so front matter wins). */
export function parseItems(raw: unknown): Tag[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return undefined;
    return value.map(tagOf).filter((tag): tag is Tag => tag !== undefined);
  } catch {
    return undefined;
  }
}

/** The tags in front matter: a list of strings, or one comma-separated string. */
export function tagsOf(value: unknown): Tag[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map(tagOf).filter((tag): tag is Tag => tag !== undefined);
}

/** The tags to show: the `items` prop when it is a JSON array, otherwise the page's `tags` front matter. */
export function tagsFor(props: TagsProps, frontMatter: Readonly<Record<string, unknown>>): Tag[] {
  return parseItems(props.items) ?? tagsOf(frontMatter.tags);
}

/**
 * A wrapping list of small tag chips for a page's categories or topics. A chip is a link only when
 * its URL is root-relative or `https`/`http`; every other URL shows as plain text. The list wraps in
 * both directions, so it reads the same in right-to-left pages, and renders nothing when empty.
 */
export default function tags({ props, page }: ComponentProps<TagsProps>) {
  const items = tagsFor(props, page.frontMatter);
  if (items.length === 0) return null;

  return h(
    "ul",
    { class: TAGS_CLASS, "aria-label": t(page.lang, "tags") },
    items.map((tag, index) =>
      h(
        "li",
        { key: index, class: TAG_CLASS },
        tag.url === undefined ? h("span", null, tag.label) : h("a", { href: tag.url }, tag.label),
      ),
    ),
  );
}
