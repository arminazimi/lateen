import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps, Site } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import driftBanner, {
  CLASS,
  DETAILS_CLASS,
  ICONS,
  SEVERITIES,
  STATES,
  STATE_KEYS,
  WHAT_KEYS,
  detailsHrefOf,
  evidenceOf,
  findingsOf,
  messageOf,
  pagesOf,
  whatOf,
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
  assert.deepEqual([...STATES], ["drifting", "stale", "unavailable"]);
  assert.deepEqual([...SEVERITIES], ["error", "warning", "info", "unknown"]);
});

test("renders nothing when the site has no drift data", () => {
  assert.equal(render({}), null);
  assert.equal(render({ drift: undefined }), null);
  assert.equal(render({ drift: null }), null);
  assert.equal(render({ drift: "not a map" }), null);
  assert.equal(render({ drift: [] }), null);
});

test("renders nothing when the page is clean, missing, or has a value that is not a list", () => {
  assert.equal(render({ drift: {} }), null);
  assert.equal(render({ drift: { "/other/": [{}] } }), null);
  assert.equal(render({ drift: { "/guide/": [] } }), null);
  assert.equal(render({ drift: { "/guide/": "not a list" } }), null);
  assert.equal(render({ drift: { "/guide/": { findings: 0 } } }), null);
});

