// Trust and freshness are one design-system story: a page's confidence, its drift, its version
// changes, its example runs, and its recency must read as the same vocabulary on the same page.
// This test renders all five surfaces for one page, then holds the shared state words, the semantic
// tokens, the presentation contracts, and the accessible names together. It adds no shared helper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ChromeProps, ComponentProps, Page, Site } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf, t } from "../i18n/index.ts";
import trustPanel, { ICONS as TRUST_ICONS, LEVELS } from "../components/trust-panel/index.ts";
import driftBanner, {
  ICONS as DRIFT_ICONS,
  STATES as DRIFT_STATES,
  STATE_KEYS as DRIFT_STATE_KEYS,
  WHAT_KEYS as DRIFT_WHAT_KEYS,
} from "../components/drift-banner/index.ts";
import versionDiff, { STATES as DIFF_STATES, type VersionDiffProps } from "../components/version-diff/index.ts";
import testedChip, { ICONS as TESTED_ICONS, STATES as TESTED_STATES, type TestedChipProps } from "../components/tested-chip/index.ts";
import lastUpdated from "../chrome/last-updated/index.ts";

const PAGE_URL = "/guide/install/";
const EN = stringsOf("en");

/** A site with the data, theme options, and base the components read. */
function siteOf(data: Record<string, unknown>, options: Record<string, unknown> = {}, base = ""): Site {
  return { config: { base, theme: { options } }, pages: [], nav: {}, data } as unknown as Site;
}

/** A page with the fields the five surfaces read. */
function pageOf(overrides: Partial<Page> = {}): Page {
  return {
    url: PAGE_URL,
    source: { file: "guide/install.md", line: 1, column: 1, endLine: 1, endColumn: 1 },
    frontMatter: {},
    title: "Install",
    lang: "en",
    dir: "ltr",
    headings: [],
    html: "",
    markdown: "",
    kind: "doc",
    ...overrides,
  };
}

/** Render a returned node, treating `null` as the empty string so the other surfaces still run. */
function markup(node: unknown): string {
  return node === null || node === undefined ? "" : renderToString(node as never);
}

type Evidence = {
  readonly trust: string;
  readonly drift: string;
  readonly version: string;
  readonly tested: string;
  readonly updated: string;
  /** All five surfaces as one page's evidence. */
  readonly html: string;
};

type RenderOptions = {
  readonly diff?: VersionDiffProps;
  readonly chip?: TestedChipProps;
  readonly page?: Partial<Page>;
  readonly options?: Record<string, unknown>;
  readonly base?: string;
};

/** Render all five evidence surfaces for the same page, the way the layouts place them. */
function renderEvidence(data: Record<string, unknown>, options: RenderOptions = {}): Evidence {
  const { diff = {}, chip = {}, page: pageOverrides = {}, options: themeOptions = {}, base = "" } = options;
  const page = pageOf(pageOverrides);
  const site = siteOf(data, themeOptions, base);
  const componentProps = (props: Record<string, unknown> = {}) =>
    ({ props, html: "", page, site }) as unknown as ComponentProps;
  const chromeProps = { site, page, trail: [], pager: {} } as unknown as ChromeProps;

  const trust = markup(trustPanel(componentProps()));
  const drift = markup(driftBanner(componentProps()));
  const version = markup(versionDiff({ props: diff, html: "", page, site } as unknown as ComponentProps<VersionDiffProps>));
  const tested = markup(testedChip({ props: chip, html: "", page, site } as unknown as ComponentProps<TestedChipProps>));
  const updated = markup(lastUpdated(chromeProps));

  return { trust, drift, version, tested, updated, html: [trust, drift, version, tested, updated].join("\n") };
}

/** A version comparison with the given change list. */
function diffWith(changes: unknown[], from = "v1", to = "v2"): VersionDiffProps {
  return { data: JSON.stringify({ from, to, changes }) };
}

