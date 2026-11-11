import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import table, {
  REGION_ATTRIBUTE,
  TABLE_CLASS,
  WRAPPER_CLASS,
  rehype,
  type HastNode,
} from "../components/table/index.ts";
import {
  OVERFLOW_TOLERANCE,
  REGION_SELECTOR,
  enhance,
  isOverflowing,
  regionLabel,
  sync,
  type TableElement,
} from "../components/table/client.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/table/style.css");
const namesPath = join(root, "tokens/names.json");

test("default export is the table component and the region marker matches the island selector", () => {
  assert.equal(typeof table, "function");
  assert.equal(REGION_ATTRIBUTE, "data-table-scroll");
  assert.equal(REGION_SELECTOR, `[${REGION_ATTRIBUTE}]`);
});

/** A Markdown table as the rehype step sees it, with an optional caption. */
function tableTree(caption?: string): { tree: HastNode; table: HastNode } {
  const tableNode: HastNode = {
    type: "element",
    tagName: "table",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "thead",
        children: [
          {
            type: "element",
            tagName: "tr",
            children: [
              {
                type: "element",
                tagName: "th",
                children: [{ type: "text", value: "Environment" }],
              },
              {
                type: "element",
                tagName: "th",
                children: [{ type: "text", value: "Target" }],
              },
              {
                type: "element",
                tagName: "th",
                children: [{ type: "text", value: "Hooks" }],
              },
            ],
          },
        ],
      },
      {
        type: "element",
        tagName: "tbody",
        children: [
          {
            type: "element",
            tagName: "tr",
            children: [
              {
                type: "element",
                tagName: "td",
                children: [
                  {
                    type: "element",
                    tagName: "code",
                    children: [{ type: "text", value: "staging" }],
                  },
                ],
              },
              {
                type: "element",
                tagName: "td",
                children: [{ type: "text", value: "s3://beacon-staging" }],
              },
              {
                type: "element",
                tagName: "td",
                children: [{ type: "text", value: "none" }],
              },
            ],
          },
        ],
      },
    ],
  };
  if (caption !== undefined) {
    tableNode.children?.unshift({
      type: "element",
      tagName: "caption",
      children: [{ type: "text", value: caption }],
    });
  }
  return { tree: { type: "root", children: [tableNode] }, table: tableNode };
}

/** Every text value in a hast subtree, in document order. */
function texts(node: HastNode): string[] {
  if (typeof node.value === "string") return [node.value];
  return (node.children ?? []).flatMap(texts);
}

test("rehype wraps a bare table in a focusable scroll region without an unnamed landmark", () => {
  const { tree, table: tableNode } = tableTree();

  rehype()(tree);

  const wrapper = tree.children?.[0];
  assert.ok(wrapper);
  assert.equal(wrapper.type, "element");
  assert.equal(wrapper.tagName, "div");
  assert.deepEqual(wrapper.properties?.className, [WRAPPER_CLASS]);
  assert.equal(wrapper.properties?.dataTableScroll, true);
  assert.equal(wrapper.properties?.tabIndex, 0);
  assert.equal(wrapper.properties?.role, undefined, "a table without a caption adds no region");
  assert.equal(wrapper.properties?.ariaLabel, undefined, "the generic Table label is gone");
  assert.equal(wrapper.children?.[0], tableNode, "the table node itself is kept, cells untouched");
  assert.deepEqual(tableNode.properties?.className, [TABLE_CLASS]);
  assert.ok(texts(tree).includes("s3://beacon-staging"));
});

test("rehype uses a caption as the region's name without adding a second copy of the text", () => {
  const { tree } = tableTree("Deploy targets");

  rehype()(tree);

  const wrapper = tree.children?.[0];
  assert.equal(wrapper?.properties?.role, "region");
  assert.equal(wrapper?.properties?.ariaLabel, "Deploy targets");
  assert.equal(wrapper?.properties?.tabIndex, 0, "without the island the region stays focusable");
  assert.deepEqual(
    texts(tree).filter((text) => text === "Deploy targets"),
    ["Deploy targets"],
    "the caption is the only copy of the name",
  );
});

test("rehype leaves an empty caption unnamed rather than repeating a generic label", () => {
  const { tree } = tableTree("   ");
  rehype()(tree);
  assert.equal(tree.children?.[0]?.properties?.role, undefined);
  assert.equal(tree.children?.[0]?.properties?.ariaLabel, undefined);
});

test("rehype is idempotent when the table is already wrapped", () => {
  const { tree } = tableTree("Deploy targets");
  rehype()(tree);
  rehype()(tree);

  assert.equal(tree.children?.length, 1);
  assert.equal(tree.children?.[0]?.tagName, "div");
  assert.equal(tree.children?.[0]?.children?.[0]?.tagName, "table");
  assert.deepEqual(tree.children?.[0]?.children?.[0]?.properties?.className, [TABLE_CLASS]);
});

test("rehype keeps RTL direction and every cell when it wraps a right-to-left table", () => {
  const { tree } = tableTree("أهداف النشر");
  tree.properties = { dir: "rtl" };

  rehype()(tree);

  const wrapper = tree.children?.[0];
  assert.equal(tree.properties?.dir, "rtl", "the page direction is not changed");
  assert.equal(wrapper?.properties?.ariaLabel, "أهداف النشر");
  assert.ok(texts(tree).includes("staging"), "cell content survives the wrapper");
  assert.ok(texts(tree).includes("s3://beacon-staging"));
});

