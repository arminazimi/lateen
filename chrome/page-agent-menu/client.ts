/*
 * Page agent menu island: the menu's copy button runs the same page copy island as
 * `chrome/copy-markdown` (`../copy-markdown/island.ts`), so a click in the menu and a press of `m`
 * fetch the same Markdown twin and report the same loading, success, failure, and unsupported
 * states. The menu has no shortcut of its own: the page has one `m`, owned by the copy-Markdown
 * control, and this button is its pointer path.
 */

import { activate, browserFetch, globals, type CopyButton, type CopyStatus } from "../copy-markdown/island.ts";

export { activate, copy } from "../copy-markdown/island.ts";
export type { Clipboard, CopyButton, CopyEnv, CopyStatus } from "../copy-markdown/island.ts";

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const button = globals.document.querySelector("[data-page-agent-copy]");
  const status = globals.document.querySelector("[data-page-agent-status]");
  if (button !== null && status !== null) {
    activate(button as CopyButton, {
      clipboard: globals.navigator?.clipboard,
      fetchText: browserFetch,
      status: status as CopyStatus,
    });
  }
}
