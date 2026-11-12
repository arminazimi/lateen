import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:::tabs`. */
export const directive = "tabs";

/** Class on the outer element; `style.css` styles it, and `client.ts` finds it by `data-tabs-group`. */
export const TABS_CLASS = "tabs";

/** Class on each panel's title. Visible without JavaScript; the island hides it, since the tab shows it. */
export const TITLE_CLASS = "tabs-title";

/** Class on the element that holds one section's content. */
export const BODY_CLASS = "tabs-body";

/** Class on the empty span that carries an authored heading fragment into the generated panel title. */
export const FRAGMENT_CLASS = "tabs-fragment";

/** Id prefix used when the directive gives none. */
export const DEFAULT_ID = "tabs";

export type TabsProps = {
  /** Prefix for this group's element ids. The directive's `group` attribute is the same key the engine's tab markup uses. */
  group?: string;
  /** Fallback id prefix when the directive has no `group`. */
  id?: string;
};

/** One section of the directive body: its heading label and the content under it. */
export interface TabSection {
  readonly label: string;
  readonly html: string;
  /**
   * The fragment the heading authored — a trailing `{#id}` or the heading's own `id` attribute —
   * kept addressable through the generated panel title. Absent when the heading authored nothing
   * a link could point at.
   */
  readonly anchor?: string;
}

/** A heading that starts a section: `## macOS`, `### Windows`, and any attributes the Markdown stage adds. */
const HEADING = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/** Tags in a heading, so its label becomes plain text rather than markup. */
const TAG = /<[^>]*>/g;

/** A named or numeric character reference in a heading. */
const ENTITY = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi;

/** The open tag of a component the Markdown stage left unresolved; quoted values may contain `>`. */
const SL_COMPONENT = /<sl-component\b((?:"[^"]*"|'[^']*'|[^"'>])*)>/gi;

/** One attribute of an open tag, as the engine's render host reads them. */
const TAG_ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** A `data-src` value: file, start line, start column, end line, end column. */
const SRC_SPAN = /^(.*):(\d+):(\d+)-(\d+):(\d+)$/;

/** An `id` attribute in a heading's open tag. */
const HEADING_ID = /\s+id="([^"]*)"/i;

/** A `data-src` attribute in a heading's open tag, the section's place in the source. */
const HEADING_SRC = /\s+data-src="([^"]*)"/i;

/** A trailing `{#id}` on a heading's text — the authored fragment the top level's slug stage honors. */
const CUSTOM_ANCHOR = /^(.*\S)?\s*\{#([^\s{}]+)\}$/;

/** A fragment an id can carry: a letter or digit, then letters, digits, `_`, and `-`. */
const ANCHOR_OK = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: "\u00a0", quot: '"' };

function decodeEntity(match: string, hex: string | undefined, decimal: string | undefined, named: string | undefined): string {
  if (named !== undefined) return ENTITIES[named.toLowerCase()] ?? match;
  const code = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? "", 10);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** A heading's inner HTML as plain text: tags removed and character references decoded. */
