import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import { codeTitle, TITLE_CLASS } from "../components/code/title.ts";

function render(title: string | null | undefined): string | undefined {
  const node = codeTitle(title);
  return node === undefined ? undefined : renderToString(node);
}

test("no bar without a title: missing, null, empty, or blank", () => {
  assert.equal(codeTitle(undefined), undefined);
  assert.equal(codeTitle(null), undefined);
  assert.equal(codeTitle(""), undefined);
  assert.equal(codeTitle("   "), undefined);
});

test("the bar shows the trimmed title beside a file icon", () => {
  const out = render("  src/index.ts  ");
  assert.ok(out !== undefined);
  assert.match(out, new RegExp(`^<div class="${TITLE_CLASS}">`));
  assert.match(out, /<svg class="code-title-icon"[^>]*viewBox="0 0 16 16"/);
  assert.match(out, /<span class="code-title-name">src\/index\.ts<\/span>/);
});

test("the icon is decorative: hidden from assistive tech", () => {
  const out = render("a.ts");
  assert.ok(out !== undefined);
  assert.match(out, /<svg[^>]*aria-hidden="true"/);
  assert.equal((out.match(/<path /g) ?? []).length, 2);
});

test("the title is escaped, never markup", () => {
  const out = render('<script>x</script> & "q"');
  assert.ok(out !== undefined);
  assert.doesNotMatch(out, /<script/);
  assert.match(out, /<span class="code-title-name">&lt;script>x&lt;\/script> &amp; &quot;q&quot;<\/span>/);
});
