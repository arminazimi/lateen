import type { Chrome } from "@velella/mizzen/contracts";

/**
 * Renders nothing: the island adds the copy button to every code block. The engine loads a
 * component's island only when the page's Markdown used that component, and a layout draws most
 * code blocks itself, so the behaviour lives in the always-loaded chrome islands.
 */
const codeCopy: Chrome = () => null;

export default codeCopy;
