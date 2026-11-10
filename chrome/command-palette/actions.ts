/*
 * The command palette's actions: a pure list built from the page's headings and Markdown twin.
 *
 * Every action carries a `run` descriptor instead of a function, because the list is rendered on
 * the server as JSON and executed in the browser by `chrome/search/client.ts`. Descriptors keep the
 * module free of the DOM and safe to serialise inside the search dialog.
 */

import type { Page } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";
import { twinUrl } from "../copy-markdown/index.ts";

/** What the theme switch can hold: the visitor's choice, stored under the theme key. */
export type ThemeChoice = "light" | "dark" | "system";

/** What an action does when it runs; data only, so the list survives serialisation. */
export type PaletteRun =
  | { readonly kind: "theme"; readonly choice: ThemeChoice }
  | { readonly kind: "copy"; readonly url: string }
  | { readonly kind: "section"; readonly id: string };

/** One row of the palette: a stable id, the label a reader sees, an optional hint, and what it runs. */
export interface PaletteAction {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly run?: PaletteRun;
}

/** What `paletteActions` reads from the page and site. */
export interface PaletteInput {
  /** The page's language, URL, kind, and headings. */
  readonly page: Pick<Page, "lang" | "url" | "kind" | "headings">;
  /** The site base, added to the page URL only when the URL does not already carry it. */
  readonly base?: string;
}

/** The JSON the server puts in the search dialog: the group's title and its actions. */
export interface PalettePayload {
  readonly label: string;
  readonly actions: readonly PaletteAction[];
}

/** The three theme choices, in the order the palette shows them. */
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

/** The page URL with `base` in front, unless it is already there. */
export function pageUrl(url: string, base = ""): string {
  const root = base.replace(/\/+$/, "");
  if (root === "" || url === root || url.startsWith(`${root}/`)) return url;
  return `${root}${url}`;
}

/**
 * Every action the palette offers for a page, in reading order: the three theme choices, the copy
 * action when the page has a Markdown twin, then one jump per section heading (the page title is not
 * a section). Labels and hints come from the page language's string table.
 */
export function paletteActions(input: PaletteInput): readonly PaletteAction[] {
  const { page } = input;
  const lang = page.lang;
  const actions: PaletteAction[] = [];
  const themeHint = t(lang, "command_switch_theme");

  for (const choice of THEME_CHOICES) {
    actions.push({
      id: `theme-${choice}`,
      label: t(lang, `mode_${choice}`),
      hint: themeHint,
      run: { kind: "theme", choice },
    });
  }

  const url = pageUrl(page.url, input.base);
  const markdown = page.kind === "doc" ? twinUrl(url) : undefined;
  if (markdown !== undefined) {
    actions.push({
      id: "copy-markdown",
      label: t(lang, "copy_page_md"),
      hint: t(lang, "command_copy_markdown"),
      run: { kind: "copy", url: markdown },
    });
  }

  const sectionHint = t(lang, "command_go_to_section");
  for (const heading of page.headings) {
    if (heading.depth === 1) continue;
    actions.push({
      id: `section-${heading.id}`,
      label: heading.text,
      hint: sectionHint,
      run: { kind: "section", id: heading.id },
    });
  }

  return actions;
}

/** A whole-word test for a hint, so a single typed letter does not match every hint. */
function containsWord(text: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

/**
 * Whether an action matches `query`; an empty query matches every action. The label is matched as
 * text and the hint as whole words, so `theme` finds the theme actions while `t` does not match
 * every hint.
 */
export function matchesAction(action: PaletteAction, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  if (action.label.toLowerCase().includes(needle)) return true;
  return action.hint !== undefined && containsWord(action.hint, needle);
}

/** The actions that match `query`, in their original order. */
export function filterActions(actions: readonly PaletteAction[], query: string): readonly PaletteAction[] {
  return actions.filter((action) => matchesAction(action, query));
}

/** The payload the server writes into the dialog for a page. */
export function palettePayload(input: PaletteInput): PalettePayload {
  return { label: t(input.page.lang, "command_actions"), actions: paletteActions(input) };
}
