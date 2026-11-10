import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/**
 * The Markdown twin of a page URL, by the same rule as the engine's `twinUrl` (ADR 0006): a pretty
 * URL (`/guide/install/`) gives `/guide/install/index.md`, the site root gives `/index.md`, and
 * `/404.html` gives `/404.md`. A URL that names another file has no twin.
 *
 * The rule is repeated here so the unit stands alone, as the engine repeats it for its output; it
 * must stay in step with `packages/engine/src/outputs/twins.ts`.
 */
export function twinUrl(url: string): string | undefined {
  const last = url.slice(url.lastIndexOf("/") + 1);
  if (/\.html?$/i.test(last)) return `${url.slice(0, url.length - last.length)}${last.replace(/\.html?$/i, ".md")}`;
  if (last.includes(".")) return undefined;
  return `${url.endsWith("/") ? url : `${url}/`}index.md`;
}

/**
 * Copy page as Markdown: a button that copies the page's Markdown twin, a plain link to the same
 * twin so the page works without JavaScript, and a status region the island announces on. The
 * button starts `hidden` and `client.ts` reveals it once it knows the browser has a clipboard, so a
 * visitor without JavaScript never sees a control that would do nothing. The `m` shortcut belongs to
 * the island too; the button carries it in `aria-keyshortcuts`.
 */
const copyMarkdown: Chrome = ({ page }) => {
  if (page.kind !== "doc") return null;
  const markdown = twinUrl(page.url);
  if (markdown === undefined) return null;

  const lang = page.lang;
  return h(
    "div",
    { class: "copy-markdown", "data-copy-markdown": true },
    h(
      "button",
      {
        type: "button",
        class: "copy-markdown-button",
        hidden: true,
        "data-copy-markdown-button": true,
        "data-markdown": markdown,
        "data-copied": t(lang, "copied"),
        "data-copy-failed": t(lang, "copy_failed"),
        "aria-keyshortcuts": "m",
        title: t(lang, "copy_markdown_hint"),
      },
      t(lang, "copy_page_md"),
      h("kbd", { class: "copy-markdown-key", "aria-hidden": "true" }, "M"),
    ),
    h("a", { class: "copy-markdown-link", href: markdown }, t(lang, "view_markdown")),
    h("p", { class: "copy-markdown-status", role: "status", "data-copy-markdown-status": true }, ""),
  );
};

export default copyMarkdown;
