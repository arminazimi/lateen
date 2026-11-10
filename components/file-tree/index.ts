import { h } from "preact";
import type { VNode } from "preact";
import type { Component } from "@velella/mizzen/contracts";

/** Markdown directive that turns the nested list in its body into a file tree. */
export const directive = "file-tree";

/** Accessible name of the tree when the author gives no `label`. */
const DEFAULT_LABEL = "File tree";

/** One row of the tree: its name and note as HTML, and the rows nested under it. */
export interface FileTreeEntry {
  name: string;
  note: string;
  children: FileTreeEntry[];
}

type Open = { entry: FileTreeEntry; label: string; labelDone: boolean };

/** The comment separator: `#` preceded by whitespace and followed by whitespace or the end. */
const NOTE_SEPARATOR = /\s#(?=\s|$)/;

const TAG = /<(\/?)([a-zA-Z][\w-]*)[^>]*>|[^<]+/g;

/**
 * Reads the list HTML the render host gives the component (`<ul><li>…<ul>…</ul></li></ul>`) into
 * entries. An item's label is everything before its nested list; paragraphs that loose lists add
 * around the label are dropped. Only `ul`, `ol`, `li`, and `p` need tracking: everything else in a
 * label is kept as HTML.
 */
export function parseEntries(html: string): FileTreeEntry[] {
  const roots: FileTreeEntry[] = [];
  const open: Open[] = [];

  for (const match of html.matchAll(TAG)) {
    const [raw, slash, tag] = match;
    const top = open[open.length - 1];

    if (tag === undefined) {
      if (top && !top.labelDone) top.label += raw;
      continue;
    }

    const name = tag.toLowerCase();
    const closing = slash === "/";

    if (name === "li") {
      if (closing) {
        const done = open.pop();
        if (done) finish(done);
      } else {
        const entry: FileTreeEntry = { name: "", note: "", children: [] };
        (top ? top.entry.children : roots).push(entry);
        open.push({ entry, label: "", labelDone: false });
      }
    } else if (name === "ul" || name === "ol") {
      if (!closing && top) top.labelDone = true;
    } else if (name !== "p" && top && !top.labelDone) {
      top.label += raw;
    }
  }

  while (open.length > 0) finish(open.pop()!);
  return roots;
}

/** Splits an item's label into its name and the note after `#`, and writes both onto the entry. */
function finish({ entry, label }: Open): void {
  const text = label.trim();
  const separator = NOTE_SEPARATOR.exec(text);
  if (separator) {
    entry.name = text.slice(0, separator.index).trim();
    entry.note = text.slice(separator.index + separator[0].length).trim();
  } else {
    entry.name = text;
  }
}

/** A folder has nested rows, or a name that ends in `/` (also when the slash is inside a closing tag such as `</code>`). */
function isFolder(entry: FileTreeEntry): boolean {
  return entry.children.length > 0 || /\/(\s|<\/[a-zA-Z][\w-]*>)*$/.test(entry.name);
}

/** A name in bold (`**name**`) or `<mark>` marks the entry as highlighted. */
function isHighlighted(entry: FileTreeEntry): boolean {
  return /<(strong|b|mark)[\s>]/i.test(entry.name);
}

function icon(folder: boolean): VNode {
  return h(
    "svg",
    {
      class: folder ? "file-tree-icon is-folder-icon" : "file-tree-icon is-file-icon",
      viewBox: "0 0 16 16",
      "aria-hidden": "true",
      focusable: "false",
    },
    h("path", {
      d: folder
        ? "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v6.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z"
        : "M4 2h5.5L13 5.5V14H4zM9.5 2v3.5H13",
    }),
  );
}

/** One row, as a treeitem with its position in the level and, for a folder, its nested group. */
function item(entry: FileTreeEntry, level: number, index: number, count: number): VNode {
  const folder = isFolder(entry);
  const hasChildren = entry.children.length > 0;
  const classes = ["file-tree-item", folder ? "is-folder" : "is-file"];
  if (isHighlighted(entry)) classes.push("is-highlighted");

  return h(
    "li",
    {
      class: classes.join(" "),
      role: "treeitem",
      "aria-level": level,
      "aria-setsize": count,
      "aria-posinset": index + 1,
      "aria-expanded": hasChildren ? "true" : undefined,
    },
    h(
      "div",
      { class: "file-tree-row" },
      icon(folder),
      h("span", { class: "file-tree-name", dangerouslySetInnerHTML: { __html: entry.name } }),
      entry.note !== ""
        ? h("span", { class: "file-tree-note", dangerouslySetInnerHTML: { __html: entry.note } })
        : null,
    ),
    hasChildren ? group(entry.children, level + 1) : null,
  );
}

/** A list of sibling rows: the tree itself at the top, a `group` under each folder. */
function group(entries: FileTreeEntry[], level: number, root?: string): VNode {
  return h(
    "ul",
    root === undefined
      ? { class: "file-tree-group", role: "group" }
      : { class: "file-tree", role: "tree", "aria-label": root },
    ...entries.map((entry, i) => item(entry, level, i, entries.length)),
  );
}

/**
 * Renders a nested Markdown list as a file tree. Folders get a folder icon, files a file icon, a
 * `#` comment renders muted, and bold entries are highlighted. Without a list the body is passed
 * through so the page still reads.
 */
const fileTree: Component<{ label?: string }> = ({ props, html }) => {
  const entries = parseEntries(html);
  if (entries.length === 0) {
    return h("div", { class: "file-tree", dangerouslySetInnerHTML: { __html: html } });
  }
  const label = typeof props.label === "string" && props.label !== "" ? props.label : DEFAULT_LABEL;
  return group(entries, 1, label);
};

export default fileTree;
