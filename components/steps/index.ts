import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:::steps`. */
export const directive = "steps";

/**
 * Numbered steps. The directive's body (an ordered list) is wrapped in `.steps`; `style.css` draws the
 * number badges, the line between them, and the numerals for the page's language.
 */
const steps: Component = ({ html }) => h("div", { class: "steps", dangerouslySetInnerHTML: { __html: html } });

export default steps;
