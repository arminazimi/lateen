import { h } from "preact";
import type { Chrome, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The id a bar without one is stored under; two bars need two ids to be dismissed separately. */
export const DEFAULT_ID = "announcement";

/** The tones a bar can carry. `info` is the default accent bar; the others say how serious it is. */
export const TONES = ["info", "warning", "danger"] as const;

export type AnnouncementTone = (typeof TONES)[number];

/** The i18n key with each non-default tone's visible label, so tone is never colour alone. */
export const TONE_KEYS: Readonly<Record<Exclude<AnnouncementTone, "info">, string>> = {
  danger: "announcement_tone_danger",
  warning: "announcement_tone_warning",
};

/**
 * Stroke paths for a non-default tone's icon, drawn on a 16×16 grid. The shapes are direction-neutral
 * and need no RTL flip.
 */
const ICONS: Readonly<Record<Exclude<AnnouncementTone, "info">, readonly string[]>> = {
  danger: ["M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2Z", "M8 4.5v4", "M8 11v.01"],
  warning: ["M8 1.8 14.8 13.5H1.2Z", "M8 6v3.25", "M8 11.2v.01"],
};

/** The `announcement` block from `theme.options`, as the config wrote it. */
type Announcement = {
  readonly id?: unknown;
  readonly text?: unknown;
  readonly href?: unknown;
  readonly tone?: unknown;
};

/** The announcement options, or undefined when the site sets no block. */
function announcementOf(config: SiteConfig): Announcement | undefined {
  const value = config.theme.options?.announcement;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Announcement) : undefined;
}

/** The tone a value names, matched without case or surrounding spaces; anything else is `info`. */
export function toneOf(value: unknown): AnnouncementTone {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (TONES as readonly string[]).includes(name) ? (name as AnnouncementTone) : "info";
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

/** A non-default tone's inline icon. It is decorative: the label beside it carries the meaning. */
function toneIcon(tone: Exclude<AnnouncementTone, "info">) {
  return h(
    "svg",
    {
      class: "announcement-icon",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ICONS[tone].map((d) => h("path", { d })),
  );
}

/**
 * The dismissible announcement bar, from `theme.options.announcement`:
 *
 * ```yaml
 * theme:
 *   options:
 *     announcement:
 *       id: v0-4
 *       text: Mizzen 0.4 is out.
 *       href: /changelog/
 *       tone: warning
 * ```
 *
 * The bar renders nothing without text. Its dismiss button starts hidden, so a visitor without JavaScript sees the
 * text but no control that would do nothing; `client.ts` reveals it and remembers a dismissal per `id`. A tone other
 * than `info` adds a visible label and icon and names the region with the tone, so a warning or an outage notice
 * does not read like a release note.
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
  const tone = toneOf(options.tone);
  const label = t(config.lang, "announcement");
  const toneLabel = tone === "info" ? undefined : t(config.lang, TONE_KEYS[tone]);
  const dismiss = t(config.lang, "announcement_dismiss");

  return h(
    "div",
    {
      class: `announcement announcement-${tone}`,
      role: "region",
      "aria-label": toneLabel === undefined ? label : `${toneLabel}: ${label}`,
      "data-announcement": true,
      "data-announcement-id": id,
      "data-announcement-tone": tone,
    },
    tone === "info" ? null : toneIcon(tone),
    toneLabel === undefined ? null : h("strong", { class: "announcement-tone" }, toneLabel),
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
