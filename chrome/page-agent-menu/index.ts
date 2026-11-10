import { h } from "preact";
import type { Chrome, Page, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/*
 * Labels without a key in the string table (i18n/*.json) are English, the same as the other chrome
 * parts' labels. The strings that do have a key are read through `t()`.
 */
const SUMMARY = "Use with an agent";
const VIEW = "View Markdown";
const OPEN_IN = "Open in";

/** A provider the reader can open the page in: a title and a URL template. */
interface Provider {
  readonly title: string;
  readonly url: string;
}

/** The `theme.options.pageAgent` block as the config wrote it. */
interface PageAgentOptions {
  readonly providers?: unknown;
}

/**
 * The three agents the menu offers when the site sets no list. Each URL takes the page's Markdown
 * twin through `{markdown}`, so an agent reads the same text as the copy button.
 */
const DEFAULT_PROVIDERS: readonly Provider[] = [
  { title: "Claude", url: "https://claude.ai/new?q=Read+{markdown}" },
  { title: "ChatGPT", url: "https://chatgpt.com?q=Read+{markdown}" },
  { title: "Cursor", url: "https://cursor.com/link/prompt?text=Read+{markdown}" },
];

/** Only these schemes are linked; a config value cannot inject `javascript:` or `data:`. */
const SAFE_SCHEME = /^(?:https?|cursor|claude|codex|vscode):/i;

/**
 * The Markdown twin of a page URL, by the same rule as the engine's `twinUrl` (ADR 0006): a pretty
 * URL (`/guide/install/`) gives `/guide/install/index.md`, the site root gives `/index.md`, and
 * `/404.html` gives `/404.md`. A URL that names another file has no twin.
 */
export function twinUrl(url: string): string | undefined {
  const last = url.slice(url.lastIndexOf("/") + 1);
  if (/\.html?$/i.test(last)) return `${url.slice(0, url.length - last.length)}${last.replace(/\.html?$/i, ".md")}`;
  if (last.includes(".")) return undefined;
  return `${url.endsWith("/") ? url : `${url}/`}index.md`;
}

/** A non-empty string from the config, trimmed; anything else is not shown. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The configured providers, or the three defaults when the site sets none. */
function providersOf(config: SiteConfig): readonly Provider[] {
  const options = config.theme.options?.pageAgent;
  const value = typeof options === "object" && options !== null ? (options as PageAgentOptions).providers : undefined;
  if (value === undefined) return DEFAULT_PROVIDERS;
  if (!Array.isArray(value)) return DEFAULT_PROVIDERS;
  const providers: Provider[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, url } = entry as { title?: unknown; url?: unknown };
    const name = text(title);
    const href = text(url);
    if (name !== undefined && href !== undefined) providers.push({ title: name, url: href });
  }
  return providers;
}

/** A site-relative URL as an absolute one, when the config names the published site. */
function absolute(config: SiteConfig, url: string): string {
  if (config.url === undefined) return url;
  return `${config.url.replace(/\/+$/, "")}${url}`;
}

/**
 * Fills `{markdown}`, `{url}`, and `{title}` in a provider template, encoding each value. A template
 * that needs the page's address returns nothing when the config names no published site: a relative
 * path would give an agent a link it cannot open.
 */
function expand(config: SiteConfig, page: Page, template: string, markdown: string): string | undefined {
  if (config.url === undefined && /\{(?:markdown|url)\}/.test(template)) return undefined;
  const values: Readonly<Record<string, string>> = {
    markdown: absolute(config, markdown),
    url: absolute(config, page.url),
    title: page.title,
  };
  return template.replace(/\{(markdown|url|title)\}/g, (_placeholder, name: string) => encodeURIComponent(values[name] ?? ""));
}

/** The chevron that turns over when the menu opens; decorative, so it is hidden from assistive tech. */
function chevron() {
  return h(
    "svg",
    { class: "page-agent-menu-chevron", viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" },
    h("path", { d: "M4 6l4 4 4-4" }),
  );
}

/**
 * The page agent menu: a disclosure with a copy button for the page's Markdown, a plain link to the
 * same Markdown (so it works without JavaScript), and links that open the page in an agent. The copy
 * button starts `hidden` and `client.ts` reveals it, so a visitor without JavaScript never sees a
 * control that would do nothing. The provider list comes from `theme.options.pageAgent.providers`.
 */
const pageAgentMenu: Chrome = ({ site, page }) => {
  if (page.kind !== "doc") return null;
  const markdown = twinUrl(page.url);
  if (markdown === undefined) return null;

  const lang = page.lang;
  const providers: Array<{ title: string; href: string }> = [];
  for (const provider of providersOf(site.config)) {
    const href = expand(site.config, page, provider.url, markdown);
    if (href !== undefined && SAFE_SCHEME.test(href)) providers.push({ title: provider.title, href });
  }

  return h(
    "details",
    { class: "page-agent-menu", "data-page-agent-menu": true },
    h("summary", { class: "page-agent-menu-summary" }, h("span", { class: "page-agent-menu-summary-text" }, SUMMARY), chevron()),
    h(
      "div",
      { class: "page-agent-menu-panel" },
      h(
        "button",
        {
          type: "button",
          class: "page-agent-menu-copy",
          hidden: true,
          "data-page-agent-copy": true,
          "data-markdown": markdown,
          "data-copied": t(lang, "copied"),
          "data-copy-failed": t(lang, "copy_failed"),
        },
        t(lang, "copy_page_md"),
      ),
      h("a", { class: "page-agent-menu-view", href: markdown }, VIEW),
      providers.length === 0 ? null : h("p", { class: "page-agent-menu-heading" }, OPEN_IN),
      providers.length === 0
        ? null
        : h(
            "ul",
            { class: "page-agent-menu-providers" },
            ...providers.map((provider) =>
              h(
                "li",
                null,
                h(
                  "a",
                  { class: "page-agent-menu-provider", href: provider.href, target: "_blank", rel: "noopener" },
                  provider.title,
                ),
              ),
            ),
          ),
      h("p", { class: "page-agent-menu-status", role: "status", "data-page-agent-status": true }, ""),
    ),
  );
};

export default pageAgentMenu;