test("the component names the region from an author label and omits it without one", () => {
  const labelled = table({ label: "Deploy targets", children: [] }) as unknown as {
    props: Record<string, unknown>;
  };
  assert.equal(labelled.props.role, "region");
  assert.equal(labelled.props["aria-label"], "Deploy targets");
  assert.equal(labelled.props["data-label"], "Deploy targets");
  assert.equal(labelled.props.tabIndex, 0);
  assert.equal(labelled.props[REGION_ATTRIBUTE], true);

  const plain = table({ children: [] }) as unknown as { props: Record<string, unknown> };
  assert.equal(plain.props.role, undefined);
  assert.equal(plain.props["aria-label"], undefined);
  assert.equal(plain.props.tabIndex, 0, "the fallback stays keyboard-scrollable");
});

/** A scroll region as the island reads it: attributes, measured widths, and a caption. */
interface FakeRegion extends TableElement {
  readonly attributes: Map<string, string>;
}

/** A node that only satisfies the element shape for queries the island never reads from it. */
const BLANK: TableElement = {
  scrollWidth: 0,
  clientWidth: 0,
  textContent: "",
  getAttribute: () => null,
  setAttribute: () => {},
  removeAttribute: () => {},
  querySelector: () => null,
};

function fakeRegion(scrollWidth: number, clientWidth: number, caption = "", authorLabel?: string): FakeRegion {
  const attributes = new Map<string, string>();
  if (authorLabel !== undefined) attributes.set("data-label", authorLabel);
  const captionNode: TableElement = { ...BLANK, textContent: caption };
  return {
    scrollWidth,
    clientWidth,
    textContent: "",
    attributes,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      attributes.set(name, value);
    },
    removeAttribute: (name) => {
      attributes.delete(name);
    },
    querySelector: (selector) => {
      if (selector === "caption") return caption === "" ? null : captionNode;
      if (selector === "table") return BLANK;
      return null;
    },
  };
}

/** The markup the server sends before the island runs: a tab stop, plus a region when captioned. */
function fallback(region: FakeRegion, label?: string): void {
  region.setAttribute("tabindex", "0");
  if (label !== undefined) {
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", label);
  }
}

test("overflow is measured in CSS pixels with a one-pixel rounding tolerance", () => {
  assert.equal(OVERFLOW_TOLERANCE, 1);
  assert.equal(isOverflowing(fakeRegion(100, 100)), false);
  assert.equal(isOverflowing(fakeRegion(101, 100)), false, "a subpixel or rounding difference is not overflow");
  assert.equal(isOverflowing(fakeRegion(102, 100)), true);
  assert.equal(isOverflowing(fakeRegion(80, 100)), false);
});

test("a table that fits loses the fallback tab stop and region", () => {
  const region = fakeRegion(100, 100, "Deploy targets");
  fallback(region, "Deploy targets");

  assert.equal(sync(region), false);
  assert.equal(region.attributes.has("tabindex"), false);
  assert.equal(region.attributes.has("role"), false);
  assert.equal(region.attributes.has("aria-label"), false);
});

test("an overflowing table regains the tab stop and a caption-named region", () => {
  const region = fakeRegion(640, 320, "Deploy targets");

  assert.equal(sync(region), true);
  assert.equal(region.attributes.get("tabindex"), "0");
  assert.equal(region.attributes.get("role"), "region");
  assert.equal(region.attributes.get("aria-label"), "Deploy targets");
});

test("an overflowing table without a caption stays keyboard-scrollable but is not a landmark", () => {
  const region = fakeRegion(640, 320);

  assert.equal(sync(region), true);
  assert.equal(region.attributes.get("tabindex"), "0");
  assert.equal(region.attributes.has("role"), false);
  assert.equal(region.attributes.has("aria-label"), false);
});

test("an author label names the region and beats a caption", () => {
  const region = fakeRegion(640, 320, "Visible caption", "Author label");
  assert.equal(regionLabel(region), "Author label");
  sync(region);
  assert.equal(region.attributes.get("aria-label"), "Author label");
});

test("enhance watches the container and the table, and resizing updates the state in both directions", () => {
  const region = fakeRegion(100, 100, "Deploy targets");
  fallback(region, "Deploy targets");
  const watched: Array<{ target: TableElement; update: () => void }> = [];

  enhance({
    regions: () => [region],
    watch: (target, update) => {
      watched.push({ target, update });
    },
  });

  assert.equal(region.attributes.has("tabindex"), false, "the initial sync removes the fallback");
  assert.equal(watched.length, 2, "the region and the table are both observed");

  region.scrollWidth = 200;
  for (const entry of watched) entry.update();
  assert.equal(region.attributes.get("tabindex"), "0", "growing past the region adds the tab stop");
  assert.equal(region.attributes.get("aria-label"), "Deploy targets");

  region.scrollWidth = 100;
  for (const entry of watched) entry.update();
  assert.equal(region.attributes.has("tabindex"), false, "shrinking back removes it again");
  assert.equal(region.attributes.has("role"), false);
});

test("style.css uses only token custom properties from names.json", () => {
  const names = JSON.parse(readFileSync(namesPath, "utf8")) as Record<string, Record<string, unknown>>;
  const allowed = new Set<string>();
  for (const [group, entries] of Object.entries(names)) {
    for (const key of Object.keys(entries)) allowed.add(`--${group}-${key}`);
  }

  const css = readFileSync(stylePath, "utf8");
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !allowed.has(name));
  assert.deepEqual(unknown, []);
});

test("style.css keeps the first column sticky and paints an edge shadow", () => {
  const css = readFileSync(stylePath, "utf8");
  assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /inset-inline-start:\s*0/);
  assert.match(css, /box-shadow:\s*var\(--shadow-/);
});
