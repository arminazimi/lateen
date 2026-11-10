import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";
import type { Chrome, SiteConfig } from "@velella/mizzen/contracts";
import languageSwitcher from "../language-switcher/index.ts";
import search from "../search/index.ts";
import sectionTabs from "../section-tabs/index.ts";
import themeToggle from "../theme-toggle/index.ts";
import versionSwitcher from "../version-switcher/index.ts";

type Logo = { readonly light?: string; readonly dark?: string };

/** The logo paths from the theme options (`logo.light`, `logo.dark`), or none. */
function logoOf(config: SiteConfig): Logo | undefined {
  const value = config.theme.options?.logo;
  return typeof value === "object" && value !== null ? (value as Logo) : undefined;
}

/** A logo path is relative to the site root; the site's `base` comes first. */
function withBase(base: string, path: string): string {
  return path.startsWith("/") ? `${base}${path}` : path;
}

/** Logo and site title, linking to the home page. */
function home(config: SiteConfig) {
  const logo = logoOf(config);
  const light = logo?.light ? withBase(config.base, logo.light) : undefined;
  const dark = logo?.dark ? withBase(config.base, logo.dark) : undefined;
  const split = light !== undefined && dark !== undefined;

  return h(
    "a",
    { class: split ? "header-home header-home--split" : "header-home", href: `${config.base}/` },
    light ? h("img", { class: "header-logo header-logo-light", src: light, alt: "", width: 32, height: 32 }) : null,
    dark ? h("img", { class: "header-logo header-logo-dark", src: dark, alt: "", width: 32, height: 32 }) : null,
    h("span", { class: "header-title" }, config.title),
  );
}

/** The GitHub mark, drawn for a repository on github.com. */
const GITHUB_MARK =
  "M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z";

/** True when the repository is hosted on github.com. */
function onGitHub(url: string): boolean {
  try {
    return new URL(url).hostname === "github.com";
  } catch {
    return false;
  }
}

/** Repository link: the GitHub mark for a github.com repository, else a generic code icon; absent when the site sets no `repository`. */
function repositoryLink(config: SiteConfig) {
  const url = config.repository?.url;
  if (!url) return null;
  const github = onGitHub(url);
  return h(
    "a",
    { class: "header-repo", href: url, rel: "noopener", "aria-label": github ? "GitHub repository" : "Repository" },
    github
      ? h("svg", { class: "header-repo-mark", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, h("path", { d: GITHUB_MARK }))
      : h(
          "svg",
          { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
          h("path", { d: "M8 6l-5 6 5 6M16 6l5 6-5 6" }),
        ),
  );
}

/** Header: logo and title, the section tabs, the version switcher, search and menu buttons (enhanced by JavaScript), and the repository link. */
const header: Chrome = (props) => {
  const { site } = props;
  const { config } = site;
  const bar = h(
    "header",
    { class: "header" },
    h(
      "div",
      { class: "header-inner" },
      home(config),
      h("div", { class: "header-tabs", "data-slot": "section-tabs" }, sectionTabs(props) as ComponentChildren),
      h(
        "div",
        { class: "header-actions" },
        versionSwitcher(props) as ComponentChildren,
        h(
          "button",
          { type: "button", class: "header-search", "aria-label": "Search", hidden: true, "data-search-open": true },
          h(
            "svg",
            { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
            h("circle", { cx: "11", cy: "11", r: "7" }),
            h("path", { d: "M20 20l-4-4" }),
          ),
        ),
        languageSwitcher(props) as ComponentChildren,
        themeToggle(props) as ComponentChildren,
        repositoryLink(config),
        h(
          "button",
          { type: "button", class: "header-menu", "aria-label": "Menu", "aria-expanded": "false", hidden: true, "data-drawer-open": true },
          h("span", { "aria-hidden": "true" }, "☰"),
        ),
      ),
    ),
  );
  // The search dialog sits beside the bar, not inside it: it covers the page when open.
  return h(Fragment, null, bar, search(props) as ComponentChildren);
};

export default header;