test("a finding that names code is drifting, with the count and the next step", () => {
  const out = render({ drift: { "/guide/": [{ kind: "drift.missing-symbol", severity: "error" }] } });
  assert.ok(out);
  assert.match(out, new RegExp(`<aside class="${CLASS} ${CLASS}-drifting"`));
  assert.match(out, /role="note"/);
  assert.match(out, /aria-label="Drift"/);
  assert.match(out, /data-drift-state="drifting"/);
  assert.match(out, /data-drift-severity="error"/);
  assert.match(out, /<svg class="drift-banner-icon"[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(out, /<strong class="drift-banner-label">Drift<\/strong>/);
  assert.match(out, /<span class="drift-banner-message">1 drift finding<\/span>/);
  assert.match(out, /<span class="drift-banner-what">This page cites code that has changed\.<\/span>/);
  assert.doesNotMatch(out, /role="alert"|<h[1-6]/, "the banner is a note, not an alert or a heading");
});

test("findings that only describe the page are stale, not drifting", () => {
  const out = render({ drift: { "/guide/": [{ message: "The option was renamed.", line: 42 }] } });
  assert.ok(out);
  assert.match(out, new RegExp(`class="${CLASS} ${CLASS}-stale"`));
  assert.match(out, /aria-label="Stale"/);
  assert.match(out, /data-drift-state="stale"/);
  assert.match(out, /data-drift-severity="warning"/);
  assert.match(out, /<strong class="drift-banner-label">Stale<\/strong>/);
  assert.match(out, /<span class="drift-banner-what">This page may be out of date\.<\/span>/);
});

test("the severity is the worst finding's, and a missing or unknown one reads as warning", () => {
  const severity = (findings: unknown[]) => evidenceOf(siteOf({ drift: { "/guide/": findings } }), "/guide/")!.severity;
  assert.equal(severity([{ kind: "drift.missing-file", severity: "info" }]), "info");
  assert.equal(severity([{ kind: "drift.missing-file", severity: "info" }, { kind: "drift.moved-symbol", severity: "warning" }]), "warning");
  assert.equal(severity([{ kind: "drift.missing-file", severity: "warning" }, { kind: "drift.moved-symbol", severity: "error" }]), "error");
  assert.equal(severity([{ kind: "drift.missing-file", severity: "fatal" }]), "warning");
  assert.equal(severity([{ kind: "drift.missing-file" }]), "warning");
});

test("an explicit unavailable marker is its own state, never healthy", () => {
  for (const marker of [null, { unavailable: true }]) {
    const out = render({ drift: { "/guide/": marker } });
    assert.ok(out, `${JSON.stringify(marker)} renders`);
    assert.match(out, new RegExp(`class="${CLASS} ${CLASS}-unavailable"`));
    assert.match(out, /aria-label="Not checked"/);
    assert.match(out, /data-drift-state="unavailable"/);
    assert.match(out, /data-drift-severity="unknown"/);
    assert.match(out, /<strong class="drift-banner-label">Not checked<\/strong>/);
    assert.doesNotMatch(out, /drift-banner-message/, "an unchecked page has no finding count");
    assert.match(out, /<span class="drift-banner-what">Drift has not been checked for this page\.<\/span>/);
  }
});

test("each state has its own icon, so shape carries the meaning too", () => {
  const shapes = new Set<string>();
  for (const state of STATES) {
    const shape = ICONS[state].join("|");
    assert.ok(!shapes.has(shape), `${state} has its own icon shape`);
    shapes.add(shape);
  }
  assert.ok(render({ drift: { "/guide/": [{ kind: "drift.missing-file" }] } })!.includes("<svg"));
  assert.ok(render({ drift: { "/guide/": [{ message: "x" }] } })!.includes("<svg"));
  assert.ok(render({ drift: { "/guide/": null } })!.includes("<svg"));
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

test("the unavailable state offers the same details link as a finding does", () => {
  const out = render({ drift: { "/guide/": null } }, { options: { drift: { detailsUrl: "/drift/" } } });
  assert.ok(out);
  assert.match(out, /<a class="drift-banner-details" href="\/drift\/">View drift details<\/a>/);
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

test("the state label, count, and next step follow the page language", () => {
  const cases: ReadonlyArray<readonly [unknown, (typeof STATES)[number]]> = [
    [[{ kind: "drift.missing-file" }], "drifting"],
    [[{ message: "x" }], "stale"],
    [null, "unavailable"],
  ];
  for (const lang of ["en", "fa", "ar"] as const) {
    const strings = stringsOf(lang);
    for (const state of STATES) {
      assert.equal(whatOf(lang, state), strings[WHAT_KEYS[state]]!, `${lang} ${state} says what changed`);
    }
    for (const [entry, state] of cases) {
      const out = render({ drift: { "/guide/": entry } }, { lang });
      assert.ok(out, `${lang} ${state} renders`);
      const label = strings[STATE_KEYS[state]]!;
      assert.ok(out.includes(`<strong class="drift-banner-label">${label}</strong>`), `${lang} ${state} says "${label}"`);
      assert.ok(out.includes(`aria-label="${label}"`), `${lang} ${state} is named "${label}"`);
      assert.ok(out.includes(strings[WHAT_KEYS[state]]!), `${lang} ${state} says what happens next`);
    }
    const one = render({ drift: { "/guide/": [{ message: "x" }] } }, { lang })!;
    const many = render({ drift: { "/guide/": [{ message: "x" }, { message: "y" }] } }, { lang })!;
    assert.equal(messageOf(lang, 1), strings.drift_finding!.replace("{n}", "1"));
    assert.equal(messageOf(lang, 2), strings.drift_findings!.replace("{n}", "2"));
    assert.ok(one.includes(strings.drift_finding!.replace("{n}", "1")), `${lang} counts one`);
    assert.ok(many.includes(strings.drift_findings!.replace("{n}", "2")), `${lang} counts many`);
    assert.ok(
      render({ drift: { "/guide/": [{}] } }, { lang, options: { drift: { detailsUrl: "/drift/" } } })!.includes(
        strings.drift_details!,
      ),
      `${lang} localises the details link`,
    );
  }
});

test("style.css colours each severity from a token, and keeps unavailable apart with a dashed edge", () => {
  const expected: Record<string, string> = {
    error: "--color-danger",
    warning: "--color-warning",
    info: "--color-info",
  };
  for (const [severity, token] of Object.entries(expected)) {
    assert.match(
      css,
      new RegExp(`\\.drift-banner\\[data-drift-severity="${severity}"\\]\\s*\\{[^}]*border-inline-start-color:\\s*var\\(${token}\\)`),
      `${severity} uses var(${token})`,
    );
    assert.ok(tokenNames.has(token.slice(2)), `${token} is a token`);
  }
  assert.match(css, /\.drift-banner\[data-drift-severity="unknown"\]\s*\{[^}]*border-inline-start-style:\s*dashed/);
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
