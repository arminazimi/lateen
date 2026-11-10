import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { theme } from "../src/index.ts";

const root = new URL("../", import.meta.url);

test("the theme manifest names the package and lists the folders the registries discover", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { name: string };
  assert.equal(pkg.name, "@velella/lateen");
  assert.equal(theme.name, "lateen");
  assert.deepEqual(Object.keys(theme), ["name", "folders"]);
  for (const folder of theme.folders) assert.ok(existsSync(new URL(`${folder}/README.md`, root)), `${folder}/README.md exists`);
});
