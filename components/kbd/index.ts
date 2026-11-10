import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:kbd[Ctrl+K]`. */
export const directive = "kbd";

/** Class name on the key element. `style.css` styles it, and the bare `<kbd>` element the same way. */
export const CLASS_NAME = "kbd";

/**
 * A keyboard key or key combination. The body arrives already rendered to HTML and is shown as written.
 * Platform switching (⌘ or Ctrl per platform) needs a client script, so it is not done here.
 */
const kbd: Component = ({ html }) => h("kbd", { class: CLASS_NAME, dangerouslySetInnerHTML: { __html: html } });

export default kbd;
