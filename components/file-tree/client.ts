/* File tree island: one tab stop, arrow-key movement through the visible rows, and folder
   expand/collapse. Without this script every row stays visible and tabbable. */

/** Attribute on the tree root (`<ul role="tree" data-file-tree>`); the island finds trees by it. */
export const TREE_SELECTOR = "[data-file-tree]";
export const ITEM_SELECTOR = "[role=treeitem]";
export const GROUP_SELECTOR = "[role=group]";

/** Marks a tree the island has wired. */
export const ENHANCED_ATTR = "data-enhanced";

/** An element the island touches: a row, a group, or the tree root. */
export interface TreeElement {
  hidden: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  focus(): void;
  contains(node: unknown): boolean;
  querySelector(selector: string): TreeElement | null;
  querySelectorAll(selector: string): Iterable<TreeElement>;
  addEventListener(type: string, listener: (event: TreeEvent) => void): void;
}

/** A DOM event as the island reads it. */
export interface TreeEvent {
  readonly key?: string;
  readonly target: unknown;
  preventDefault(): void;
}

/** One tree root as the island touches it. */
export interface TreeRoot {
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): Iterable<TreeElement>;
  addEventListener(type: string, listener: (event: TreeEvent) => void): void;
}

/** The rows a reader can see: a row inside a collapsed group and its subtree are left out. */
function visibleItems(items: readonly TreeElement[], groupOf: (item: TreeElement) => TreeElement | null): TreeElement[] {
  const visible: TreeElement[] = [];
  const collapsed: TreeElement[] = [];
  for (const item of items) {
    if (collapsed.some((group) => group.contains(item))) continue;
    visible.push(item);
    const group = groupOf(item);
    if (group !== null && group.hidden) collapsed.push(group);
  }
  return visible;
}

/**
 * Wires one tree. Folders start expanded, as in the markup, and stay that way until the reader
 * collapses one; the group is only hidden after this runs, so a page without JavaScript shows the
 * complete tree. The first visible row is the tree's one tab stop, and arrows, Home, and End move
 * through the visible rows without wrapping. In a right-to-left tree ArrowRight and ArrowLeft swap,
 * since the nesting runs the other way. Enter and Space toggle a folder; files have no action.
 */
export function activate(root: TreeRoot, rtl: boolean): void {
  const items = [...root.querySelectorAll(ITEM_SELECTOR)];
  if (items.length === 0) return;

  const levelOf = (item: TreeElement): number => Number(item.getAttribute("aria-level") ?? "1") || 1;
  const groupOf = (item: TreeElement): TreeElement | null => item.querySelector(GROUP_SELECTOR);
  const isFolder = (item: TreeElement): boolean => item.getAttribute("aria-expanded") !== null;

  let current = items[0]!;
  const focus = (item: TreeElement): void => {
    current = item;
    for (const row of items) row.setAttribute("tabindex", row === item ? "0" : "-1");
    item.focus();
  };

  const setExpanded = (item: TreeElement, open: boolean): void => {
    const group = groupOf(item);
    if (group === null) return;
    item.setAttribute("aria-expanded", open ? "true" : "false");
    group.hidden = !open;
    // Focus must never sit in content that just hid; it returns to the folder that hid it.
    if (!open && group.contains(current)) focus(item);
  };

  /** The row above `item` in the tree, whatever its group's state. */
  const parentOf = (item: TreeElement): TreeElement | undefined => {
    const level = levelOf(item);
    for (let i = items.indexOf(item) - 1; i >= 0; i -= 1) {
      const candidate = items[i]!;
      if (levelOf(candidate) < level) return candidate;
    }
    return undefined;
  };

  /** The first row nested under an expanded folder. */
  const childOf = (item: TreeElement): TreeElement | undefined => {
    const group = groupOf(item);
    if (group === null || group.hidden) return undefined;
    return items.find((row) => group.contains(row));
  };

  const arrowForward = rtl ? "ArrowLeft" : "ArrowRight";
  const arrowBack = rtl ? "ArrowRight" : "ArrowLeft";

  root.addEventListener("keydown", (event) => {
    const target = event.target as TreeElement;
    if (!items.includes(target)) return;

    const list = visibleItems(items, groupOf);
    const at = list.indexOf(target);

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = list[at + 1];
        if (next !== undefined) focus(next);
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = list[at - 1];
        if (previous !== undefined) focus(previous);
        return;
      }
      case "Home": {
        event.preventDefault();
        const first = list[0];
        if (first !== undefined) focus(first);
        return;
      }
      case "End": {
        event.preventDefault();
        const last = list[list.length - 1];
        if (last !== undefined) focus(last);
        return;
      }
      case arrowForward: {
        event.preventDefault();
        if (!isFolder(target)) return;
        if (target.getAttribute("aria-expanded") === "false") {
          setExpanded(target, true);
          return;
        }
        const child = childOf(target);
        if (child !== undefined) focus(child);
        return;
      }
      case arrowBack: {
        event.preventDefault();
        if (isFolder(target) && target.getAttribute("aria-expanded") === "true") {
          setExpanded(target, false);
          return;
        }
        const parent = parentOf(target);
        if (parent !== undefined && list.includes(parent)) focus(parent);
        return;
      }
      case " ": {
        event.preventDefault();
        if (isFolder(target)) setExpanded(target, target.getAttribute("aria-expanded") !== "true");
        return;
      }
      case "Enter": {
        if (!isFolder(target)) return;
        event.preventDefault();
        setExpanded(target, target.getAttribute("aria-expanded") !== "true");
        return;
      }
      default:
        return;
    }
  });

  // The tree is wired: every row was in the tab order without this script; the island keeps one.
  for (const [index, item] of items.entries()) item.setAttribute("tabindex", index === 0 ? "0" : "-1");
  root.setAttribute(ENHANCED_ATTR, "");
}

// The theme's tsconfig has no DOM lib; these are the browser globals the island needs, no more.
declare const document: { querySelectorAll(selector: string): Iterable<unknown> };
declare function getComputedStyle(element: unknown): { direction: string };

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (typeof document !== "undefined") {
  for (const element of document.querySelectorAll(TREE_SELECTOR)) {
    try {
      activate(element as TreeRoot, getComputedStyle(element).direction === "rtl");
    } catch {
      // One tree that cannot be read must not keep the rest of the page from enhancing.
    }
  }
}
