import type { Chrome } from "@velella/mizzen/contracts";

/**
 * Renders nothing: the island closes an open trust panel on Escape and returns focus to its chip.
 * A layout draws the trust panel itself, so the component's island would never be loaded; chrome
 * islands load on every page.
 */
const trustPanelKeys: Chrome = () => null;

export default trustPanelKeys;
