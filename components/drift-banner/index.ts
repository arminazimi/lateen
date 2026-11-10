import { h } from "preact";
import type { Component, Site, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Class on the banner. `style.css` styles it. */
export const CLASS = "drift-banner";

/** Class on the optional link to the drift report. */
export const DETAILS_CLASS = "drift-banner-details";

/** The i18n key with the singular message; the plural key is {@link PLURAL_KEY}. */
export const SINGULAR_KEY = "drift_finding";

/** The i18n key with the message for every count other than one. */
export const PLURAL_KEY = "drift_findings";

/** The i18n key with the text of the details link. */
export const DETAILS_KEY = "drift_details";

/** The `theme.options.drift` block as the config wrote it. */
interface DriftOptions {
  /** Where the report lives: a path on this site or an `https` link. */
  readonly detailsUrl?: unknown;
}

/** A path on this site (not protocol-relative `//host`) or an https link. Anything else is not a link. */
const SAFE_URL = /^(?:\/(?![/\\])|https:\/\/)[^\s"<>]*$/;

/** True for a plain object, never an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The URL-to-findings map inside `site.data.drift`. The engine's future `drift.json` output may write either
 * `{ "/page/": [ … ] }` or `{ pages: { "/page/": [ … ] } }`; both are accepted, and the nested form wins when
 * its `pages` member is an object.
 */
export function pagesOf(drift: unknown): Record<string, unknown> | undefined {
  if (!isRecord(drift)) return undefined;
  const nested = drift.pages;
  return isRecord(nested) ? nested : drift;
}

/** One page's findings, or undefined when the data has no array for its URL. */
export function findingsOf(site: Site, url: string): readonly unknown[] | undefined {
  const pages = pagesOf(site.data.drift);
  if (pages === undefined || !Object.hasOwn(pages, url)) return undefined;
  const value = pages[url];
  return Array.isArray(value) ? value : undefined;
}

/** The details link from `theme.options.drift.detailsUrl`, safe and with `base` in front of a site path. */
export function detailsHrefOf(config: SiteConfig): string | undefined {
  const options = config.theme.options?.drift;
  if (!isRecord(options)) return undefined;
  const value = (options as DriftOptions).detailsUrl;
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!SAFE_URL.test(url)) return undefined;
  return url.startsWith("/") ? `${config.base}${url}` : url;
}

/** The banner's message in the page's language: singular for one finding, plural otherwise. */
export function messageOf(lang: string, n: number): string {
  return t(lang, n === 1 ? SINGULAR_KEY : PLURAL_KEY, { n });
}

/**
 * A banner that warns a page has drifted from the code it documents. It reads the page's findings from
 * `site.data.drift`, keyed by page URL, and renders nothing when the page has none. The number is localised
 * and the optional details link comes from `theme.options.drift.detailsUrl`. The doc layout places it above
 * the page content, so an author does not write a directive; until the engine's `drift.json` output lands,
 * `site.data.drift` is absent and the banner stays hidden.
 */
const driftBanner: Component = ({ site, page }) => {
  const findings = findingsOf(site, page.url);
  if (findings === undefined || findings.length === 0) return null;

  const href = detailsHrefOf(site.config);

  return h(
    "aside",
    { class: CLASS, role: "note" },
    h("span", { class: `${CLASS}-message` }, messageOf(page.lang, findings.length)),
    href === undefined
      ? null
      : h("a", { class: DETAILS_CLASS, href }, t(page.lang, DETAILS_KEY)),
  );
};

export default driftBanner;
