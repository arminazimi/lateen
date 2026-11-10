import { h } from "preact";
import type { Chrome, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The id a bar without one is stored under; two bars need two ids to be dismissed separately. */
export const DEFAULT_ID = "announcement";

/** The `announcement` block from `theme.options`, as the config wrote it. */
type Announcement = {
  readonly id?: unknown;
  readonly text?: unknown;
  readonly href?: unknown;
};

/** The announcement options, or undefined when the site sets no block. */
function announcementOf(config: SiteConfig): Announcement | undefined {
  const value = config.theme.options?.announcement;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Announcement) : undefined;
}

/** A non-empty line of text from the config, trimmed; anything else is not shown. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Only `https`, `http`, `mailto`, and root-relative paths are linked; `javascript:`, protocol-relative (`//`), and
 * other schemes are dropped, so a config value cannot inject a script.
 */
function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url) || /^\/(?!\/)/.test(url);
}

/** A root-relative link is relative to the site root, so the site's `base` comes first (as for the header logo). */
function hrefOf(base: string, url: string): string {
  return url.startsWith("/") ? `${base}${url}` : url;
}

/**
 * The dismissible announcement bar, from `theme.options.announcement`:
 *
 * ```yaml
 * theme:
 *   options:
 *     announcement:
 *       id: v0-4
 *       text: Slipway 0.4 is out.
 *       href: /changelog/
 * ```
 *
 * The bar renders nothing without text. Its dismiss button starts hidden, so a visitor without JavaScript sees the
 * text but no control that would do nothing; `client.ts` reveals it and remembers a dismissal per `id`.
 */
const announcement: Chrome = ({ site }) => {
  const { config } = site;
  const options = announcementOf(config);
  if (options === undefined) return null;

  const message = text(options.text);
  if (message === undefined) return null;

  const id = text(options.id) ?? DEFAULT_ID;
  const url = text(options.href);
  const href = url !== undefined && isSafeUrl(url) ? hrefOf(config.base, url) : undefined;
  const label = t(config.lang, "announcement");
  const dismiss = t(config.lang, "announcement_dismiss");

  return h(
    "div",
    {
      class: "announcement",
      role: "region",
      "aria-label": label,
      "data-announcement": true,
      "data-announcement-id": id,
    },
    h(
      "p",
      { class: "announcement-text" },
      href === undefined
        ? message
        : h(
            "a",
            { class: "announcement-link", href, rel: url !== undefined && /^https?:\/\//i.test(url) ? "noopener" : undefined },
            message,
          ),
    ),
    h(
      "button",
      { type: "button", class: "announcement-dismiss", "aria-label": dismiss, hidden: true, "data-announcement-dismiss": true },
      h("span", { "aria-hidden": "true" }, "×"),
    ),
  );
};

export default announcement;
