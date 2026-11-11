import { h } from "preact";
import type { Chrome, Page, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The `theme.options.feedback` block as the config wrote it. */
interface FeedbackOptions {
  readonly endpoint?: unknown;
}

/** A non-empty string from the config, trimmed; anything else is not an endpoint. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The configured feedback endpoint, or `undefined` when the site sets none. */
export function endpointOf(config: SiteConfig): string | undefined {
  const options = config.theme.options?.feedback;
  if (typeof options !== "object" || options === null) return undefined;
  return text((options as FeedbackOptions).endpoint);
}

/** The version the page declares in its front matter under `version`, or `undefined` when it declares none. */
export function versionOf(page: Page): string | undefined {
  return text(page.frontMatter.version);
}

/**
 * The page feedback widget: a question with two vote buttons and a status region. It renders nothing
 * when the site sets no endpoint, so a site that does not use it carries no markup and no request
 * address. The root and both buttons start `hidden`; `client.ts` reveals them, so a visitor without
 * JavaScript sees no control that would do nothing. The vote is posted to
 * `theme.options.feedback.endpoint` with the page's own URL, its canonical source file, its language,
 * and the version its front matter declares, so whoever reads the answers can find the exact page
 * and the text it came from.
 */
const feedback: Chrome = ({ site, page }) => {
  const endpoint = endpointOf(site.config);
  if (endpoint === undefined) return null;

  const lang = page.lang;
  const version = versionOf(page);
  return h(
    "div",
    {
      class: "feedback",
      "data-feedback": true,
      hidden: true,
      "data-endpoint": endpoint,
      "data-url": page.url,
      "data-source": page.source.file,
      "data-lang": lang,
      ...(version === undefined ? {} : { "data-version": version }),
      "data-thanks": t(lang, "feedback_thanks"),
      "data-failed": t(lang, "feedback_failed"),
      "data-already": t(lang, "feedback_already"),
    },
    h("p", { class: "feedback-question" }, t(lang, "feedback_question")),
    h(
      "div",
      { class: "feedback-actions" },
      h(
        "button",
        { type: "button", class: "feedback-button", hidden: true, "data-feedback-vote": "yes" },
        t(lang, "feedback_yes"),
      ),
      h(
        "button",
        { type: "button", class: "feedback-button", hidden: true, "data-feedback-vote": "no" },
        t(lang, "feedback_no"),
      ),
    ),
    h("p", { class: "feedback-status", role: "status" }, ""),
  );
};

export default feedback;
