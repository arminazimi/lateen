import { h } from "preact";
import type { Chrome, Page, RepositoryConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/*
 * Labels without a key in the string table (i18n/*.json) are English, the same as the other chrome
 * parts' labels. The strings that do have a key are read through `t()`.
 */
const HELPFUL = "Was this helpful?";
const FEEDBACK = "Give feedback";

/** The repository's web URL without trailing slashes, or `undefined` when the site has none. */
function webRoot(repository: RepositoryConfig | undefined): string | undefined {
  return repository === undefined ? undefined : repository.url.replace(/\/+$/, "");
}

/** The page's source file and line, with its language and declared version, as an agent prompt names them. */
function sourceOf(page: Page): string {
  const version = typeof page.frontMatter.version === "string" ? page.frontMatter.version.trim() : "";
  const location = `${page.source.file}:${page.source.line}`;
  return version === "" ? location : `${location} (${page.lang}, ${version})`;
}

/** A new issue on the repository, with the page's address and source file filled in. */
function feedbackUrl(root: string, page: Page): string {
  const title = encodeURIComponent(`Feedback: ${page.title}`);
  const body = encodeURIComponent(`Page: ${page.url}\nSource: ${page.source.file}\n`);
  return `${root}/issues/new?title=${title}&body=${body}`;
}

/**
 * The actions under the article: the copy button for the agent prompt and a feedback link. The button
 * starts `hidden` and `client.ts` reveals it, so a visitor without JavaScript sees no control that
 * would do nothing. The feedback link is left out without a configured repository. The edit link and
 * the last-updated line are separate chrome units, so the doc and tutorial layouts place them once.
 */
const pageFooter: Chrome = ({ site, page }) => {
  const lang = page.lang;
  const repository = site.config.repository;
  const root = webRoot(repository);
  return h(
    "div",
    { class: "page-footer" },
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
