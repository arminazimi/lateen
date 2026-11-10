import { Fragment, h } from "preact";
import type { Chrome, Heading } from "@velella/mizzen/contracts";

const LABEL = "On this page";

/** Headings the TOC shows: `h2` and `h3` only, in document order. */
function entries(headings: readonly Heading[]): Heading[] {
  return headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
}

function link(heading: Heading) {
  return h("a", { href: `#${heading.id}` }, heading.text);
}

/** Nested list for the sticky column: each `h2` may wrap following `h3`s. */
function nestedList(items: readonly Heading[]) {
  const nodes = [];
  for (let i = 0; i < items.length; ) {
    const item = items[i]!;
    if (item.depth === 2) {
      const children = [];
      i += 1;
      while (i < items.length && items[i]!.depth === 3) {
        children.push(h("li", null, link(items[i]!)));
        i += 1;
      }
      nodes.push(h("li", null, link(item), children.length > 0 ? h("ul", null, children) : null));
    } else {
      nodes.push(h("li", null, link(item)));
      i += 1;
    }
  }
  return h("ul", null, nodes);
}

/** Flat list for the narrow-screen `<details>` block. */
function flatList(items: readonly Heading[]) {
  return h(
    "ul",
    null,
    items.map((item) => h("li", null, link(item))),
  );
}

/** On this page: sticky aside on wide screens, collapsible block on narrow ones. */
const toc: Chrome = ({ page }) => {
  const items = entries(page.headings);
  if (items.length < 2) return null;

  return h(
    Fragment,
    null,
    h("aside", { class: "toc", "aria-label": LABEL }, h("h2", null, LABEL), nestedList(items)),
    h("details", { class: "toc-fold" }, h("summary", null, LABEL), flatList(items)),
  );
};

export default toc;
