import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import versionBadge, {
  DEFAULT_VARIANT,
  ICONS,
  LABEL_KEYS,
  VARIANTS,
  blockOf,
  classNameOf,
  directive,
  variantOf,
  versionOf,
  type VersionBadgeProps,
} from "../components/version-badge/index.ts";

/** Render the badge the way the render host calls it: directive props and the page's language. */
function render(props: VersionBadgeProps, lang = "en"): string | null {
  const input = { props, html: "", page: { lang }, site: {} } as unknown as ComponentProps<VersionBadgeProps>;
  const node = versionBadge(input);
  return node === null ? null : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/version-badge/style.css", import.meta.url), "utf8");

test("default export is the component and the directive is version-badge", () => {
  assert.equal(typeof versionBadge, "function");
  assert.equal(directive, "version-badge");
  assert.deepEqual([...VARIANTS], ["added", "changed", "removed"]);
  assert.equal(DEFAULT_VARIANT, "added");
});

test("renders v<version> and each variant's icon and class", () => {
  for (const variant of VARIANTS) {
    const out = render({ version: "0.3", variant });
    assert.ok(out, `${variant} renders`);
    assert.match(out, new RegExp(`class="version-badge version-badge-${variant}"`));
    assert.match(out, /class="version-badge-value"[^>]*>v0\.3</);
    assert.ok(out.includes(`>${ICONS[variant]}<`), `${variant} shows its icon`);
    assert.match(out, new RegExp(`class="version-badge-sr">${stringsOf("en")[LABEL_KEYS[variant]]!.replace("{version}", "0\\.3")}<`));
  }
});

test("a screen reader hears the full sentence while the visible value is hidden from it", () => {
  const out = render({ version: "0.3" });
  assert.ok(out);
  assert.match(out, /<span class="version-badge-sr">Added in version 0\.3<\/span>/);
  assert.match(out, /class="version-badge-icon" aria-hidden="true"/);
  assert.match(out, /class="version-badge-value" aria-hidden="true" dir="ltr"/);
});

test("the screen-reader sentence follows the page language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const out = render({ version: "0.3", variant: "removed" }, lang);
    assert.ok(out);
    const expected = stringsOf(lang)[LABEL_KEYS.removed]!.replace("{version}", "0.3");
    assert.ok(out.includes(`>${expected}<`), `${lang} says "${expected}"`);
  }
});

test("the three i18n keys exist with the version placeholder in every language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    for (const key of Object.values(LABEL_KEYS)) {
      const text = stringsOf(lang)[key];
      assert.equal(typeof text, "string", `${lang}.${key}`);
      assert.match(text!, /\{version\}/, `${lang}.${key} has the version placeholder`);
    }
  }
});

test("inline by default and block with the block word", () => {
  const inline = render({ version: "0.3" });
  assert.ok(inline);
  assert.doesNotMatch(inline, /version-badge-block/);

  for (const block of ["", "true", "block"]) {
    const out = render({ version: "0.3", block });
    assert.ok(out);
    assert.match(out, /class="version-badge version-badge-added version-badge-block"/);
  }
  assert.doesNotMatch(render({ version: "0.3", block: "false" })!, /version-badge-block/);
  assert.equal(blockOf(undefined), false);
  assert.equal(blockOf("off"), false);
  assert.equal(blockOf(""), true);
});

test("a missing, blank, or non-string version renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ version: "" }), null);
  assert.equal(render({ version: "   " }), null);
  assert.equal(render({ version: 42 as unknown as string }), null);
  assert.equal(versionOf(undefined), undefined);
  assert.equal(versionOf("<b>"), "<b>");
});

test("a missing or unknown variant is added", () => {
  assert.equal(variantOf(undefined), "added");
  assert.equal(variantOf("purple"), "added");
  assert.equal(variantOf("removed"), "removed");
  assert.match(render({ version: "0.3" })!, /version-badge-added/);
  assert.equal(classNameOf("changed"), "version-badge version-badge-changed");
});

test("version text and its attribute are escaped, never parsed as markup", () => {
  const out = render({ version: '<script>alert("x")</script> &' });
  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /v&lt;script>alert\(&quot;x&quot;\)&lt;\/script> &amp;/);
  assert.match(out, /data-version="&lt;script>alert\(&quot;x&quot;\)&lt;\/script> &amp;"/);
  assert.match(out, /Added in version &lt;script>/);
  assert.doesNotMatch(out, /dangerouslySetInnerHTML/);
});

test("each variant has a different icon, so color is never the only signal", () => {
  const icons = VARIANTS.map((variant) => ICONS[variant]);
  assert.equal(new Set(icons).size, VARIANTS.length);
  for (const icon of icons) assert.notEqual(icon.trim(), "");
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css keeps the badge inline by default and block with the block class", () => {
  assert.match(css, /\.version-badge\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.version-badge-block\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.version-badge-block\s*\{[^}]*inline-size:\s*fit-content/s);
});

test("style.css hides the screen-reader sentence without hiding it from assistive tech", () => {
  assert.match(css, /\.version-badge-sr\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.version-badge-sr\s*\{[^}]*clip-path:\s*inset\(50%\)/s);
  assert.match(css, /\.version-badge-sr\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /\.version-badge-sr\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /\.version-badge-sr\s*\{[^}]*visibility:\s*hidden/s);
});

test("style.css keeps the version value left to right and uses logical spacing", () => {
  assert.match(css, /\.version-badge-value\s*\{[^}]*direction:\s*ltr/s);
  assert.match(css, /\.version-badge-value\s*\{[^}]*unicode-bidi:\s*isolate/s);
  assert.match(css, /\.version-badge\s*\{[^}]*padding-inline:/s);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
});
