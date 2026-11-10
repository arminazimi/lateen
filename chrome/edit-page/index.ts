import { h } from "preact";
import type { Chrome, Heading, Page, RepositoryConfig, Site, SiteConfig, SourcePos } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/*
 * "Edit this page" in the page footer, and per-heading "suggest an edit" links.
 *
 * The engine's `outputs/edit-links.ts` (N35) and `outputs/suggest-links.ts` (N36) compute the same URLs for
 * outputs; a site that writes their result to `_data/edit-links.yml` gets it read here first. Without that
 * data the unit computes the URL from `site.config.repository` by the engine's rules, because a theme may
 * `import type` from the engine's contracts and run none of its code (ADR 0023). The two must agree, so a
 * change to one belongs in both until the engine exposes the links as site data on every build.
 */

/** Class on the footer block. `style.css` styles it. */
export const CLASS = "edit-page";

/** Class on the "Edit this page" link. */
export const LINK_CLASS = "edit-page-link";

/** Class on the opt-in list of per-heading links. */
export const HEADINGS_CLASS = "edit-page-headings";

/** Class on a heading's "suggest an edit" link, both in the footer list and inside a heading. */
export const HEADING_LINK_CLASS = "edit-page-heading-link";

/** Branch edit links point to when the config names none, the same default the engine uses. */
const DEFAULT_BRANCH = "main";

/** The host's issue title limit; the title is cut to this many code points, ellipsis included. */
const MAX_TITLE = 256;

/** Longest issue URL written; the engine caps at the same length. */
const MAX_URL = 8000;

/** Marks a value that had to be cut to fit {@link MAX_URL}. */
const ELLIPSIS = "…";

/** Only a web address is linked, so a data file cannot inject `javascript:` or `data:`. */
const SAFE_HREF = /^https?:\/\/[^\s]+$/i;

/** The repository host an edit or issue URL is shaped for. */
type Host = "github" | "gitlab";

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string, trimmed; anything else is absent. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Collapses whitespace, so a title with newlines still reads as one line in the issue form. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The repository's web URL without trailing slashes. */
function webRoot(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * The host whose URL shape applies, from the repository's web URL: `github` for a host that names GitHub,
 * `gitlab` for gitlab.com and a self-hosted GitLab, and `undefined` for any other forge, which has no URL
 * this unit can write without guessing. An unparseable URL also reads as `undefined`.
 */
export function hostOf(repository: RepositoryConfig): Host | undefined {
  let host: string;
  try {
    const parsed = new URL(repository.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    host = parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (host.includes("github")) return "github";
  if (host.includes("gitlab")) return "gitlab";
  return undefined;
}

/** A source path with forward slashes and no leading `./` or `/`, as the repository browser names it. */
function sourcePath(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "");
}

/** Encodes each segment of a `/`-separated path, keeping the separators. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * The file's edit URL: `${root}/edit/${branch}/${path}` on GitHub and `${root}/-/edit/${branch}/${path}` on
 * GitLab. `repository.dir` is already part of `page.source.file` (the model names every source from the
 * repository root), so it is not added again. The branch is one encoded segment, so a branch name with `/`
 * stays a single path part, and each segment of the file path is encoded while its separators stay.
 */
export function editUrlOf(repository: RepositoryConfig, file: string): string | undefined {
  const host = hostOf(repository);
  if (host === undefined) return undefined;
  const path = sourcePath(file);
  if (path.trim() === "") return undefined;
  const branch = repository.branch ?? DEFAULT_BRANCH;
  const edit = host === "gitlab" ? "/-/edit" : "/edit";
  return `${webRoot(repository.url)}${edit}/${encodeURIComponent(branch)}/${encodePath(path)}`;
}

/** One entry of the engine's edit-link output, or of a data file shaped like it. */
function entryHref(entry: Record<string, unknown>): string | undefined {
  return text(entry.editUrl) ?? text(entry.edit_url);
}

/** A web address from site data, or `undefined` when the value is not one. */
function storedHref(value: unknown): string | undefined {
  const href = text(value);
  return href !== undefined && SAFE_HREF.test(href) ? href : undefined;
}

/**
 * A page's edit URL from engine-written site data, keyed by page URL. The engine's `editLinksOf` returns a
 * list of `{ url, source, editUrl }`, so an array is accepted, as is a record of page URL to either the URL
 * itself or an object with `editUrl` (or `edit_url`). Anything else, or an unsafe scheme, is absent.
 */
export function editLinkFromData(data: unknown, url: string): string | undefined {
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!isRecord(entry) || entry.url !== url) continue;
      const href = entryHref(entry);
      if (href === undefined) continue;
      const stored = storedHref(href);
      if (stored !== undefined) return stored;
    }
    return undefined;
  }
  if (!isRecord(data)) return undefined;
  const value = data[url];
  if (typeof value === "string") return storedHref(value);
  if (!isRecord(value)) return undefined;
  return storedHref(entryHref(value));
}

