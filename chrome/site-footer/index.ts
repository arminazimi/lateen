import { h } from "preact";
import type { Chrome, SiteConfig } from "@velella/mizzen/contracts";

const LABEL = "Footer links";

type FooterLink = { readonly title: string; readonly url: string };

/** The footer block from the theme options (`footer.copyright`, `footer.license`, `footer.links`), or none. */
type Footer = {
  readonly copyright?: unknown;
  readonly license?: unknown;
  readonly links?: unknown;
};

/** The footer options as the config wrote them, or undefined when the site sets none. */
function footerOf(config: SiteConfig): Footer | undefined {
  const value = config.theme.options?.footer;
  return typeof value === "object" && value !== null ? (value as Footer) : undefined;
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

/** The configured links that have a title and a safe URL, in config order. */
function linksOf(footer: Footer): readonly FooterLink[] {
  if (!Array.isArray(footer.links)) return [];
  const links: FooterLink[] = [];
  for (const entry of footer.links) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, url } = entry as { title?: unknown; url?: unknown };
    const label = text(title);
    const href = text(url);
    if (label !== undefined && href !== undefined && isSafeUrl(href)) links.push({ title: label, url: href });
  }
  return links;
}

/** Footer line: copyright, license, and optional links from the theme options; renders nothing when the config sets none of them. */
const siteFooter: Chrome = ({ site }) => {
  const { config } = site;
  const footer = footerOf(config);
  if (footer === undefined) return null;

  const copyright = text(footer.copyright);
  const license = text(footer.license);
  const links = linksOf(footer);
  if (copyright === undefined && license === undefined && links.length === 0) return null;

  return h(
    "div",
    { class: "site-footer" },
    h(
      "div",
      { class: "site-footer-inner" },
      copyright === undefined ? null : h("p", { class: "site-footer-copyright" }, copyright),
      license === undefined ? null : h("p", { class: "site-footer-license" }, license),
      links.length === 0
        ? null
        : h(
            "nav",
            { class: "site-footer-links", "aria-label": LABEL },
            h(
              "ul",
              null,
              ...links.map((link) =>
                h(
                  "li",
                  null,
                  h(
                    "a",
                    { href: hrefOf(config.base, link.url), rel: /^https?:\/\//i.test(link.url) ? "noopener" : undefined },
                    link.title,
                  ),
                ),
              ),
            ),
          ),
    ),
  );
};

export default siteFooter;
