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
 * The ISO calendar date (`YYYY-MM-DD`) of a `last_modified_at` value, which may be a string or a
 * `Date` that the front matter parser produced. Anything else reads as no date.
 */
export function isoDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return undefined;
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
  const updated = isoDate(page.frontMatter.last_modified_at);

  const meta = [
    updated === undefined ? null : h("span", { class: "page-footer-updated" }, t(lang, "last_updated"), " ", h("time", { datetime: updated }, updated)),
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