/** The page's edit link: `site.data` first, then the repository, or `undefined` when neither gives one. */
export function editHref(site: Site, page: Page): string | undefined {
  const data = site.data["edit-links"] ?? site.data.editLinks;
  const fromData = editLinkFromData(data, page.url);
  if (fromData !== undefined) return fromData;
  const repository = site.config.repository;
  return repository === undefined ? undefined : editUrlOf(repository, page.source.file);
}

/** The heading's source line, or `undefined` when the heading is generated and has no real source span. */
function headingSource(heading: Heading): { file: string; line: number } | undefined {
  const pos: Partial<SourcePos> | undefined = heading.pos;
  if (pos === undefined || typeof pos.file !== "string" || pos.file === "") return undefined;
  const line = pos.line;
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) return undefined;
  return { file: pos.file, line };
}

/** The issue title, cut to {@link MAX_TITLE} code points with an ellipsis so the page and heading still show. */
function titleOf(page: Page, heading: Heading): string {
  const pageTitle = oneLine(page.title) || page.url;
  const headingText = oneLine(heading.text) || heading.id;
  const full = `Suggest edit: ${pageTitle} — ${headingText}`;
  const points = [...full];
  if (points.length <= MAX_TITLE) return full;
  return `${points.slice(0, MAX_TITLE - 1).join("")}${ELLIPSIS}`;
}

/** The issue body: the page, its source file and line, and the heading anchor, each on its own line. */
function bodyOf(page: Page, heading: Heading, source: { file: string; line: number }): string {
  return [
    "Suggest an edit to this heading.",
    "",
    `Page: ${page.url}`,
    `Source: ${source.file}:${source.line}`,
    `Heading: ${heading.id}`,
    "",
  ].join("\n");
}

/** The host's new-issue URL for an already-built title and body. */
function issueUrl(root: string, host: Host, title: string, body: string): string {
  const encodedTitle = encodeURIComponent(title.toWellFormed());
  const encodedBody = encodeURIComponent(body.toWellFormed());
  return host === "gitlab"
    ? `${root}/-/issues/new?issue[title]=${encodedTitle}&issue[description]=${encodedBody}`
    : `${root}/issues/new?title=${encodedTitle}&body=${encodedBody}`;
}

/** The URL, cut to {@link MAX_URL} by shortening the body, never inside a code point. */
function fitUrl(root: string, host: Host, title: string, body: string): string | undefined {
  const full = issueUrl(root, host, title, body);
  if (full.length <= MAX_URL) return full;

  const points = [...body];
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = issueUrl(root, host, title, `${points.slice(0, middle).join("")}${ELLIPSIS}`);
    if (candidate.length <= MAX_URL) low = middle;
    else high = middle - 1;
  }
  const candidate = issueUrl(root, host, title, `${points.slice(0, low).join("")}${ELLIPSIS}`);
  return candidate.length <= MAX_URL ? candidate : undefined;
}

