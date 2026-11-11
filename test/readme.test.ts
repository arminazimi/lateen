// The owned docs are the first thing a reader and an agent read, so a link to a file that is gone, a
// note about a limitation the engine has since fixed, or an example placeholder with no declaration
// sends them the wrong way. This test keeps those three checks on the docs the theme owns.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

/** The text of one file under the repository root. */
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

/** The docs this issue owns. */
const DOCS = ["README.md", "components/video/README.md", "chrome/language-switcher/README.md"];

test("every relative link in the owned docs resolves", () => {
  const missing: string[] = [];
  for (const doc of DOCS) {
    const base = new URL(".", new URL(doc, root));
    for (const match of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1] ?? "";
      // Absolute URLs, root-relative paths, and page anchors are not files in the repository.
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target)) continue;
      const path = target.split(/[?#]/)[0] ?? "";
      if (!existsSync(new URL(path, base))) missing.push(`${doc}: ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("every Markdown file the owned docs name exists", () => {
  const missing: string[] = [];
  for (const doc of DOCS) {
    for (const match of read(doc).matchAll(/`([\w./-]+\.md)`/g)) {
      const target = match[1] ?? "";
      if (!existsSync(new URL(target, root))) missing.push(`${doc}: ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the owned docs do not describe the fixed island and chrome CSS gaps", () => {
  const stale = [
    ["components/video/README.md", "no output writes the island scripts"],
    ["components/video/README.md", "Known gap"],
    ["chrome/language-switcher/README.md", "does not yet load chrome"],
    ["chrome/language-switcher/README.md", "Known gap"],
  ] as const;
  for (const [doc, phrase] of stale) assert.ok(!read(doc).includes(phrase), `${doc} still says "${phrase}"`);
});

/** The names `site/_data/variables.yml` declares, in its `- name: …` list form. */
function declaredVariables(): Set<string> {
  const names = [...read("site/_data/variables.yml").matchAll(/^\s*-\s+name:\s*["']?([\w.-]+)["']?\s*$/gm)];
  return new Set(names.map((match) => match[1] ?? ""));
}

test("the variables-form example declares every placeholder it uses", () => {
  const declared = declaredVariables();
  const used = [...read("site/components/variables-form.md").matchAll(/(?<!\\)\{\{\s*([\w.-]+)\s*\}\}/g)];
  const undeclared = [...new Set(used.map((match) => match[1] ?? ""))].filter((name) => !declared.has(name));
  assert.deepEqual(undeclared, []);
});
