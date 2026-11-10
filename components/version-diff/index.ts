import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::version-diff{from=v1 to=v2 changes='[...]'}`. */
export const directive = "version-diff";

/** The four kinds of section difference, in the order the viewer lists them in data. */
export const KINDS = ["added", "removed", "changed", "moved"] as const;

export type ChangeKind = (typeof KINDS)[number];

/** The id prefix used when the directive gives none. */
export const DEFAULT_ID = "version-diff";

/**
 * The icon before each kind's label. Each kind has its own shape, so the kinds differ by shape and
 * by the visible label, never by color alone.
 */
export const ICONS: Readonly<Record<ChangeKind, readonly string[]>> = {
  added: ["M8 3v10", "M3 8h10"],
  removed: ["M3 8h10"],
  changed: ["M8 2.5 13.5 8 8 13.5 2.5 8Z"],
  moved: ["M3 5h10", "m10 2 3 3-3 3", "M13 11H3", "m6-3-3 3 3 3"],
};

/** The i18n key with each kind's visible label. */
export const LABEL_KEYS: Readonly<Record<ChangeKind, string>> = {
  added: "version_diff_added",
  removed: "version_diff_removed",
  changed: "version_diff_changed",
  moved: "version_diff_moved",
};

/** One section difference, as the data records it. */
export interface VersionChange {
  /** `added`, `removed`, `changed`, or `moved`; any other value is dropped. */
  readonly kind: ChangeKind;
  /** The section's heading; a blank one drops the entry. */
  readonly title: string;
  /** For `moved`, the section's old position, as the data wrote it. */
  readonly from?: string;
  /** For `moved`, the section's new position, as the data wrote it. */
  readonly to?: string;
  /** The section's text in the older version, when the data has it. */
  readonly before?: string;
  /** The section's text in the newer version, when the data has it. */
  readonly after?: string;
}

/** One page's diff between two versions. */
export interface VersionDiff {
  /** The older version folder, such as `v1`. */
  readonly from: string;
  /** The newer version folder, such as `v2`. */
  readonly to: string;
  /** The section differences, in the order the data lists them. */
  readonly changes: readonly VersionChange[];
}

/**
 * Props from the directive:
 * `::version-diff{from=v1 to=v2 changes='[{"kind":"added","title":"Install"}]'}`.
 *
 * The `data` attribute takes the whole object instead:
 * `::version-diff{data='{"from":"v1","to":"v2","changes":[...]}'}`.
 */
export type VersionDiffProps = {
  /** The older version; ignored when `data` gives one. */
  from?: string;
  /** The newer version; ignored when `data` gives one. */
  to?: string;
  /** JSON array of changes, each `{ kind, title, from?, to?, before?, after? }`. */
  changes?: string;
  /** JSON object `{ from, to, changes }`; it wins over the separate attributes. */
  data?: string;
  /** Prefix for this viewer's element ids; give each viewer on a page its own id. */
  id?: string;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty trimmed string, or a finite number as text; everything else is undefined. */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** The kind of a change, without case or surrounding spaces; anything else is undefined. */
export function kindOf(value: unknown): ChangeKind | undefined {
  if (typeof value !== "string") return undefined;
  const kind = value.trim().toLowerCase();
  return (KINDS as readonly string[]).includes(kind) ? (kind as ChangeKind) : undefined;
}

/** The JSON value in a directive attribute, or undefined when it is missing, blank, or not JSON. */
export function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** One change from a record, or undefined when it has no known kind or no section title. */
export function changeOf(value: unknown): VersionChange | undefined {
  if (!isRecord(value)) return undefined;
  const kind = kindOf(value.kind);
  if (kind === undefined) return undefined;
  const title = textOf(value.title) ?? textOf(value.heading);
  if (title === undefined) return undefined;

  const from = textOf(value.from);
  const to = textOf(value.to);
  const before = textOf(value.before) ?? textOf(value.oldText);
  const after = textOf(value.after) ?? textOf(value.newText);
  return {
    kind,
    title,
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}

/** Every usable change in a JSON array, in the order written; anything else gives none. */
export function changesOf(value: unknown): readonly VersionChange[] {
  if (!Array.isArray(value)) return [];
  return value.map(changeOf).filter((change): change is VersionChange => change !== undefined);
}

/**
 * The changes in the engine's `diff/<version>/<page>.json` shape, where the four kinds are four
 * lists: added and removed sections carry `text`, changed and moved ones `oldText` and `newText`.
 * The lists are read in {@link KINDS} order, which is the only order that shape keeps.
 */
function groupedChanges(value: Readonly<Record<string, unknown>>): readonly VersionChange[] {
  const changes: VersionChange[] = [];
  for (const kind of KINDS) {
    const list = value[kind];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!isRecord(raw)) continue;
      const change = changeOf({
        ...raw,
        kind,
        before: raw.before ?? raw.oldText ?? (kind === "removed" ? raw.text : undefined),
        after: raw.after ?? raw.newText ?? (kind === "added" ? raw.text : undefined),
      });
      if (change !== undefined) changes.push(change);
    }
  }
  return changes;
}

/**
 * A diff from a record: `{ from, to, changes }`, or the engine's grouped `{ from, to, added, removed,
 * changed, moved }`. A missing version, two equal versions, or no usable change gives undefined, so
 * the viewer renders nothing.
 */
export function diffOf(value: unknown): VersionDiff | undefined {
  if (!isRecord(value)) return undefined;
  const from = textOf(value.from);
  const to = textOf(value.to);
  if (from === undefined || to === undefined || from === to) return undefined;

  const listed = changesOf(value.changes);
  const changes = listed.length > 0 ? listed : groupedChanges(value);
  return changes.length === 0 ? undefined : { from, to, changes };
}

/**
 * The diff to show: the `data` attribute first, then `from`/`to` with the `changes` attribute, then
 * the page's `versionDiff` front matter. The first one that names two different versions and carries
 * a change wins.
 */
export function versionDiffFor(
  props: VersionDiffProps,
  frontMatter: Readonly<Record<string, unknown>>,
): VersionDiff | undefined {
  const data = parseJson(props.data);
  if (isRecord(data)) return diffOf(data);

  const from = textOf(props.from);
  const to = textOf(props.to);
  const changes = parseJson(props.changes);
  if (from !== undefined && to !== undefined && changes !== undefined) {
    return diffOf({ from, to, changes });
  }

  return diffOf(frontMatter.versionDiff);
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: unknown): string {
  const clean = textOf(raw)?.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") ?? "";
  return clean === "" ? DEFAULT_ID : clean;
}

/** One kind's inline icon; the visible label beside it carries the meaning, so it is decorative. */
function icon(kind: ChangeKind) {
  return h(
    "svg",
    {
      class: "version-diff-icon",
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

/** A section of text from one side of the change, under its `Before` or `After` label. */
function excerpt(side: "before" | "after", label: string, text: string) {
  return h(
    "div",
    { class: `version-diff-${side}` },
    h("span", { class: "version-diff-text-label" }, label),
    h("p", { class: "version-diff-text", dir: "auto" }, text),
  );
}

/** One change: its section heading, the kind in text and icon, positions, and the changed text. */
function changeItem(change: VersionChange, index: number, base: string, lang: string) {
  const parts = [
    h("h3", { class: "version-diff-item-title", id: `${base}-change-${index + 1}-title` }, change.title),
    h(
      "p",
      { class: `version-diff-kind version-diff-kind-${change.kind}` },
      icon(change.kind),
      h("span", { class: "version-diff-kind-label" }, t(lang, LABEL_KEYS[change.kind])),
    ),
  ];

  if (change.kind === "moved" && (change.from !== undefined || change.to !== undefined)) {
    parts.push(
      h(
        "p",
        { class: "version-diff-position" },
        change.from === undefined
          ? null
          : h(
              "span",
              { class: "version-diff-position-old" },
              t(lang, "version_diff_moved_from", { from: change.from }),
            ),
        change.to === undefined
          ? null
          : h(
              "span",
              { class: "version-diff-position-new" },
              t(lang, "version_diff_moved_to", { to: change.to }),
            ),
      ),
    );
  }

  if (change.before !== undefined) parts.push(excerpt("before", t(lang, "version_diff_before"), change.before));
  if (change.after !== undefined) parts.push(excerpt("after", t(lang, "version_diff_after"), change.after));

  return h(
    "li",
    {
      class: `version-diff-item version-diff-item-${change.kind}`,
      id: `${base}-change-${index + 1}`,
      "data-version-diff-item": "",
      "data-kind": change.kind,
      tabindex: -1,
    },
    parts,
  );
}

/**
 * A section-by-section diff between two versions of a page. Every change says what it is with a
 * visible label and its own icon shape, not color alone, and shows the section's heading; moved
 * changes also show their old and new position. The diff is an ordered list with a heading, so
 * without JavaScript it reads top to bottom as written.
 *
 * `client.ts` is the island: it reveals Previous and Next buttons and a change count, and the arrow
 * keys, Home, and End move between changes with one change in the tab order at a time. The wording
 * comes from `i18n/*.json` in the page's language, and the stylesheet uses logical properties only.
 */
