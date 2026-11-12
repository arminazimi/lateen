import { h } from "preact";
import type { Chrome, Page, RepositoryConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/*
 * Labels without a key in the string table (i18n/*.json) are English, the same as the other chrome
 * parts' labels. The strings that do have a key are read through `t()`.
 */
const EDIT_LINK = "Edit this page on GitHub";
const HELPFUL = "Was this helpful?";
const FEEDBACK = "Give feedback";
const DEFAULT_BRANCH = "main";

/** Encodes each segment of a `/`-separated path, keeping the separators. */
const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

/** The repository's web URL without trailing slashes, or `undefined` when the site has none. */
function webRoot(repository: RepositoryConfig | undefined): string | undefined {
  return repository === undefined ? undefined : repository.url.replace(/\/+$/, "");
}

/**
 * A whole ISO date (`YYYY-MM-DD`) or a whole ISO date-time: `T`, hour and minute, optional seconds with
 * optional fraction, and an optional `Z` or `±hh:mm` offset. A date followed by anything else is not a
 * date the footer may claim.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))?)?$/;

/** True when an optional time or offset group stays below `limit`: hours below 24, minutes and seconds below 60. */
const inRange = (group: string | undefined, limit: number): boolean => group === undefined || Number(group) < limit;

/** True when the year, month and day exist on the Gregorian calendar. `Date.UTC` rolls impossible days over. */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The ISO calendar date (`YYYY-MM-DD`) of a `last_modified_at` value, which may be a string or a
 * `Date` that the front matter parser produced. Only a whole, real ISO date or ISO date-time reads as a
 * date: an impossible day (`2026-02-30`), a malformed suffix (`2026-03-04Textra`), a time out of range,
 * an invalid `Date` or any other value reads as no date. Nothing here consults the current clock.
 */
export function isoDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const iso = value.toISOString().slice(0, 10);
    return ISO_DATE.test(iso) ? iso : undefined;
  }
  if (typeof value !== "string") return undefined;

  const match = ISO_DATE.exec(value);
  if (match === null) return undefined;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isCalendarDate(year, month, day)) return undefined;
  if (!inRange(match[4], 24) || !inRange(match[5], 60) || !inRange(match[6], 60)) return undefined;
  if (!inRange(match[7], 24) || !inRange(match[8], 60)) return undefined;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * True when a front matter value carries nothing an author wrote: a missing key, an empty YAML field
 * (`null`), or a blank string. Such a value is an omission; a value that is present but unreadable is
 * rejected evidence, which the footer reports rather than hides.
 */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** What `last_modified_at` says: a real date (`valid`), authored but unreadable evidence (`invalid`), or nothing (`absent`). */
export type DateStatus = "valid" | "invalid" | "absent";

/** One piece of last-updated evidence: the ISO date when it is real, and what kind of evidence it is. */
export interface PageDate {
  readonly date: string | undefined;
  readonly status: DateStatus;
}

/** The footer's last-updated evidence for a front matter value, without reading the clock. */
export function dateEvidence(value: unknown): PageDate {
  const date = isoDate(value);
  if (date !== undefined) return { date, status: "valid" };
  return { date: undefined, status: isAbsent(value) ? "absent" : "invalid" };
}

/** The page's source file and line, as the agent prompt names them. */
function sourceOf(page: Page): string {
  return `${page.source.file}:${page.source.line}`;
}

/** The edit link: the file's page on the repository's web view at the configured branch. */
function editUrl(root: string, repository: RepositoryConfig, file: string): string {
  const branch = repository.branch ?? DEFAULT_BRANCH;
  return `${root}/edit/${encodeURIComponent(branch)}/${encodePath(file)}`;
}

/** A new issue on the repository, with the page's address and source file filled in. */
function feedbackUrl(root: string, page: Page): string {
  const title = encodeURIComponent(`Feedback: ${page.title}`);
  const body = encodeURIComponent(`Page: ${page.url}\nSource: ${page.source.file}\n`);
  return `${root}/issues/new?title=${title}&body=${body}`;
}

/**
 * The line under the article: when the page last changed, a link to edit its source, the copy button
 * for the agent prompt, and a feedback link. The button starts `hidden` and `client.ts` reveals it,
 * so a visitor without JavaScript sees no control that would do nothing. Links without a configured
 * repository are left out, since they have no address to point at.
 */
const pageFooter: Chrome = ({ site, page }) => {
  const lang = page.lang;
  const repository = site.config.repository;
  const root = webRoot(repository);
  const updated = dateEvidence(page.frontMatter.last_modified_at);

  // Rejected evidence stays visible as the neutral "Date unknown" wording, never as a time element or a
  // "Last updated" claim; nothing written at all stays invisible.
  const updatedNode =
    updated.date !== undefined
      ? h(
          "span",
          { class: "page-footer-updated" },
          t(lang, "last_updated"),
          " ",
          h("time", { datetime: updated.date }, updated.date),
        )
      : updated.status === "invalid"
        ? h(
            "span",
            { class: "page-footer-updated", "data-date-status": "invalid" },
            t(lang, "changelog_date_unknown"),
          )
        : null;

  const meta = [
    updatedNode,
    root === undefined || repository === undefined
      ? null
      : h("a", { class: "page-footer-edit", href: editUrl(root, repository, page.source.file) }, EDIT_LINK),
  ];

  const hasMeta = meta.some((item) => item !== null);

  return h(
    "div",
    { class: "page-footer" },
    hasMeta ? h("p", { class: "page-footer-meta" }, ...meta) : null,
    h(
      "button",
      {
        type: "button",
        class: "page-footer-copy",
        hidden: true,
        "data-page-footer-copy": true,
        "data-prompt": t(lang, "edit_prompt", { source: sourceOf(page), text: page.title }),
        "data-copied": t(lang, "copied"),
        "data-copy-failed": t(lang, "copy_failed"),
      },
      t(lang, "edit_label"),
    ),
    root === undefined
      ? null
      : h("p", { class: "page-footer-feedback" }, HELPFUL, " ", h("a", { href: feedbackUrl(root, page) }, FEEDBACK)),
  );
};

export default pageFooter;