/** Every `<svg ...>` opening tag in rendered markup. */
function iconsOf(html: string): string[] {
  return [...html.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);
}

/** Every selector a `display: none` rule names in a stylesheet, comments stripped. */
function hiddenSelectors(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => /display\s*:\s*none/.test(match[2] ?? ""))
    .flatMap((match) => (match[1] ?? "").split(",").map((selector) => selector.trim()));
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const trustCss = readFileSync(new URL("../components/trust-panel/style.css", import.meta.url), "utf8");
const driftCss = readFileSync(new URL("../components/drift-banner/style.css", import.meta.url), "utf8");
const versionCss = readFileSync(new URL("../components/version-diff/style.css", import.meta.url), "utf8");
const testedCss = readFileSync(new URL("../components/tested-chip/style.css", import.meta.url), "utf8");
const updatedCss = readFileSync(new URL("../chrome/last-updated/style.css", import.meta.url), "utf8");
const evidenceStyles = { trust: trustCss, drift: driftCss, version: versionCss, tested: testedCss, updated: updatedCss } as const;

const printCss = readFileSync(new URL("../styles/print.css", import.meta.url), "utf8");
const forcedColorsCss = readFileSync(new URL("../styles/forced-colors.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
const rtlCss = readFileSync(new URL("../styles/rtl.css", import.meta.url), "utf8");

const COMBINED_DATA = {
  trust: {
    [PAGE_URL]: { level: "partial" },
  },
  examples: { [PAGE_URL]: { passed: 2, failed: 0, total: 4 } },
  drift: { [PAGE_URL]: [{ message: "The option was renamed." }] },
  build: { date: "2026-03-06" },
  reviewers: { [PAGE_URL]: { date: "2026-03-04" } },
};

const COMBINED_PAGE = { frontMatter: { last_modified_at: "2026-03-04" } };
const COMBINED_DIFF = diffWith([
  { kind: "added", title: "Retries" },
  { kind: "bogus", title: "Unreadable entry" },
]);

test("one page renders trust, drift, version, tested, and recency evidence together without hiding a state", () => {
  const out = renderEvidence(COMBINED_DATA, { diff: COMBINED_DIFF, page: COMBINED_PAGE });

  // Each surface is present, with its machine state, not replaced by another.
  assert.match(out.trust, /^<details class="trust-panel trust-panel-partial" data-trust-panel data-trust-level="partial"/);
  assert.match(out.drift, /^<aside class="drift-banner drift-banner-stale" role="note" aria-label="Stale" data-drift-state="stale"/);
  assert.match(out.version, /^<section class="version-diff"[^>]*data-diff-state="incomplete"/);
  assert.match(out.tested, /^<span class="tested-chip tested-chip-partial" role="note"/);
  assert.match(out.updated, /^<p class="last-updated"><span class="last-updated-date" data-date-source="source" data-date-status="valid">/);

  // No root is hidden when the others are present.
  for (const root of [
    /^<details\b[^>]*>/,
    /^<aside\b[^>]*>/,
    /^<section\b[^>]*>/,
    /^<span class="tested-chip\b[^>]*>/,
    /^<p class="last-updated\b[^>]*>/,
  ]) {
    const opening = root.exec(out.html.split("\n").find((part) => root.test(part)) ?? "");
    assert.ok(opening, `${root} is present`);
    assert.doesNotMatch(opening![0], /\shidden(?:\s|>|=)/, `${root} is not hidden`);
  }

  // Every state is written in visible text, from the shared catalog, not left to colour.
  assert.ok(out.trust.includes(`<span class="trust-panel-level">Trust: ${EN.trust_level_partial!}</span>`));
  assert.ok(out.trust.includes(EN.trust_why_partial!));
  assert.ok(out.drift.includes(`<strong class="drift-banner-label">${EN.drift_state_stale!}</strong>`));
  assert.ok(out.drift.includes(`<span class="drift-banner-what">${EN.drift_what_content!}</span>`));
  assert.ok(out.version.includes(`<span class="version-diff-note-label">${EN.partial!}</span>`));
  assert.ok(out.version.includes(t("en", "version_diff_incomplete", { usable: 1, dropped: 1 })));
  assert.ok(out.tested.includes(`<span class="tested-chip-label">${EN.tested_partial!}</span>`));
  assert.ok(out.tested.includes(`<span class="tested-chip-count tested-chip-count-not-run">${EN.tested_not_run!.replace("{n}", "2")}</span>`));
  assert.ok(out.updated.includes(`${EN.updated!} `));
  assert.ok(out.updated.includes("<bdi>2 days ago</bdi>"), "the recency stays visible, not only in a title");
  assert.ok(out.trust.includes("2 of 4 examples passed, 2 not run"), "the trust panel carries the same example evidence");

  // The combination keeps every machine state distinct.
  for (const marker of [
    'data-trust-level="partial"',
    'data-drift-state="stale"',
    'data-diff-state="incomplete"',
    'class="tested-chip tested-chip-partial"',
    'data-date-status="valid"',
  ]) {
    assert.ok(out.html.includes(marker), marker);
  }

  // The same combined state reads in every shipped catalog, so the words are the shared i18n keys.
  for (const lang of ["fa", "ar"] as const) {
    const local = stringsOf(lang);
    const translated = renderEvidence(COMBINED_DATA, {
      diff: COMBINED_DIFF,
      page: { ...COMBINED_PAGE, lang, dir: "rtl" },
    });
    assert.ok(translated.trust.includes(local.trust_level_partial!), `${lang} trust level`);
    assert.ok(translated.trust.includes(local.trust_why_partial!), `${lang} trust explanation`);
    assert.ok(translated.drift.includes(local.drift_state_stale!), `${lang} drift state`);
    assert.ok(translated.version.includes(local.partial!), `${lang} diff state`);
    assert.ok(translated.tested.includes(local.tested_partial!), `${lang} tested state`);
    assert.ok(translated.updated.includes(local.updated!), `${lang} recency label`);
  }
});

test("every state names its meaning in visible text, and every icon that repeats it is aria-hidden", () => {
  // Trust: four levels, four texts, four shapes.
  for (const [state, key] of [
    ["verified", "trust_level_verified"],
    ["partial", "trust_level_partial"],
    ["unreviewed", "trust_level_unreviewed"],
    ["unknown", "trust_level_unknown"],
  ] as const) {
    const out = renderEvidence({ trust: { [PAGE_URL]: { level: state } } }).trust;
    assert.match(out, new RegExp(`class="trust-panel trust-panel-${state}"`));
    assert.ok(out.includes(`<span class="trust-panel-level">Trust: ${EN[key]!}</span>`), state);
    assert.doesNotMatch(out, /\stitle=/, `${state} has no title-only state`);
    for (const icon of iconsOf(out)) {
      assert.match(icon, /aria-hidden="true"/, `${state} icon is decorative`);
      assert.match(icon, /focusable="false"/, `${state} icon is not focusable`);
      assert.match(icon, /stroke="currentColor"/, `${state} icon follows the text colour`);
    }
  }
  assert.equal(new Set(LEVELS.map((state) => TRUST_ICONS[state].join("|"))).size, LEVELS.length);

  // Drift: three states, three labels, three shapes; the label is also the accessible name.
  const driftData: Record<string, unknown> = {
    drifting: [{ kind: "drift.missing-file" }],
    stale: [{ message: "The option was renamed." }],
    unavailable: null,
  };
  for (const state of DRIFT_STATES) {
    const out = renderEvidence({ drift: { [PAGE_URL]: driftData[state] } }).drift;
    const label = EN[DRIFT_STATE_KEYS[state]]!;
    assert.match(out, new RegExp(`class="drift-banner drift-banner-${state}"`));
    assert.match(out, new RegExp(`aria-label="${label}"`));
    assert.ok(out.includes(`<strong class="drift-banner-label">${label}</strong>`), state);
    assert.ok(out.includes(EN[DRIFT_WHAT_KEYS[state]]!), `${state} says what it means`);
    assert.doesNotMatch(out, /\stitle=/, `${state} has no title-only state`);
    for (const icon of iconsOf(out)) {
      assert.match(icon, /aria-hidden="true"/, `${state} icon is decorative`);
      assert.match(icon, /focusable="false"/, `${state} icon is not focusable`);
    }
  }
  assert.equal(new Set(DRIFT_STATES.map((state) => DRIFT_ICONS[state].join("|"))).size, DRIFT_STATES.length);

  // Version: four comparison states, each with words; a kind icon repeats its written label.
  const diffCases: ReadonlyArray<readonly [string, VersionDiffProps, string]> = [
    ["changes", diffWith([{ kind: "added", title: "Retries" }]), EN.version_diff_added!],
    ["incomplete", COMBINED_DIFF, EN.partial!],
    ["unchanged", diffWith([]), EN.version_diff_count!.replace("{current}", "0").replace("{total}", "0")],
    ["unavailable", { data: "{" }, EN.drift_state_unavailable!],
  ];
  for (const [state, props, text] of diffCases) {
    const out = renderEvidence({}, { diff: props }).version;
    assert.match(out, new RegExp(`data-diff-state="${state}"`), state);
    assert.ok(out.includes(text), `${state} says ${JSON.stringify(text)}`);
    assert.doesNotMatch(out, /\stitle=/, `${state} has no title-only state`);
    for (const icon of iconsOf(out)) {
      assert.match(icon, /aria-hidden="true"/, `${state} icon is decorative`);
      assert.match(icon, /focusable="false"/, `${state} icon is not focusable`);
    }
  }
  assert.deepEqual([...DIFF_STATES], ["changes", "incomplete", "unchanged", "unavailable"]);

  // Tested: five states, each with its own visible label/count pair and its own icon shape.
  const chipCases: ReadonlyArray<readonly [string, TestedChipProps, string[]]> = [
    ["passed", { passed: 2, failed: 0 }, [`${EN.tested!}`, EN.tested_passed!.replace("{n}", "2")]],
    ["partial", { passed: 2, failed: 0, total: 3 }, [EN.tested_partial!, EN.tested_not_run!.replace("{n}", "1")]],
    ["unrun", { total: 3 }, [EN.tested!, EN.tested_not_run!.replace("{n}", "3")]],
    ["failed", { passed: 1, failed: 1 }, [EN.tested!, EN.tested_failed!.replace("{n}", "1")]],
    ["unavailable", { passed: "two", failed: 0 }, [EN.trust_level_unknown!]],
  ];
  for (const [state, props, texts] of chipCases) {
    const out = renderEvidence({}, { chip: props }).tested;
    assert.match(out, new RegExp(`class="tested-chip tested-chip-${state}"`), state);
    assert.match(out, /role="note"/, state);
    assert.doesNotMatch(out, /\stitle=/, `${state} has no title-only state`);
    for (const text of texts) assert.ok(out.includes(text), `${state} says ${JSON.stringify(text)}`);
    for (const icon of iconsOf(out)) {
      assert.match(icon, /aria-hidden="true"/, `${state} icon is decorative`);
      assert.match(icon, /focusable="false"/, `${state} icon is not focusable`);
    }
  }
  assert.deepEqual([...TESTED_STATES], ["passed", "partial", "unrun", "failed", "unavailable"]);
  assert.equal(new Set(TESTED_STATES.map((state) => TESTED_ICONS[state].join("|"))).size, TESTED_STATES.length);

  // Recency: the visible label and the visible date carry the state; the title is an extra, not the state.
  const recency = renderEvidence({ build: { date: "2026-03-06" } }, { page: COMBINED_PAGE }).updated;
  assert.ok(recency.includes(`${EN.updated!} `));
  assert.ok(recency.includes("<bdi>2 days ago</bdi>"));
  assert.match(recency, /<time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026">/);
});

test("an explicitly unknown or unavailable value still renders unknown, never a success", () => {
  const out = renderEvidence(
    {
      trust: { [PAGE_URL]: { level: "not-a-level" } },
      examples: { [PAGE_URL]: { passed: "two", failed: 0 } },
      drift: { [PAGE_URL]: null },
      build: { date: "2026-03-06" },
    },
    { diff: { data: "{" }, page: { frontMatter: { last_modified_at: "2026-02-30" } } },
  );

  assert.match(out.trust, /data-trust-level="unknown"/);
  assert.match(out.trust, /data-trust-evidence="invalid"/);
  assert.ok(out.trust.includes(EN.trust_level_unknown!));
  assert.ok(out.trust.includes(EN.trust_why_unknown!));
  assert.doesNotMatch(out.trust, new RegExp(EN.trust_level_verified!));

  assert.match(out.drift, /data-drift-state="unavailable"/);
  assert.ok(out.drift.includes(`<strong class="drift-banner-label">${EN.drift_state_unavailable!}</strong>`));
  assert.doesNotMatch(out.drift, /drift-banner-message/, "an unchecked page claims no finding count");

  assert.match(out.version, /data-diff-state="unavailable"/);
  assert.ok(out.version.includes(EN.drift_state_unavailable!));

  assert.match(out.tested, /class="tested-chip tested-chip-unavailable"/);
  assert.ok(out.tested.includes(`<span class="tested-chip-label">${EN.trust_level_unknown!}</span>`));
  assert.doesNotMatch(out.tested, /data-passed=|data-failed=|data-total=|tested-chip-passed|tested-chip-failed/);

  assert.match(out.updated, /data-date-status="invalid"/);
  assert.ok(out.updated.includes(EN.changelog_date_unknown!));
  assert.doesNotMatch(out.updated, /<time|datetime=|Updated|2026-02-30/);

  // Nothing in the combined state rounds an unknown value up to a healthy claim.
  assert.doesNotMatch(out.html, /data-trust-level="verified"|data-drift-state="drifting"|data-diff-state="changes"|tested-chip-passed/);
});

test("every evidence stylesheet reads the shared semantic tokens, and tokens/names.json defines them", () => {
  const semantic = [
    "--color-success",
    "--color-warning",
    "--color-danger",
    "--color-info",
    "--color-muted",
    "--color-border",
    "--state-focus-ring",
  ];
  const used = new Set<string>();

  for (const [surface, css] of Object.entries(evidenceStyles)) {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${surface} has no raw hex colour`);
    assert.doesNotMatch(css, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i, `${surface} has no raw colour function`);

    const refs = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
    assert.ok(refs.length > 0, `${surface} reads tokens`);
    for (const ref of refs) {
      used.add(ref);
      assert.ok(tokenNames.has(ref.slice(2)), `${surface} reads unknown token ${ref}`);
    }
    assert.ok(
      semantic.some((token) => refs.includes(token)),
      `${surface} reads at least one shared semantic colour or state token`,
    );
  }

  // The whole evidence family covers the semantic vocabulary; no surface invents its own colours.
  for (const token of semantic) assert.ok(used.has(token), `the evidence stylesheets use ${token}`);

  const color = (names.color ?? {}) as Record<string, { readonly $value?: unknown; readonly $extensions?: { readonly lateen?: { readonly dark?: unknown } } }>;
  for (const name of ["success", "warning", "danger", "info", "muted", "border"]) {
    const definition = color[name];
    assert.ok(definition, `tokens/names.json defines color.${name}`);
    assert.equal(typeof definition.$value, "string", `color.${name} has a light value`);
    assert.equal(typeof definition.$extensions?.lateen?.dark, "string", `color.${name} has a dark value`);
  }
  const states = (names.state ?? {}) as Record<string, { readonly $value?: unknown; readonly $extensions?: { readonly lateen?: { readonly dark?: unknown } } }>;
  assert.equal(typeof states["focus-ring"]?.$value, "string", "state.focus-ring has a light value");
  assert.equal(typeof states["focus-ring"]?.$extensions?.lateen?.dark, "string", "state.focus-ring has a dark value");

  for (const token of semantic) {
    const name = token.slice(2);
    assert.match(tokensCss, new RegExp(`--${name}:\\s*light-dark\\(`), `styles/tokens.css builds ${token} from light and dark values`);
  }
});

test("dark mode comes from light-dark() and data-theme, not a second component palette", () => {
  assert.match(tokensCss, /--color-success:\s*light-dark\(/);
  assert.match(tokensCss, /--color-warning:\s*light-dark\(/);
  assert.match(tokensCss, /--color-danger:\s*light-dark\(/);
  assert.match(tokensCss, /--color-info:\s*light-dark\(/);
  assert.match(tokensCss, /--state-focus-ring:\s*light-dark\(/);
  assert.match(tokensCss, /:root\[data-theme="light"\]\s*\{/);
  assert.match(tokensCss, /:root\[data-theme="dark"\]\s*\{/);

  for (const [surface, css] of Object.entries(evidenceStyles)) {
    assert.doesNotMatch(css, /light-dark\(/i, `${surface} inherits the shared palette`);
    assert.doesNotMatch(css, /prefers-color-scheme/i, `${surface} adds no second colour scheme`);
    assert.doesNotMatch(css, /\[data-theme/i, `${surface} adds no second theme selector`);
    assert.doesNotMatch(css, /\b(?:background-color|color|border-color)\s*:\s*#[0-9a-f]/i, `${surface} has no literal palette`);
  }
});

test("print and forced colors keep every evidence surface legible and drop no state", () => {
  // Print: trust's floating disclosure prints in the article flow, and no evidence root is hidden.
  assert.match(printCss, /\.trust-panel-body\s*\{[^}]*position:\s*static/s);
  assert.match(printCss, /details:not\(\[open\]\)\s*>\s*:not\(summary\)\s*\{[^}]*display:\s*block\s*!important/s);
  for (const selector of [".trust-panel", ".trust-panel-body", ".drift-banner", ".tested-chip", ".version-diff", ".last-updated"]) {
    assert.ok(
      !hiddenSelectors(printCss).some((hidden) => hidden.includes(selector)),
      `print.css does not hide ${selector}`,
    );
  }

  // The version viewer owns the only screen-only evidence control, and its print rule removes it.
  assert.match(versionCss, /@media print\s*\{[^}]*\.version-diff-controls\s*\{[^}]*display:\s*none/s);
  assert.match(versionCss, /\.version-diff-marker\s*\{[^}]*font-weight:\s*var\(--type-weight-bold\)/s);
  assert.doesNotMatch(versionCss, /@media print\s*\{[^}]*\.version-diff-(list|note|state)\s*\{[^}]*display:\s*none/s);

  // Forced colors: no evidence text is hidden, icons stay on currentColor, and a focus ring is named.
  assert.doesNotMatch(forcedColorsCss, /display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(forcedColorsCss, /\bcontent\s*:/);
  assert.match(forcedColorsCss, /stroke:\s*currentColor/);
  assert.match(forcedColorsCss, /fill:\s*currentColor/);
  const focus = forcedColorsCss.match(/:is\([^)]*summary[^)]*\):focus-visible\s*\{[^}]*\}/s);
  assert.ok(focus, "the system focus ring covers the trust summary beside links and buttons");
  assert.match(focus![0], /outline-color:\s*Highlight/);

  // The rendered icons are line art on the text colour in every state, so the palette can replace it.
  const combined = renderEvidence(COMBINED_DATA, { diff: COMBINED_DIFF, page: COMBINED_PAGE }).html;
  const icons = iconsOf(combined);
  assert.ok(icons.length >= 4, "the combined page carries the evidence icons");
  for (const icon of icons) {
    assert.match(icon, /stroke="currentColor"/);
    assert.match(icon, /fill="none"/);
    assert.match(icon, /aria-hidden="true"/);
  }
});

test("the evidence stylesheets and the shared RTL layer use logical properties only", () => {
  const physical = [
    /\b(margin|padding|border)-(left|right)\b/,
    /\b(margin|padding|border)-(top|bottom)\b/,
    /(^|[;{\s])(left|right|top|bottom)\s*:/,
    /\btext-align\s*:\s*(left|right)\b/,
    /\bfloat\s*:\s*(left|right)\b/,
    /\bclear\s*:\s*(left|right)\b/,
  ];
  for (const [surface, css] of Object.entries({ ...evidenceStyles, rtl: rtlCss, print: printCss, forced: forcedColorsCss })) {
    for (const rule of physical) assert.doesNotMatch(css, rule, `${surface} uses logical properties`);
    assert.doesNotMatch(css, /\.([a-z-]+)-(left|right)\b/, `${surface} names no physical class edge`);
  }

  // The evidence surfaces put their edges on the logical inline start, so they move under RTL.
  assert.match(trustCss, /margin-inline-end:\s*var\(--space-2\)/);
  assert.match(driftCss, /border-inline-start:\s*4px solid var\(--color-border-strong\)/);
  assert.match(versionCss, /border-inline-start:\s*3px/);
  assert.match(testedCss, /padding-inline:\s*var\(--space-2\)/);
  assert.match(updatedCss, /margin-block:\s*0 var\(--space-4\)/);
});

test("the combined evidence exposes accessible names and roles, so it reads without colour", () => {
  const out = renderEvidence(COMBINED_DATA, { diff: COMBINED_DIFF, page: COMBINED_PAGE });

  // Trust is a native disclosure whose summary is its name; the level text is part of that name.
  assert.match(out.trust, /^<details\b[^>]*data-trust-level="partial"/);
  assert.match(out.trust, /<summary class="trust-panel-chip">/);
  assert.ok(out.trust.includes(`<span class="trust-panel-level">Trust: ${EN.trust_level_partial!}</span>`));

  // Drift is a note with an explicit accessible name, repeated in visible text.
  assert.match(out.drift, /role="note"/);
  assert.match(out.drift, new RegExp(`aria-label="${EN.drift_state_stale!}"`));

  // The chip is a note with its label written in text.
  assert.match(out.tested, /role="note"/);
  assert.ok(out.tested.includes(`<span class="tested-chip-label">${EN.tested_partial!}</span>`));

  // The diff is a labelled section; the incomplete note is its description and its controls have a group name.
  assert.match(out.version, /aria-labelledby="version-diff-title"/);
  assert.match(out.version, /<h2 class="version-diff-title" id="version-diff-title">/);
  assert.match(out.version, /aria-describedby="version-diff-note"/);
  assert.match(out.version, /id="version-diff-note"/);
  assert.match(out.version, new RegExp(`aria-label="${EN.version_diff_group!}"`));
  assert.match(out.version, new RegExp(`<button type="button" class="version-diff-previous"[^>]*>${EN.version_diff_previous!}</button>`));

  // Recency has a visible label and an exact accessible date.
  assert.ok(out.updated.includes(`${EN.updated!} `));
  assert.match(out.updated, /<time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026">/);

  // Decorative icons are out of the accessibility tree, never the only carrier of a state.
  for (const icon of iconsOf(out.html)) {
    assert.match(icon, /aria-hidden="true"/);
    assert.match(icon, /focusable="false"/);
  }
  assert.equal([...out.html.matchAll(/aria-hidden="true"/g)].length, iconsOf(out.html).length, "only the icons are hidden");
});
