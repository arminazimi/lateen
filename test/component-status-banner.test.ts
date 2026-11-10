import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import statusBanner, {
  ICONS,
  LABEL_KEYS,
  STATUSES,
  classNameOf,
  directive,
  replacementOf,
  statusOf,
  versionOf,
  type StatusBannerProps,
} from "../components/status-banner/index.ts";

/** Render the banner the way the render host calls it: directive props and the page's language. */
function render(props: StatusBannerProps, lang = "en"): string | null {
  const input = { props, html: "", page: { lang }, site: {} } as unknown as ComponentProps<StatusBannerProps>;
  const node = statusBanner(input);
  return node === null ? null : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/status-banner/style.css", import.meta.url), "utf8");

test("default export is the component, with the three statuses", () => {
  assert.equal(typeof statusBanner, "function");
  assert.equal(directive, "status-banner");
  assert.deepEqual([...STATUSES], ["deprecated", "experimental", "old-version"]);
});

test("each status renders a page-level banner with its class, id, and role", () => {
  for (const status of STATUSES) {
    const out = render({ status });
    assert.ok(out, `${status} renders a banner`);
    assert.match(out, new RegExp(`class="status-banner status-banner-${status}"`));
    assert.match(out, new RegExp(`id="status-banner-${status}"`));
    assert.match(out, /role="note"/);
    assert.match(out, new RegExp(`aria-labelledby="status-banner-${status}-label"`));
    assert.equal(classNameOf(status), `status-banner status-banner-${status}`);
  }
});

test("each status shows its own icon and its visible label, so colour is never the only signal", () => {
  const shapes = new Set<string>();
  for (const status of STATUSES) {
    const out = render({ status });
    assert.ok(out, `${status} renders`);
    assert.match(out, /<svg class="status-banner-icon"[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.ok(
      out.includes(
        `<strong class="status-banner-label" id="status-banner-${status}-label">${stringsOf("en")[LABEL_KEYS[status]]!}</strong>`,
      ),
    );
    const shape = ICONS[status].join("|");
    assert.ok(!shapes.has(shape), `${status} has its own icon shape`);
    shapes.add(shape);
  }
});

test("the labels follow the page language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    for (const status of STATUSES) {
      const out = render({ status }, lang);
      assert.ok(out, `${lang} ${status} renders`);
      const label = stringsOf(lang)[LABEL_KEYS[status]];
      assert.equal(typeof label, "string", `${lang}.${LABEL_KEYS[status]}`);
      assert.ok(out.includes(`>${label!}</strong>`), `${lang} ${status} says "${label}"`);
    }
  }
});

test("the old-version status is spelled as a directive value", () => {
  assert.equal(statusOf("old-version"), "old-version");
  assert.equal(statusOf(" Old Version "), "old-version");
  assert.equal(statusOf("old_version"), "old-version");
  const out = render({ status: "old-version" });
  assert.ok(out);
  assert.match(out, /class="status-banner status-banner-old-version"/);
  assert.match(out, />Old version<\/strong>/);
});

test("shows the version when it is given", () => {
  const out = render({ status: "deprecated", version: " 0.2.0 " });
  assert.ok(out);
  assert.match(
    out,
    /<span class="status-banner-version"><span class="status-banner-version-label">Since<\/span><span class="status-banner-version-value" dir="ltr">0\.2\.0<\/span><\/span>/,
  );
  assert.equal(versionOf(" 0.2.0 "), "0.2.0");
});

test("omits the version when it is missing, blank, or not a string", () => {
  assert.doesNotMatch(render({ status: "deprecated" })!, /status-banner-version/);
  assert.doesNotMatch(render({ status: "deprecated", version: "   " })!, /status-banner-version/);
  assert.equal(versionOf(42), undefined);
});

test("a replacement is a link that names the replacement and points at it", () => {
  const out = render({ status: "deprecated", replacement: "/guide/new-install/" });
  assert.ok(out);
  assert.match(
    out,
    /<a class="status-banner-replacement" href="\/guide\/new-install\/"><span class="status-banner-replacement-label">Replaced by<\/span><span class="status-banner-replacement-target" dir="ltr">\/guide\/new-install\/<\/span><\/a>/,
  );
});

test("the replacement link is available for every status", () => {
  for (const status of STATUSES) {
    const out = render({ status, replacement: "/new/" });
    assert.ok(out);
    assert.match(out, /class="status-banner-replacement" href="\/new\/"/);
  }
});

test("a replacement is only kept when it is a path on this site or an https link", () => {
  assert.equal(replacementOf(" https://example.com/new "), "https://example.com/new");
  assert.equal(replacementOf("javascript:alert(1)"), undefined);
  assert.equal(replacementOf("//evil.example/path"), undefined);
  assert.equal(replacementOf("/\\evil.example"), undefined);
  assert.equal(replacementOf("http://example.com/"), undefined);
  assert.equal(replacementOf("new-page"), undefined);
  assert.equal(replacementOf("/a\"><script>"), undefined);
  assert.equal(replacementOf(undefined), undefined);
  assert.doesNotMatch(render({ status: "deprecated", replacement: "javascript:alert(1)" })!, /status-banner-replacement/);
});

test("a missing, blank, or unknown status renders nothing", () => {
  assert.equal(render({}), null);
  assert.equal(render({ status: "  " }), null);
  assert.equal(render({ status: "proposed" }), null);
  assert.equal(render({ status: "beta" }), null);
  assert.equal(render({ status: "stable" }), null);
  assert.equal(statusOf(undefined), undefined);
  assert.equal(statusOf(7), undefined);
});

test("version text and the replacement URL are escaped, never parsed as markup", () => {
  const out = render({ status: "deprecated", version: '<script>alert("x")</script>', replacement: "/new?a=1&b=2" });
  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /<span class="status-banner-version-value" dir="ltr">&lt;script>alert\(&quot;x&quot;\)&lt;\/script><\/span>/);
  assert.match(out, /href="\/new\?a=1&amp;b=2"/);
  assert.match(out, />\/new\?a=1&amp;b=2<\/span>/);
});

test("each status reads its accent color from a token that exists in names.json", () => {
  const expected: Record<string, string> = {
    deprecated: "--color-danger",
    experimental: "--color-info",
    "old-version": "--color-warning",
  };
  for (const [status, token] of Object.entries(expected)) {
    const rule = new RegExp(
      `\\.status-banner-${status}\\s*\\{[^}]*border-inline-start-color:\\s*var\\(${token}\\)`,
    );
    assert.match(css, rule, `.status-banner-${status} uses var(${token})`);
    assert.ok(tokenNames.has(token.slice(2)), `${token} is a token`);
  }
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(top|bottom)\b/);
  assert.doesNotMatch(css, /\b(left|right):/);
});
