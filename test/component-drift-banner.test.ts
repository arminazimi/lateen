import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps, Site } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import driftBanner, {
  CLASS,
  DETAILS_CLASS,
  detailsHrefOf,
  findingsOf,
  messageOf,
  pagesOf,
} from "../components/drift-banner/index.ts";

/** A site with the data, theme options, and base the component reads. */
function siteOf(data: Record<string, unknown>, options: Record<string, unknown> = {}, base = ""): Site {
  return { config: { base, theme: { options } }, pages: [], nav: {}, data } as unknown as Site;
}

type RenderOptions = {
  readonly lang?: string;
  readonly options?: Record<string, unknown>;
  readonly base?: string;
  readonly url?: string;
};

/** Render the banner the way the doc layout calls it: the site model and one page. */
function render(data: Record<string, unknown>, options: RenderOptions = {}): string | null {
  const { lang = "en", options: themeOptions = {}, base = "", url = "/guide/" } = options;
  const input = {
    props: {},
    html: "",
    page: { lang, url },
    site: siteOf(data, themeOptions, base),
  } as unknown as ComponentProps;
  const node = driftBanner(input);
  return node === null ? null : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/drift-banner/style.css", import.meta.url), "utf8");

test("default export is the drift banner component", () => {
  assert.equal(typeof driftBanner, "function");
  assert.equal(CLASS, "drift-banner");
  assert.equal(DETAILS_CLASS, "drift-banner-details");
});

test("renders nothing when the site has no drift data", () => {
  assert.equal(render({}), null);
  assert.equal(render({ drift: undefined }), null);
  assert.equal(render({ drift: null }), null);
  assert.equal(render({ drift: "not a map" }), null);
  assert.equal(render({ drift: [] }), null);
});

test("renders nothing when the page has no findings, an empty list, or a non-list", () => {
  assert.equal(render({ drift: {} }), null);
  assert.equal(render({ drift: { "/other/": [{}] } }), null);
  assert.equal(render({ drift: { "/guide/": [] } }), null);
  assert.equal(render({ drift: { "/guide/": "not a list" } }), null);
  assert.equal(render({ drift: { "/guide/": null } }), null);
});

test("one finding uses the singular message", () => {
  const out = render({ drift: { "/guide/": [{ message: "Renamed." }] } });
  assert.ok(out);
  assert.match(out, new RegExp(`<aside class="${CLASS}" role="note">`));
  assert.match(out, /<span class="drift-banner-message">1 drift finding<\/span>/);
});

test("many findings use the plural message with the count", () => {
  const out = render({ drift: { "/guide/": [{}, {}, {}] } });
  assert.ok(out);
  assert.match(out, /<span class="drift-banner-message">3 drift findings<\/span>/);
});

test("the top-level shape is keyed by page URL", () => {
  const data = { drift: { "/guide/": [{}, {}] } };
  assert.deepEqual(findingsOf(siteOf(data), "/guide/"), [{}, {}]);
  assert.equal(findingsOf(siteOf(data), "/other/"), undefined);
  assert.match(render(data)!, /2 drift findings/);
});

test("the nested pages shape is keyed by page URL too", () => {
  const data = { drift: { pages: { "/guide/": [{}, {}, {}, {}] } } };
  assert.deepEqual(pagesOf(data.drift), { "/guide/": [{}, {}, {}, {}] });
  assert.deepEqual(findingsOf(siteOf(data), "/guide/"), [{}, {}, {}, {}]);
  assert.match(render(data)!, /4 drift findings/);
});

test("a nested pages member wins over top-level keys", () => {
  const drift = { pages: { "/guide/": [{}, {}] }, "/guide/": [{}] };
  assert.deepEqual(pagesOf(drift), { "/guide/": [{}, {}] });
  assert.match(render({ drift })!, /2 drift findings/);
});

test("the details link comes from theme.options.drift.detailsUrl, under the site base", () => {
  const out = render(
    { drift: { "/guide/": [{}] } },
    { options: { drift: { detailsUrl: "/drift/" } }, base: "/evergreen" },
  );
  assert.ok(out);
  assert.match(out, /<a class="drift-banner-details" href="\/evergreen\/drift\/">View drift details<\/a>/);
});

test("an https details link is kept as written and no link is shown without one", () => {
  assert.match(
    render({ drift: { "/guide/": [{}] } }, { options: { drift: { detailsUrl: "https://example.com/drift" } } })!,
    /href="https:\/\/example.com\/drift"/,
  );
  assert.doesNotMatch(render({ drift: { "/guide/": [{}] } })!, /drift-banner-details/);
});

test("an unsafe details URL is dropped instead of rendered", () => {
  for (const detailsUrl of ["javascript:alert(1)", "//evil.example/path", "relative/page", " http://example.com/ "]) {
    assert.doesNotMatch(render({ drift: { "/guide/": [{}] } }, { options: { drift: { detailsUrl } } })!, /drift-banner-details/);
  }
  assert.equal(detailsHrefOf(siteOf({}, { drift: { detailsUrl: "javascript:alert(1)" } }).config), undefined);
});

test("the details link is escaped, never parsed as markup", () => {
  const out = render({ drift: { "/guide/": [{}] } }, { options: { drift: { detailsUrl: "/drift?a=1&b=2" } } });
  assert.ok(out);
  assert.match(out, /href="\/drift\?a=1&amp;b=2"/);
  assert.doesNotMatch(out, /<script>/);
});

test("the text follows the page language for one and many findings", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const one = stringsOf(lang)[messageKey(1)]!.replace("{n}", "1");
    const many = stringsOf(lang)[messageKey(2)]!.replace("{n}", "2");
    assert.equal(messageOf(lang, 1), one, `${lang} singular`);
    assert.equal(messageOf(lang, 2), many, `${lang} plural`);
    assert.ok(render({ drift: { "/guide/": [{}] } }, { lang })!.includes(one), `${lang} says "${one}"`);
    assert.ok(render({ drift: { "/guide/": [{}, {}] } }, { lang })!.includes(many), `${lang} says "${many}"`);
    assert.ok(
      render({ drift: { "/guide/": [{}] } }, { lang, options: { drift: { detailsUrl: "/drift/" } } })!.includes(
        stringsOf(lang).drift_details!,
      ),
      `${lang} localises the details link`,
    );
  }
});

/** The i18n key the banner uses for a count. */
function messageKey(n: number): "drift_finding" | "drift_findings" {
  return n === 1 ? "drift_finding" : "drift_findings";
}

test("style.css uses the warning accent on the inline start edge, so it moves under RTL", () => {
  assert.match(css, /\.drift-banner\s*\{[^}]*border-inline-start:\s*4px solid var\(--color-warning\)/);
  assert.match(css, /\.drift-banner\s*\{[^}]*padding-inline:\s*var\(--space-4\)/);
  assert.match(css, /\.drift-banner\s*\{[^}]*margin-block:/);
});

test("style.css uses logical properties only", () => {
  assert.doesNotMatch(css, /\b(margin|padding|border)-(left|right)\b/);
  assert.doesNotMatch(css, /\b(margin|padding|border)-(top|bottom)\b/);
  assert.doesNotMatch(css, /\b(left|right|top|bottom):/);
});

test("style.css uses only token names from tokens/names.json", () => {
  const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0, "expected token var() references");
  const unknown = [...new Set(used)].filter((name) => !tokenNames.has(name.slice(2)));
  assert.deepEqual(unknown, []);
});
