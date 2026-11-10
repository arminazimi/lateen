import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Chrome, SiteConfig } from "@velella/mizzen/contracts";
import languageSwitcher from "../language-switcher/index.ts";
import sectionTabs from "../section-tabs/index.ts";
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

/** Repository link with a generic code icon; absent when the site sets no `repository`. */
function repositoryLink(config: SiteConfig) {
  const url = config.repository?.url;
  if (!url) return null;
  return h(
    "a",
    { class: "header-repo", href: url, rel: "noopener", "aria-label": "Repository" },
    h(
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
  return h(
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
        repositoryLink(config),
        h(
          "button",
          { type: "button", class: "header-menu", "aria-label": "Menu", "aria-expanded": "false", hidden: true, "data-drawer-open": true },
          h("span", { "aria-hidden": "true" }, "☰"),
        ),
      ),
    ),
  );
};

export default header;
