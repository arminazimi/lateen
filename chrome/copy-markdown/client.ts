/*
 * Copy Markdown island: fetches the page's Markdown twin and writes it to the clipboard, from the
 * button or the `m` key. The behavior itself lives in `island.ts`, shared with the page agent menu,
 * so both page actions reveal, load, succeed, fail, and fall back the same way. The button stays
 * hidden unless the browser has both a clipboard and `fetch`, so a visitor without JavaScript (or
 * without the APIs) never sees a control that would do nothing. Nothing is requested until the
 * reader asks for a copy.
 */

import { activate, browserFetch, globals, type CopyButton, type CopyStatus } from "./island.ts";

export { activate, copy, isCopyShortcut, isTypingTarget } from "./island.ts";
export type {
  ActivateEnv,
  Clipboard,
  CopyButton,
  CopyEnv,
  CopyStatus,
  ShortcutEvent,
  ShortcutHost,
} from "./island.ts";

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const document = globals.document;
  const button = document.querySelector("[data-copy-markdown-button]");
  const status = document.querySelector("[data-copy-markdown-status]");
  if (button !== null && status !== null) {
    activate(button as CopyButton, {
      clipboard: globals.navigator?.clipboard,
      fetchText: browserFetch,
      status: status as CopyStatus,
      keys: document,
    });
  }
}
