import { h } from "preact";
import type { Chrome, Page, SiteConfig } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { twinUrl } from "../copy-markdown/index.ts";

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

// The Markdown twin rule is the copy-Markdown unit's, so both page actions name the same file.
export { twinUrl };

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

/** The site's base path without a trailing slash; `""` at a domain root. */
function baseOf(config: SiteConfig): string {
  return config.base.replace(/\/+$/, "");
}

/**
 * A site-relative URL as an absolute one, joined by URL parts rather than by string concatenation.
 * A configured URL may itself carry a path (`https://example.com/docs`), which stays in front of the
 * page URL once: when that path ends in the site's base, the page URL already carries it, so copying
 * it again would give `/docs/docs/…`. Returns `undefined` when the config names no usable site, so
 * the provider that needs an absolute link is left out instead of receiving a relative one.
 */
function absolute(config: SiteConfig, url: string): string | undefined {
  const configured = text(config.url);
  if (configured === undefined) return undefined;

  let site: URL;
  try {
    site = new URL(configured);
  } catch {
    return undefined;
  }

  const path = site.pathname.replace(/\/+$/, "");
  const base = baseOf(config);
  const at = path.length - base.length;
  const pathAlreadyCarriesBase =
    base !== "" && at >= 0 && path.slice(at) === base && (at === 0 || path[at - 1] === "/");
  const prefix = pathAlreadyCarriesBase ? path.slice(0, at) : path;
  return `${site.origin}${prefix}${url}`;
}

/**
 * Fills a provider template's placeholders in one pass, encoding every value once. `{url}` and
 * `{markdown}` are absolute page addresses, `{lang}` the page language, `{source}` its source file,
 * `{title}` its title, and `{version}` the version its front matter declares. A template that uses a
 * value the page cannot supply returns nothing, so the menu omits that provider rather than showing a
 * half-filled link: `{version}` on a page that declares none, or an absolute address when the config
 * names no published site. One pass means a value that contains braces is copied as text and never
 * read as another placeholder.
 */
function expand(config: SiteConfig, page: Page, template: string, markdown: string): string | undefined {
  const values: Readonly<Record<string, string | undefined>> = {
    markdown: absolute(config, markdown),
    url: absolute(config, page.url),
    title: page.title,
    lang: text(page.lang),
    source: text(page.source.file),
    version: text(page.frontMatter.version),
  };

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined && template.includes(`{${name}}`)) return undefined;
  }

  return template.replace(/\{([a-z]+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? encodeURIComponent(values[name] ?? "") : placeholder,
  );
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
 * control that would do nothing. It runs the same island as `chrome/copy-markdown`, so both page
 * actions copy the same twin and announce the same loading, success, and failure; the page keeps a
 * single `m` shortcut, owned by that control. The provider list comes from
 * `theme.options.pageAgent.providers`.
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
    h("summary", { class: "page-agent-menu-summary" }, h("span", { class: "page-agent-menu-summary-text" }, t(lang, "page_agent_summary")), chevron()),
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
      h("a", { class: "page-agent-menu-view", href: markdown }, t(lang, "view_markdown")),
      providers.length === 0 ? null : h("p", { class: "page-agent-menu-heading" }, t(lang, "page_agent_open_in")),
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