const versionDiff: Component<VersionDiffProps> = ({ props, page }) => {
  const diff = versionDiffFor(props, page.frontMatter);
  if (diff === undefined) return null;

  const base = idBase(props.id);
  const titleId = `${base}-title`;
  const listId = `${base}-list`;
  const total = diff.changes.length;

  return h(
    "section",
    { class: "version-diff", "data-version-diff": base, "aria-labelledby": titleId },
    h(
      "header",
      { class: "version-diff-header" },
      h(
        "h2",
        { class: "version-diff-title", id: titleId },
        t(page.lang, "version_diff_title", { from: diff.from, to: diff.to }),
      ),
      h(
        "div",
        {
          class: "version-diff-controls",
          role: "group",
          "aria-label": t(page.lang, "version_diff_group"),
          "data-version-diff-controls": "",
          hidden: true,
        },
        h(
          "button",
          {
            type: "button",
            class: "version-diff-previous",
            "data-version-diff-previous": "",
            "aria-controls": listId,
          },
          t(page.lang, "version_diff_previous"),
        ),
        h(
          "p",
          {
            class: "version-diff-count",
            "data-version-diff-count": "",
            "data-template": t(page.lang, "version_diff_count"),
            "data-total": String(total),
            "aria-live": "polite",
            "aria-atomic": "true",
          },
          t(page.lang, "version_diff_count", { current: 1, total }),
        ),
        h(
          "button",
          {
            type: "button",
            class: "version-diff-next",
            "data-version-diff-next": "",
            "aria-controls": listId,
          },
          t(page.lang, "version_diff_next"),
        ),
      ),
    ),
    h(
      "ol",
      { class: "version-diff-list", id: listId, "data-version-diff-list": "" },
      diff.changes.map((change, index) => changeItem(change, index, base, page.lang)),
    ),
  );
};

export default versionDiff;
