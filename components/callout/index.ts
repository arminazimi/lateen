import { h } from "preact";
import type { ComponentProps, Page } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** Class of the title paragraph, which also names the callout for assistive technology. */
export const TITLE_CLASS = "callout-title";

/** The five kinds GitHub alerts and `:::callout{type=…}` directives use. */
export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

export type CalloutProps = {
  /** One of the five kinds; anything else (or nothing) is a note. */
  type?: string;
  /** Replaces the kind's default title. */
  title?: string;
};

const KINDS: readonly CalloutKind[] = ["note", "tip", "important", "warning", "caution"];

/** Older content says `danger` for what is now `caution`. */
const ALIASES: ReadonlyMap<string, CalloutKind> = new Map([["danger", "caution"]]);

/** The i18n key with each kind's default title, used when the author gives none. */
const TITLE_KEYS: Readonly<Record<CalloutKind, string>> = {
  note: "callout_note",
  tip: "callout_tip",
  important: "callout_important",
  warning: "callout_warning",
  caution: "callout_caution",
};

/** Stroke paths for each kind's icon, drawn on a 16×16 grid. Symmetric, so they need no flip under RTL. */
const ICONS: Readonly<Record<CalloutKind, readonly string[]>> = {
  note: ["M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z", "M8 7.25v3.5", "M8 5.25v.01"],
  tip: ["M6 12.5h4", "M6.5 14.5h3", "M8 1.5a4.5 4.5 0 0 0-2.5 8.25v1.25h5V9.75A4.5 4.5 0 0 0 8 1.5Z"],
  important: ["M2 2h12v9H8.5L5 13.5V11H2Z", "M8 4.5v3", "M8 9.25v.01"],
  warning: ["M8 1.8 14.8 13.5H1.2Z", "M8 6v3.25", "M8 11.2v.01"],
  caution: ["M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2Z", "M8 4.5v4", "M8 11v.01"],
};

/** The kind a `type` value names. Unknown, missing, or non-string values are a note. */
export function calloutKind(type: unknown): CalloutKind {
  if (typeof type !== "string") return "note";
  const name = type.trim().toLowerCase();
  const alias = ALIASES.get(name);
  if (alias !== undefined) return alias;
  return (KINDS as readonly string[]).includes(name) ? (name as CalloutKind) : "note";
}

/**
 * Title ids already taken, keyed by the Page and the page HTML they were counted against, so one
 * page's ids cannot leak into another page or build.
 */
const pageTitleIds = new WeakMap<Page, { html: string; ids: Set<string> }>();

/**
 * An id for the title that names its callout: `callout-<kind>-title`, then `<base>-2`, `<base>-3`, in
 * page order, so repeated callouts of one kind stay distinct.
 */
function titleId(page: Page, kind: CalloutKind): string {
  let state = pageTitleIds.get(page);
  if (state === undefined || state.html !== page.html) {
    state = { html: page.html, ids: new Set() };
    pageTitleIds.set(page, state);
  }
  const base = `callout-${kind}-title`;
  let id = base;
  for (let n = 2; state.ids.has(id); n += 1) id = `${base}-${n}`;
  state.ids.add(id);
  return id;
}

function icon(kind: CalloutKind) {
  return h(
    "svg",
    {
      class: "callout-icon",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ICONS[kind].map((d) => h("path", { d })),
  );
}

/**
 * A short message set apart from the text. `role="note"` keeps it readable as a note without announcing
 * it as an alert, and `aria-labelledby` gives every note the same visible title a reader sees, so
 * repeated notes stay distinguishable by role. The body arrives already rendered to HTML. The default
 * title is read in the page language; a `title` from the author replaces it as written.
 */
export default function callout({ props, html, page }: ComponentProps<CalloutProps>) {
  const kind = calloutKind(props.type);
  const custom = typeof props.title === "string" ? props.title.trim() : "";
  const title = custom === "" ? t(page.lang, TITLE_KEYS[kind]) : custom;
  const id = titleId(page, kind);

  return h(
    "div",
    { class: `callout callout-${kind}`, role: "note", "aria-labelledby": id },
    icon(kind),
    h(
      "div",
      { class: "callout-content" },
      h("p", { class: TITLE_CLASS, id }, title),
      h("div", { class: "callout-body", dangerouslySetInnerHTML: { __html: html } }),
    ),
  );
}