export function labelOf(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(TAG, "");
  } while (text !== previous);

  return text
    .replace(ENTITY, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The label and authored fragment of one heading: a trailing `{#id}` names the fragment and leaves
 * the text before it as the label; else an `id` attribute on the heading names the fragment and its
 * text is the label whole. A fragment nothing valid could name — an empty label, an id with spaces
 * or markup in it — keeps the heading's text exactly as written, so a malformed section still reads.
 */
function titled(tag: string, rawLabel: string): { label: string; anchor?: string } {
  const custom = CUSTOM_ANCHOR.exec(rawLabel);
  if (custom !== null) {
    const label = (custom[1] ?? "").trim();
    const id = (custom[2] ?? "").trim();
    if (label !== "" && ANCHOR_OK.test(id)) return { label, anchor: id };
    return { label: rawLabel };
  }
  const attr = HEADING_ID.exec(tag);
  const id = attr !== null ? (attr[1] ?? "").replace(ENTITY, decodeEntity).trim() : "";
  if (id !== "" && ANCHOR_OK.test(id)) return { label: rawLabel, anchor: id };
  return { label: rawLabel };
}

/**
 * Splits the directive body into one section per `##` or `###` heading. A section runs from its heading
 * to the next one; text before the first heading joins the first section so it still reads. A body with
 * no headings gives no sections, and the component keeps it as it is.
 */
export function sections(html: string): TabSection[] {
  const headings = [...html.matchAll(HEADING)];
  const first = headings[0];
  if (first === undefined) return [];

  const leading = html.slice(0, first.index ?? 0).trim();
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = next?.index ?? html.length;
    const content = html.slice(start, end).trim();
    const withLeading = index === 0 && leading !== "" ? `${leading}\n${content}`.trim() : content;
    const { label, anchor } = titled(heading[0] ?? "", labelOf(heading[2] ?? ""));
    return anchor === undefined ? { label, html: withLeading } : { label, html: withLeading, anchor };
  });
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: string | undefined): string {
  const clean = (raw ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean || DEFAULT_ID;
}

/** The directive's group key, from `group` first and `id` second. */
export function groupKey(props: TabsProps): string {
  const group = typeof props.group === "string" ? props.group.trim() : "";
  return idBase(group || (typeof props.id === "string" ? props.id : undefined));
}

/** Where a block starts in the source, in lines and columns from 1. */
export interface SourcePoint {
  readonly line: number;
  readonly column: number;
}

/** One `:::tabs` directive the Markdown stage left in a page's html: its group key and source start. */
export interface DirectiveRef {
  readonly base: string;
  readonly start: SourcePoint | undefined;
}

/** Attribute values from the Markdown stage can carry character references; decode them like the render host does. */
function decodeAttr(value: string): string {
  return value.replace(ENTITY, decodeEntity);
}

/** The attributes of one open tag, names lowercased and values decoded. */
function tagAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(TAG_ATTR)) {
    const name = (match[1] ?? "").toLowerCase();
    if (name !== "") attrs[name] = decodeAttr(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** The start of a `data-src` span; anything malformed has none. */
function startPoint(dataSrc: string | undefined): SourcePoint | undefined {
  const span = dataSrc === undefined ? null : SRC_SPAN.exec(dataSrc);
  if (span === null) return undefined;
  return { line: Number(span[2]), column: Number(span[3]) };
}

/** The group key one unresolved tabs directive will render under, reading its props the way the render host does. */
function refBase(attrs: Record<string, string>): string {
  const raw = attrs["data-props"];
  if (raw === undefined || raw === "") return groupKey({});
  try {
    const value: unknown = JSON.parse(raw);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return groupKey(value as TabsProps);
  } catch {
    // Props the engine itself cannot parse render as an empty object; count them the same way.
  }
  return groupKey({});
}

/**
 * Every `:::tabs` directive in a page's unresolved html, in document order, each with the key its
 * props give it and the source position the Markdown stage recorded. Html with no directives — a
 * hand-written fragment or a unit test's page — yields none.
 */
export function tabsDirectives(pageHtml: string): DirectiveRef[] {
  const refs: DirectiveRef[] = [];
  for (const tag of pageHtml.matchAll(SL_COMPONENT)) {
    const attrs = tagAttrs(tag[1] ?? "");
    if (attrs.name !== "tabs") continue;
    refs.push({ base: refBase(attrs), start: startPoint(attrs["data-src"]) });
  }
  return refs;
}

/** The source start of the body's first section heading — the heading that begins this group. */
export function bodyStart(html: string): SourcePoint | undefined {
  for (const heading of html.matchAll(HEADING)) {
    const src = HEADING_SRC.exec(heading[0] ?? "");
    if (src !== null) return startPoint(src[1]);
    return undefined;
  }
  return undefined;
}

/**
 * A unique key for every group base occurrence on the page, in document order. The first group
 * under a base keeps its published key; each repeat gets `-2`, `-3`, … — the first free suffix,
 * skipping keys another group on the page already claimed as its own base.
 */
export function disambiguate(bases: readonly string[]): string[] {
  const reserved = new Set(bases);
  const taken = new Set<string>();
  const seen = new Map<string, number>();
  return bases.map((base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 1) {
      taken.add(base);
      return base;
    }
    let n = 2;
    while (reserved.has(`${base}-${n}`) || taken.has(`${base}-${n}`)) n++;
    const key = `${base}-${n}`;
    taken.add(key);
    return key;
  });
}

/** True when `a` sits at or before `b` in the source. */
function atOrBefore(a: SourcePoint, b: SourcePoint): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

/**
 * The key this rendered group gets. A page whose html carries the Markdown stage's directives is
 * disambiguated per page: this body's first heading locates the group among them — the last one
 * that starts at or before it and carries the same base — so repeated default, explicit, Unicode,
 * and slug-equivalent groups each get a unique key while the first ordinary group keeps its
 * published one. Without directives or source positions the key passes through unchanged.
 */
export function uniqueKey(pageHtml: string, key: string, body: string): string {
  const refs = tabsDirectives(pageHtml);
  if (refs.length === 0) return key;
  const start = bodyStart(body);
  if (start === undefined) return key;
  let mine = -1;
  refs.forEach((ref, index) => {
    if (ref.base !== key || ref.start === undefined) return;
    if (atOrBefore(ref.start, start)) mine = index;
  });
  if (mine === -1) return key;
  return disambiguate(refs.map((ref) => ref.base))[mine] ?? key;
}

/**
 * Content tabs: each `##` or `###` heading in the body names a tab and starts its section. Without
 * JavaScript the tab list is hidden and every section shows stacked under its title; the island
 * (`client.ts`) reveals the list, shows one section at a time, and shares a choice by label with every
 * other group on the page and with later pages.
 *
 * The markup contract is the same one the engine's `:::tabs`/`::tab` markup uses: a `role="tablist"`
 * of `role="tab"` buttons and one `role="tabpanel"` per tab, so one stylesheet and one island serve both.
 *
 * Ids stay unique per page: a group repeats another's key only when the author gave two groups the same
 * one or none at all, and `uniqueKey` then moves the repeats to suffixed keys while the first group
 * keeps the ids it published. An authored heading fragment rides along on the section's title, so links
 * to it keep resolving after the island and through hash navigation.
 */
export default function tabs({ props, page, html }: ComponentProps<TabsProps>) {
  const key = groupKey(props);
  const list = sections(html);

  if (list.length === 0) {
    return h(
      "div",
      { class: TABS_CLASS, "data-tabs-group": key },
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: html } }),
    );
  }

  const base = uniqueKey(page.html, key, html);

  const buttons = list.map((section, i) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        id: `${base}-tab-${i + 1}`,
        "aria-controls": `${base}-panel-${i + 1}`,
        "aria-selected": i === 0 ? "true" : "false",
        tabindex: i === 0 ? 0 : -1,
      },
      section.label,
    ),
  );

  const panels = list.map((section, i) =>
    h(
      "div",
      { role: "tabpanel", id: `${base}-panel-${i + 1}`, "aria-labelledby": `${base}-tab-${i + 1}` },
      h(
        "h3",
        { class: TITLE_CLASS, id: `${base}-title-${i + 1}` },
        section.anchor === undefined
          ? section.label
          : [h("span", { class: FRAGMENT_CLASS, id: section.anchor }), section.label],
      ),
      h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: section.html } }),
    ),
  );

  return h(
    "div",
    { class: TABS_CLASS, "data-tabs-group": base },
    h("div", { role: "tablist", hidden: true }, buttons),
    panels,
  );
}