/**
 * The new-issue URL that suggests an edit to one heading, or `undefined` when there is nothing to point at:
 * no repository, a repository URL that is not a web URL or is on an unknown forge, no page URL, an unknown
 * heading (`heading.id` is not one of `page.headings`), or a generated heading with no source position.
 *
 * The heading is looked up in the page so the position always comes from the model, not from a copy the
 * caller may have built. GitHub takes `/issues/new?title=&body=`; GitLab takes `/-/issues/new` with its own
 * query keys, the same shapes the engine's `suggest-links.ts` writes.
 */
export function suggestEditUrl(
  repository: RepositoryConfig | undefined,
  page: Page,
  heading: Heading | undefined,
): string | undefined {
  if (repository === undefined || heading === undefined) return undefined;
  if (page.url === "") return undefined;
  const host = hostOf(repository);
  if (host === undefined) return undefined;
  const root = webRoot(repository.url);

  const found = page.headings.find((candidate) => candidate.id === heading.id);
  if (found === undefined || found.id === "") return undefined;
  const source = headingSource(found);
  if (source === undefined) return undefined;

  return fitUrl(root, host, titleOf(page, found), bodyOf(page, found, source));
}

/** The `theme.options.editPage` block as the config wrote it. */
interface EditPageOptions {
  /** `true` adds per-heading links; every other value, and no block, leaves them out. */
  readonly headingLinks?: unknown;
}

/** Whether the site opted in to per-heading links. */
export function headingLinksEnabled(config: SiteConfig): boolean {
  const options = config.theme.options?.editPage;
  return isRecord(options) && (options as EditPageOptions).headingLinks === true;
}

/** One heading and the issue URL that suggests an edit to it. */
export interface HeadingLink {
  /** The heading, from `page.headings`. */
  readonly heading: Heading;
  /** The host's new-issue URL for this heading. */
  readonly url: string;
}

/**
 * The per-heading links for a page, in document order, when the site asked for them and the repository gives
 * a URL. An empty list otherwise, which leaves the footer block to the page link alone.
 */
export function headingLinksOf(site: Site, page: Page): readonly HeadingLink[] {
  if (!headingLinksEnabled(site.config)) return [];
  const links: HeadingLink[] = [];
  for (const heading of page.headings) {
    const url = suggestEditUrl(site.config.repository, page, heading);
    if (url !== undefined) links.push({ heading, url });
  }
  return links;
}

/**
 * The edit-page footer: one "Edit this page" link to the page's source, and, when `theme.options.editPage.
 * headingLinks` is `true`, a list of per-heading "suggest an edit" issue links. Renders nothing at all when
 * there is no link to point at, so a site without a repository shows no dead control (AC1, AC3).
 *
 * The heading list is the visible fallback for now. `style.css` also carries the rules that reveal a
 * `.edit-page-heading-link` placed inside a heading on hover or focus; injecting those links next to each
 * heading is an engine Markdown/HTML stage task, since a chrome part cannot change `page.html`.
 */
const editPage: Chrome = ({ site, page }) => {
  if (page.kind !== "doc") return null;

  const href = editHref(site, page);
  const headings = headingLinksOf(site, page);
  if (href === undefined && headings.length === 0) return null;

  return h(
    "div",
    { class: CLASS, "data-edit-page": true },
    href === undefined ? null : h("a", { class: LINK_CLASS, href, rel: "noopener" }, t(page.lang, "edit_page")),
    headings.length === 0
      ? null
      : h(
          "ul",
          { class: HEADINGS_CLASS },
          ...headings.map(({ heading, url }) =>
            h(
              "li",
              null,
              h(
                "a",
                {
                  class: HEADING_LINK_CLASS,
                  href: url,
                  rel: "noopener",
                  "aria-label": t(page.lang, "suggest_edit_heading", { heading: heading.text || heading.id }),
                },
                heading.text || heading.id,
              ),
            ),
          ),
        ),
  );
};

export default editPage;
