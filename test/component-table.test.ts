import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import table, {
  TABLE_CLASS,
  WRAPPER_CLASS,
  rehype,
  type HastNode,
} from "../components/table/index.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylePath = join(root, "components/table/style.css");
const namesPath = join(root, "tokens/names.json");

test("default export is the table component", () => {
  assert.equal(typeof table, "function");
});

test("rehype wraps a bare table with tabindex=0 and a label", () => {
  const tree: HastNode = {
    type: "root",
    children: [
      {
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
      },
    ],
  };

  rehype()(tree);

  const wrapper = tree.children?.[0];
  assert.ok(wrapper);
  assert.equal(wrapper.type, "element");
  assert.equal(wrapper.tagName, "div");
  assert.equal(wrapper.properties?.tabIndex, 0);
  assert.equal(wrapper.properties?.role, "region");
  assert.equal(wrapper.properties?.ariaLabel, "Table");
  assert.deepEqual(wrapper.properties?.className, [WRAPPER_CLASS]);

  const tableNode = wrapper.children?.[0];
  assert.ok(tableNode);
  assert.equal(tableNode.tagName, "table");
  assert.deepEqual(tableNode.properties?.className, [TABLE_CLASS]);
});

test("rehype uses a caption as the scroll region's label", () => {
  const tree: HastNode = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "table",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "caption",
            children: [{ type: "text", value: "Deploy targets" }],
          },
        ],
      },
    ],
  };

  rehype()(tree);
  assert.equal(tree.children?.[0]?.properties?.ariaLabel, "Deploy targets");
});

test("rehype is idempotent when the table is already wrapped", () => {
  const tree: HastNode = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: [WRAPPER_CLASS], tabIndex: 0, ariaLabel: "Table" },
        children: [
          {
            type: "element",
            tagName: "table",
            properties: {},
            children: [],
          },
        ],
      },
    ],
  };

  rehype()(tree);
  assert.equal(tree.children?.length, 1);
  assert.equal(tree.children?.[0]?.tagName, "div");
  assert.equal(tree.children?.[0]?.children?.[0]?.tagName, "table");
  assert.deepEqual(tree.children?.[0]?.children?.[0]?.properties?.className, [TABLE_CLASS]);
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
