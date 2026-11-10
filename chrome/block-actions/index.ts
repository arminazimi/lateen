import { h } from "preact";
import type { Chrome } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/**
 * Block actions: one "Edit with your agent" control for every block on the page, each copying a
 * prompt that names the block's exact source span and current text (Lateen differentiator 1).
 *
 * The page carries one inert `<template>`; `client.ts` clones its button into each top-level
 * `[data-src]` block. The button starts `hidden` and only `client.ts` reveals it, so a page without
 * JavaScript reads exactly as before and shows no control that would do nothing. The prompt
 * template comes from the page language, so the Persian and Arabic pages get their own wording.
 */
const blockActions: Chrome = ({ page }) => {
  const lang = page.lang;
  return h(
    "template",
    {
      "data-block-actions": true,
      "data-prompt": t(lang, "edit_prompt"),
      "data-copied": t(lang, "copied"),
      "data-copy-failed": t(lang, "copy_failed"),
    },
    h(
      "button",
      { type: "button", class: "block-action", hidden: true, "data-block-action": true },
      t(lang, "edit_label"),
    ),
  );
};

export default blockActions;
