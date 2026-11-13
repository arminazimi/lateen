import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps, Page, Site, SiteConfig } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { stringsOf } from "../i18n/index.ts";
import trustPanel, {
  ACTION_CLASS,
  ACTIONS_CLASS,
  BODY_CLASS,
  CHIP_CLASS,
  CLASS,
  EXAMPLES_CLASS,
  EXAMPLE_STATES,
  ICONS,
  LEVELS,
  actionHrefOf,
  driftFor,
  driftText,
  entryFor,
  entryOf,
  evidenceOf,
  examplesAttrs,
  examplesClassName,
  examplesFor,
  examplesText,
  levelOf,
  pagesOf,
  provenanceOf,
  reasonsOf,
  reviewerText,
  trustEvidenceFor,
  trustEvidenceOf,
  type ExampleState,
  type ExamplesEvidence,
  type TrustEvidence,
  type TrustPanelProps,
} from "../components/trust-panel/index.ts";
import {
  SUMMARY_SELECTOR,
  activate,
  closeOnEscape,
  type TrustEvent,
  type TrustPanelNode,
  type TrustSummary,
} from "../components/trust-panel/client.ts";
import { countsOf } from "../components/tested-chip/index.ts";

/** A site with the data, theme options, and base the component reads. */
function siteOf(data: Record<string, unknown>, options: Record<string, unknown> = {}, base = ""): Site {
  return { config: { base, theme: { options } }, pages: [], nav: {}, data } as unknown as Site;
}

/** A page with the fields the panel reads. */
function pageOf(overrides: Partial<Page> = {}): Page {
  return {
    url: "/guide/install/",
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

type RenderOptions = {
  readonly props?: TrustPanelProps;
  readonly lang?: string;
  readonly url?: string;
  readonly options?: Record<string, unknown>;
  readonly base?: string;
  readonly page?: Partial<Page>;
};

/** Render the panel the way the doc layout calls it: the site model and one page. */
function render(data: Record<string, unknown>, options: RenderOptions = {}): string | null {
  const { props = {}, lang = "en", url = "/guide/install/", options: themeOptions = {}, base = "", page } = options;
  const input = {
    props,
    html: "",
    page: pageOf({ url, lang, ...page }),
    site: siteOf(data, themeOptions, base),
  } as unknown as ComponentProps;
  const node = trustPanel(input);
  return node === null ? null : renderToString(node as never);
}

/** A trust entry for the default page. */
const entry = { level: "verified", reasons: ["All examples passed.", "No drift."], lastReviewer: "Ada" };

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/trust-panel/style.css", import.meta.url), "utf8");

test("default export is the trust panel component, and the class names are stable", () => {
  assert.equal(typeof trustPanel, "function");
  assert.equal(CLASS, "trust-panel");
  assert.equal(CHIP_CLASS, "trust-panel-chip");
  assert.equal(BODY_CLASS, "trust-panel-body");
});

test("renders nothing when the site has no trust entry for the page", () => {
  assert.equal(render({}), null);
  assert.equal(render({ trust: undefined }), null);
  assert.equal(render({ trust: null }), null);
  assert.equal(render({ trust: "not a map" }), null);
  assert.equal(render({ trust: [] }), null);
  assert.equal(render({ trust: { "/other/": entry } }), null);
  assert.equal(render({ trust: { pages: { "/other/": entry } } }), null);
});

test("a present but unreadable entry renders unknown invalid evidence instead of hiding", () => {
  for (const malformed of [
    {},
    { level: "maybe" },
    { level: 3 },
    { level: true },
    { level: "" },
    { level: "   " },
    { level: null },
    { level: [] },
    { level: {} },
    "verified",
    ["verified"],
    null,
    3,
    true,
  ]) {
    const out = render({ trust: { "/guide/install/": malformed } });
    assert.ok(out, JSON.stringify(malformed));
    assert.match(
      out,
      /^<details class="trust-panel trust-panel-unknown" data-trust-panel data-trust-level="unknown" data-trust-evidence="invalid">/,
      JSON.stringify(malformed),
    );
    assert.ok(out.includes(`<span class="trust-panel-level">Trust: ${stringsOf("en").trust_level_unknown}</span>`));
    assert.ok(out.includes(stringsOf("en").trust_why_unknown!));
    assert.doesNotMatch(out, /<dl/, "unreadable evidence supplies no rows");
  }

  assert.match(
    render({ trust: { pages: { "/guide/install/": { level: "nonsense" } } } })!,
    /data-trust-evidence="invalid"/,
    "the nested pages shape is read the same way",
  );
});

test("an unreadable entry inherits no examples, drift, reviewer, provenance, or action claims", () => {
  const out = render(
    {
      trust: {
        "/guide/install/": {
          level: "not-a-level",
          reasons: "All examples passed.",
          lastReviewer: "Ada",
          buildId: "build-1",
          generatedAt: "2026-03-06",
          reviewedAt: "2026-03-04",
        },
      },
      examples: { "/guide/install/": { passed: 9, failed: 0 } },
      drift: { "/guide/install/": [] },
      build: { id: "build-1", generatedAt: "2026-03-06" },
      reviewers: { "/guide/install/": { date: "2026-03-04" } },
    },
    {
      options: {
        trust: {
          contextPackUrl: "https://example.com/context?page={url}",
          suggestEditUrl: "/edit?source={source}",
        },
      },
      base: "/docs",
    },
  );
  assert.ok(out);
  assert.match(out, /data-trust-level="unknown"/);
  assert.match(out, /data-trust-evidence="invalid"/);
  assert.doesNotMatch(out, /trust-panel-examples|data-trust-examples=/);
  assert.doesNotMatch(out, /trust-panel-drift|>Drift<\/dt>/);
  assert.doesNotMatch(out, /trust-panel-reviewer|Reviewed by Ada/);
  assert.doesNotMatch(out, /data-trust-build=|data-trust-generated=|data-trust-reviewed=/);
  assert.doesNotMatch(out, /<time /);
  assert.doesNotMatch(out, /trust-panel-actions|trust-panel-action/);
  assert.doesNotMatch(out, /All examples passed/, "a written reason is not inherited");
});

test("a manual panel with an unreadable level renders the same invalid unknown evidence", () => {
  const out = render(
    {
      trust: { "/guide/install/": entry },
      examples: { "/guide/install/": { passed: 9, failed: 0 } },
      build: { id: "build-1", generatedAt: "2026-03-06" },
    },
    { props: { level: "maybe", reasons: "Manual claim", lastReviewer: "Bo", buildId: "build-1" } },
  );
  assert.ok(out);
  assert.match(out, /data-trust-evidence="invalid"/);
  assert.match(out, /data-trust-level="unknown"/);
  assert.doesNotMatch(out, /data-trust-examples=/);
  assert.doesNotMatch(out, /Manual claim|Reviewed by Bo/);
  assert.doesNotMatch(out, /data-trust-build=/);
});

test("valid entries keep their rows and are never marked invalid", () => {
  for (const level of [...LEVELS, "review due", "at risk"]) {
    const out = render({
      trust: { "/guide/install/": { level, reasons: "Custom reason." } },
      examples: { "/guide/install/": { passed: 1, failed: 0, total: 2 } },
    });
    assert.ok(out, level);
    assert.doesNotMatch(out, /data-trust-evidence=/, level);
    assert.match(out, new RegExp(`data-trust-level="(?:${LEVELS.join("|")})"`), level);
    assert.ok(out.includes("Custom reason."), `${level} keeps its written reason`);
    assert.match(out, /data-trust-examples="partial"/, `${level} keeps partial example evidence`);
  }
});

test("the invalid-evidence explanation is localised and non-claiming in every language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const strings = stringsOf(lang);
    const out = render({ trust: { "/guide/install/": { level: "not-a-level" } } }, { lang });
    assert.ok(out, lang);
    assert.ok(out.includes(strings.trust_level_unknown!), `${lang} names the unknown level`);
    assert.ok(out.includes(`<li>${strings.trust_why_unknown}</li>`), `${lang} uses the unknown explanation`);
    assert.ok(out.includes(strings.trust_reasons!), `${lang} labels the explanation`);
    assert.ok(!out.includes(strings.trust_level_verified!), `${lang} never claims verified`);
    assert.ok(!out.includes(strings.trust_level_partial!), `${lang} never claims partial`);
  }
});

test("the chip shows the level, its icon, and the native disclosure controls", () => {
  const out = render({ trust: { "/guide/install/": entry } });
  assert.ok(out);
  assert.match(out, /^<details class="trust-panel trust-panel-verified" data-trust-panel data-trust-level="verified">/);
  assert.match(out, /<summary class="trust-panel-chip"><svg class="trust-panel-icon"/);
  assert.match(out, /<span class="trust-panel-level">Trust: Verified<\/span>/);
  assert.match(out, /<div class="trust-panel-body">/);
  assert.match(out, /<\/summary><div class="trust-panel-body">/, "the panel follows the summary inside the details");
});

test("all four states render their own label and shape, so colour is never the only signal", () => {
  assert.deepEqual([...LEVELS], ["verified", "partial", "unreviewed", "unknown"]);
  for (const [state, key] of [
    ["verified", "trust_level_verified"],
    ["partial", "trust_level_partial"],
    ["unreviewed", "trust_level_unreviewed"],
    ["unknown", "trust_level_unknown"],
  ] as const) {
    const out = render({ trust: { "/guide/install/": { level: state } } });
    assert.ok(out, state);
    assert.ok(out.includes(`<span class="trust-panel-level">Trust: ${stringsOf("en")[key]}</span>`), state);
    assert.match(out, new RegExp(`class="trust-panel trust-panel-${state}"`));
    assert.match(out, new RegExp(`data-trust-level="${state}"`));
  }
  const shapes = LEVELS.map((state) => ICONS[state].join("|"));
  assert.equal(new Set(shapes).size, LEVELS.length, "every state has its own icon shape");
});

test("an explicit unknown state renders and explains itself", () => {
  const out = render({ trust: { "/guide/install/": { level: "unknown" } } });
  assert.ok(out);
  assert.match(out, /data-trust-level="unknown"/);
  assert.ok(out.includes(stringsOf("en").trust_why_unknown!));
});

test("level words are matched without case, spaces, or underscores, and old names map to a state", () => {
  assert.equal(levelOf("Verified"), "verified");
  assert.equal(levelOf(" partial "), "partial");
  assert.equal(levelOf("UNREVIEWED"), "unreviewed");
  assert.equal(levelOf("unknown"), "unknown");
  assert.equal(levelOf(" review due "), "unreviewed");
  assert.equal(levelOf("REVIEW_DUE"), "unreviewed");
  assert.equal(levelOf("at_risk"), "partial");
  assert.equal(levelOf("maybe"), undefined);
  assert.equal(levelOf(3), undefined);
});

test("the panel shows examples, drift, and the last reviewer", () => {
  const out = render({
    trust: { "/guide/install/": entry },
    examples: { "/guide/install/": { passed: 3, failed: 1 } },
    drift: { "/guide/install/": [{}, {}] },
  });
  assert.ok(out);
  assert.match(
    out,
    /<dt class="trust-panel-label">Examples<\/dt><dd class="trust-panel-value trust-panel-examples trust-panel-examples-failed" data-trust-examples="failed" data-trust-examples-passed="3" data-trust-examples-failed="1" data-trust-examples-total="4">1 of 4 examples failed<\/dd>/,
  );
  assert.match(out, /<dt class="trust-panel-label">Drift<\/dt><dd class="trust-panel-value trust-panel-drift">2 drift findings<\/dd>/);
  assert.match(out, /<dt class="trust-panel-label">Last reviewer<\/dt><dd class="trust-panel-value trust-panel-reviewer">Reviewed by Ada<\/dd>/);
  assert.match(out, /<p class="trust-panel-reasons-label">Why this level<\/p><ul class="trust-panel-reasons"><li>All examples passed.<\/li><li>No drift.<\/li><\/ul>/);
});

test("the examples and drift rows say so when the data is missing, empty, or clean", () => {
  assert.match(
    render({ trust: { "/guide/install/": entry } })!,
    /trust-panel-examples trust-panel-examples-absent" data-trust-examples="absent">Not recorded<\/dd>/,
  );
  assert.match(render({ trust: { "/guide/install/": entry } })!, /trust-panel-drift">Not recorded<\/dd>/);
  assert.match(
    render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": {} } })!,
    /trust-panel-examples trust-panel-examples-none" data-trust-examples="none" data-trust-examples-passed="0" data-trust-examples-failed="0" data-trust-examples-total="0">No examples recorded<\/dd>/,
  );
  assert.match(
    render({ trust: { "/guide/install/": entry }, drift: { "/guide/install/": [] } })!,
    /trust-panel-drift">No drift findings<\/dd>/,
  );
  assert.match(
    render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": { passed: 3, failed: 0 } } })!,
    /trust-panel-examples trust-panel-examples-passed" data-trust-examples="passed" data-trust-examples-passed="3" data-trust-examples-failed="0" data-trust-examples-total="3">3 of 3 examples passed<\/dd>/,
  );
});

test("a report with unrun examples never reads as fully passed", () => {
  const partial = render({
    trust: { "/guide/install/": entry },
    examples: { "/guide/install/": { passed: 3, failed: 0, total: 5 } },
  });
  assert.ok(partial);
  assert.match(partial, /trust-panel-examples trust-panel-examples-partial" data-trust-examples="partial"/);
  assert.match(partial, /data-trust-examples-total="5"[^>]*>3 of 5 examples passed, 2 not run<\/dd>/);
  assert.match(partial, /data-trust-examples-unrun="2"/);
  assert.doesNotMatch(partial, /3 of 3 examples passed/, "unrun examples are never dropped to make a clean pass");
  assert.match(partial, /data-trust-level="verified"/, "the declared level is untouched by example evidence");

  const failedUnrun = render({
    trust: { "/guide/install/": entry },
    examples: { "/guide/install/": { passed: 3, failed: 1, total: 5 } },
  });
  assert.match(failedUnrun!, /data-trust-examples="failed"/);
  assert.match(failedUnrun!, /1 of 5 examples failed, 1 not run/);
});

test("a counted but unexecuted suite reads as unrun, not missing or empty", () => {
  const fromTotal = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": { total: 5 } } });
  assert.ok(fromTotal);
  assert.match(fromTotal, /data-trust-examples="unrun"/);
  assert.match(fromTotal, /data-trust-examples-unrun="5">5 not run<\/dd>/);
  assert.equal(examplesRowDd(fromTotal).text, "5 not run", "a counted unrun suite says so, not that nothing was recorded");

  const fromUnrun = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": { unrun: 2 } } });
  assert.match(fromUnrun!, /data-trust-examples="unrun"[^>]*>2 not run<\/dd>/);
});

/** The examples row's value element from a rendered panel: its class, its machine evidence, and its text. */
function examplesRowDd(out: string): { readonly cls: string; readonly attrs: string; readonly text: string } {
  const match = /<dd class="(trust-panel-value trust-panel-examples[^"]*)"([^>]*)>([^<]*)<\/dd>/.exec(out);
  assert.ok(match, "examples row dd");
  return { cls: match[1]!, attrs: match[2]!, text: match[3]! };
}

test("an explicit unrun count is consumed, and must agree with the total", () => {
  const consistent = render({
    trust: { "/guide/install/": entry },
    examples: { "/guide/install/": { passed: 2, failed: 0, total: 3, unrun: 1 } },
  });
  assert.match(consistent!, /data-trust-examples="partial"/);
  assert.match(consistent!, /2 of 3 examples passed, 1 not run/);

  for (const impossible of [
    { passed: 2, failed: 0, total: 5, unrun: 1 },
    { passed: 2, failed: 1, total: 2 },
    { passed: 2, failed: 1, total: 1 },
  ]) {
    const out = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": impossible } });
    assert.ok(out);
    assert.match(out, /data-trust-examples="invalid"/, JSON.stringify(impossible));
    const dd = examplesRowDd(out);
    assert.equal(dd.text, "Unknown", JSON.stringify(impossible));
    assert.ok(dd.cls.endsWith("trust-panel-examples-invalid"), JSON.stringify(impossible));
    assert.doesNotMatch(dd.attrs, /data-trust-examples-(passed|failed|total|unrun)=/, "impossible evidence exposes no counts");
    assert.match(out, /data-trust-level="verified"/, "an impossible report never changes the level");
  }
});

test("malformed evidence is invalid evidence, never zero-valued success", () => {
  for (const malformed of [
    { passed: "many", failed: 1 },
    { passed: -1 },
    { passed: 1.5 },
    { failed: "" },
    { passed: true },
    { total: [] },
    { passed: null },
    { passed: Number.MAX_SAFE_INTEGER + 1 },
    "verified",
    [3, 1],
    3,
  ]) {
    const out = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": malformed } });
    assert.ok(out);
    assert.match(out, /data-trust-examples="invalid"/, JSON.stringify(malformed));
    const dd = examplesRowDd(out);
    assert.equal(dd.text, "Unknown", JSON.stringify(malformed));
    assert.doesNotMatch(dd.attrs, /data-trust-examples-passed=/, "invalid evidence exposes no counts");
  }
});

test("the count contract is shared with tested-chip: null and unsafe integers are invalid, a valid report agrees", () => {
  for (const counts of [
    { passed: null, failed: 0 },
    { passed: Number.MAX_SAFE_INTEGER + 1, failed: 0 },
    { passed: "9007199254740992", failed: 0 },
  ]) {
    assert.deepEqual(evidenceOf(counts), { state: "invalid" }, JSON.stringify(counts));
    assert.equal(countsOf(counts)?.unavailable, true, `${JSON.stringify(counts)} is unavailable to the chip`);
  }

  const valid = { passed: 3, failed: 1 };
  assert.deepEqual(evidenceOf(valid), { state: "failed", passed: 3, failed: 1, total: 4 });
  const chip = countsOf(valid);
  assert.deepEqual({ passed: chip?.passed, failed: chip?.failed }, { passed: 3, failed: 1 });
  assert.equal(chip?.unavailable, undefined);
});

test("every evidence state reads and marks differently", () => {
  const data: Record<string, unknown> = {
    passed: { passed: 2, failed: 0 },
    partial: { passed: 2, failed: 0, total: 4 },
    unrun: { total: 4 },
    failed: { passed: 1, failed: 1 },
    none: {},
    invalid: { passed: "oops" },
    absent: undefined,
  };
  assert.deepEqual([...EXAMPLE_STATES], ["passed", "partial", "unrun", "failed", "none", "invalid", "absent"]);

  const texts = new Set<string>();
  const states = new Set<string>();
  for (const [state, counts] of Object.entries(data)) {
    const out = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": counts } });
    assert.ok(out, state);
    const match = /class="trust-panel-value (trust-panel-examples[^"]*)"[^>]*>([^<]*)<\/dd>/.exec(out);
    assert.ok(match, `${state} row`);
    assert.ok(match[1]!.endsWith(`trust-panel-examples-${state}`), `${state} class: ${match[1]}`);
    assert.equal(match[1], examplesClassName(state as ExampleState));
    texts.add(match[2]!);
    states.add(state);
    assert.match(out, new RegExp(`data-trust-examples="${state}"`));
  }
  assert.equal(states.size, EXAMPLE_STATES.length);
  assert.equal(texts.size, EXAMPLE_STATES.length, "no two evidence states share visible text");
});

test("example evidence never changes the declared level, in any state", () => {
  for (const level of LEVELS) {
    for (const counts of [{ passed: 2, failed: 0 }, { passed: 2, failed: 0, total: 4 }, { total: 4 }, { passed: "x" }, {}]) {
      const out = render({ trust: { "/guide/install/": { level } }, examples: { "/guide/install/": counts } });
      assert.ok(out);
      assert.match(out, new RegExp(`data-trust-level="${level}"`), `${level} with ${JSON.stringify(counts)}`);
      assert.match(out, new RegExp(`class="trust-panel trust-panel-${level}"`));
    }
  }
});

test("evidence states localize their row text", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const strings = stringsOf(lang);
    const notRun = strings.tested_not_run!.replace("{n}", "2");
    const cases: Array<readonly [ExamplesEvidence, string]> = [
      [evidenceOf({ passed: 2, failed: 0, total: 4 }), `${strings.trust_examples_passed!.replace("{passed}", "2").replace("{total}", "4")}, ${notRun}`],
      [evidenceOf({ passed: 1, failed: 1, total: 4 }), `${strings.trust_examples_failed!.replace("{failed}", "1").replace("{total}", "4")}, ${notRun}`],
      [evidenceOf({ passed: 2, failed: 0 }), strings.trust_examples_passed!.replace("{passed}", "2").replace("{total}", "2")],
      [evidenceOf({ total: 2 }), strings.tested_not_run!.replace("{n}", "2")],
      [evidenceOf({ passed: "x" }), strings.trust_level_unknown!],
      [evidenceOf({}), strings.trust_examples_none!],
      [{ state: "absent" }, strings.trust_not_recorded!],
    ];
    for (const [evidence, expected] of cases) {
      assert.equal(examplesText(lang, evidence), expected, `${lang}: ${evidence.state}`);
    }

    const out = render(
      { trust: { "/guide/install/": entry }, examples: { "/guide/install/": { passed: 2, failed: 0, total: 4 } } },
      { lang },
    );
    assert.ok(out!.includes(cases[0]![1]), `${lang} panel shows the localised partial row`);
  }
});

test("the evidence is in the static no-JS markup on the row itself", () => {
  const out = render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": { passed: 3, failed: 0, total: 5 } } });
  assert.ok(out);
  assert.match(out, /^<details[^>]*data-trust-panel/, "the disclosure and its rows are server-rendered");
  assert.doesNotMatch(out, /<script/);
  assert.match(out, /<summary class="trust-panel-chip">/);
  assert.match(out, /data-trust-examples="partial"[^>]*data-trust-examples-unrun="2"/);
});

test("examplesAttrs exposes counts only for readable evidence", () => {
  assert.deepEqual(examplesAttrs({ state: "absent" }), { "data-trust-examples": "absent" });
  assert.deepEqual(examplesAttrs({ state: "invalid" }), { "data-trust-examples": "invalid" });
  assert.deepEqual(examplesAttrs(evidenceOf({ passed: 2, failed: 0, total: 4 })), {
    "data-trust-examples": "partial",
    "data-trust-examples-passed": 2,
    "data-trust-examples-failed": 0,
    "data-trust-examples-total": 4,
    "data-trust-examples-unrun": 2,
  });
  assert.equal(examplesClassName("unrun"), "trust-panel-examples trust-panel-examples-unrun");
});

test("a page without a reviewer says so", () => {
  const out = render({ trust: { "/guide/install/": { level: "review due" } } });
  assert.match(out!, /trust-panel-reviewer">No reviewer recorded<\/dd>/);
});

test("the top-level and nested pages shapes are both accepted, and nested wins", () => {
  assert.deepEqual(pagesOf({ "/guide/install/": entry }), { "/guide/install/": entry });
  assert.deepEqual(pagesOf({ pages: { "/guide/install/": entry } }), { "/guide/install/": entry });

  const nested = render({ trust: { pages: { "/guide/install/": { level: "partial" } } } });
  assert.match(nested!, /data-trust-level="partial"/);

  const both = { pages: { "/guide/install/": { level: "verified" } }, "/guide/install/": { level: "partial" } };
  assert.equal(entryFor(siteOf({ trust: both }), "/guide/install/")?.level, "verified");
});

test("the evidence helpers separate absent, invalid, and valid entries", () => {
  const states: TrustEvidence[] = [trustEvidenceOf(undefined), trustEvidenceOf(null), trustEvidenceOf({ level: "verified" })];
  assert.deepEqual(states, [
    { state: "absent" },
    { state: "invalid" },
    { state: "valid", entry: { level: "verified", reasons: [] } },
  ]);

  for (const malformed of ["verified", [], 0, {}, { level: "maybe" }, { level: "  " }, { level: 1 }]) {
    assert.deepEqual(trustEvidenceOf(malformed), { state: "invalid" }, JSON.stringify(malformed));
    assert.equal(entryOf(malformed), undefined, JSON.stringify(malformed));
  }

  assert.deepEqual(trustEvidenceOf({ level: " at_risk ", reasons: "a|b", lastReviewer: "Ada" }), {
    state: "valid",
    entry: { level: "partial", reasons: ["a", "b"], lastReviewer: "Ada" },
  });

  const site = siteOf({
    trust: {
      "/guide/install/": { level: "maybe", reasons: "ignored" },
      "/valid/": { level: "review due", reasons: "Reviewed long ago." },
      "/nested/": null,
    },
  });
  assert.deepEqual(trustEvidenceFor(site, "/guide/install/"), { state: "invalid" });
  assert.deepEqual(trustEvidenceFor(site, "/valid/"), {
    state: "valid",
    entry: { level: "unreviewed", reasons: ["Reviewed long ago."] },
  });
  assert.deepEqual(trustEvidenceFor(site, "/nested/"), { state: "invalid" });
  assert.deepEqual(trustEvidenceFor(site, "/other/"), { state: "absent" });
  assert.deepEqual(trustEvidenceFor(site, undefined), { state: "absent" });
  assert.deepEqual(trustEvidenceFor(siteOf({}), "/guide/install/"), { state: "absent" });
  assert.equal(entryFor(site, "/guide/install/"), undefined);
  assert.equal(entryFor(site, "/valid/")?.level, "unreviewed");
});

test("the directive's props make a manual panel, and they win over the data", () => {
  const out = render(
    { trust: { "/guide/install/": entry } },
    { props: { level: "at risk", reasons: "First|Second", lastReviewer: "Bo" } },
  );
  assert.match(out!, /data-trust-level="partial"/);
  assert.match(out!, /<li>First<\/li><li>Second<\/li>/);
  assert.match(out!, /Reviewed by Bo/);
});

test("a state without reasons explains itself, and the explanation is localised", () => {
  for (const [state, key] of [
    ["verified", "trust_why_verified"],
    ["partial", "trust_why_partial"],
    ["unreviewed", "trust_why_unreviewed"],
    ["unknown", "trust_why_unknown"],
  ] as const) {
    for (const lang of ["en", "fa", "ar"] as const) {
      const out = render({ trust: { "/guide/install/": { level: state } } }, { lang });
      assert.ok(out, `${state}/${lang}`);
      assert.match(out, /<p class="trust-panel-reasons-label">/);
      assert.match(out, new RegExp(`<ul class="trust-panel-reasons"><li>${stringsOf(lang)[key]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</li></ul>`));
    }
  }
});

test("the action links come from theme.options.trust, under the site base", () => {
  const out = render(
    { trust: { "/guide/install/": entry } },
    {
      options: {
        trust: {
          contextPackUrl: "https://example.com/context?page={url}",
          suggestEditUrl: "/edit?source={source}&title={title}",
        },
      },
      base: "/docs",
    },
  );
  assert.ok(out);
  assert.match(out, /<div class="trust-panel-actions">/);
  assert.match(out, /<a class="trust-panel-action" href="https:\/\/example.com\/context\?page=\/guide\/install\/">Copy context pack<\/a>/);
  assert.match(out, /<a class="trust-panel-action" href="\/docs\/edit\?source=guide\/install.md&amp;title=Install">Suggest an edit<\/a>/);
  assert.match(out, new RegExp(`class="${ACTION_CLASS}"`));
  assert.match(out, new RegExp(ACTIONS_CLASS));
});

test("an action link is hidden when its option is absent, and unsafe URLs are dropped", () => {
  const none = render({ trust: { "/guide/install/": entry } });
  assert.doesNotMatch(none!, /trust-panel-actions/);
  assert.doesNotMatch(none!, /trust-panel-action/);

  for (const unsafe of ["javascript:alert(1)", "//evil.example/path", "relative/page", " http://example.com/ "]) {
    const out = render({ trust: { "/guide/install/": entry } }, { options: { trust: { contextPackUrl: unsafe } } });
    assert.doesNotMatch(out!, /trust-panel-actions/, unsafe);
  }
});

test("the reviewer and the reasons are escaped, never parsed as markup", () => {
  const out = render({
    trust: {
      "/guide/install/": {
        level: "verified",
        reasons: ["<img src=x onerror=1>"],
        lastReviewer: "<script>alert(1)</script>",
      },
    },
  });
  assert.ok(out);
  assert.match(out, /&lt;img src=x onerror=1>/);
  assert.match(out, /&lt;script>alert\(1\)&lt;\/script>/);
  assert.doesNotMatch(out, /<script>/);
  assert.doesNotMatch(out, /<img/);
});

test("every label follows the page language", () => {
  for (const lang of ["en", "fa", "ar"] as const) {
    const strings = stringsOf(lang);
    const out = render(
      {
        trust: { "/guide/install/": entry },
        examples: { "/guide/install/": { passed: 3, failed: 0 } },
        drift: { "/guide/install/": [] },
      },
      { lang },
    );
    assert.ok(out);
    for (const key of ["trust_level_verified", "trust_examples", "trust_drift", "trust_reviewer", "trust_reasons"]) {
      assert.ok(out.includes(strings[key]!), `${lang} shows ${key}`);
    }
    assert.ok(
      out.includes(strings.trust_examples_passed!.replace("{passed}", "3").replace("{total}", "3")),
      `${lang} localises the examples row`,
    );
    assert.ok(out.includes(strings.trust_drift_none!), `${lang} localises the empty drift row`);
  }
});

test("the helpers pick the page's data and text", () => {
  const site = siteOf({
    trust: { "/guide/install/": entry },
    examples: { "/guide/install/": { passed: 2, failed: 0 } },
    drift: { "/guide/install/": [{}] },
  });
  assert.deepEqual(entryFor(site, "/guide/install/"), entry);
  assert.equal(entryFor(site, "/other/"), undefined);
  assert.deepEqual(examplesFor(site, "/guide/install/"), { state: "passed", passed: 2, failed: 0, total: 2 });
  assert.deepEqual(examplesFor(site, "/other/"), { state: "absent" });
  assert.equal(driftFor(site, "/guide/install/"), 1);
  assert.equal(driftFor(site, "/other/"), undefined);

  assert.deepEqual(reasonsOf([" a ", "", 3, "b"]), ["a", "b"]);
  assert.deepEqual(reasonsOf("a|b\nc"), ["a", "b", "c"]);
  assert.equal(entryOf({ level: "verified" })?.level, "verified");
  assert.equal(entryOf({ level: "verified", lastReviewer: "  " })?.lastReviewer, undefined);

  assert.equal(examplesText("en", { state: "absent" }), "Not recorded");
  assert.equal(examplesText("en", evidenceOf({})), "No examples recorded");
  assert.equal(examplesText("en", evidenceOf({ passed: 2, failed: 1 })), "1 of 3 examples failed");
  assert.equal(examplesText("en", { state: "invalid" }), "Unknown");
  assert.equal(driftText("en", undefined), "Not recorded");
  assert.equal(driftText("en", 0), "No drift findings");
  assert.equal(driftText("en", 1), "1 drift finding");
  assert.equal(driftText("en", 2), "2 drift findings");
  assert.equal(reviewerText("en", undefined), "No reviewer recorded");
  assert.equal(reviewerText("en", "Ada"), "Reviewed by Ada");
});

test("actionHrefOf fills the page's placeholders and rejects unsafe values", () => {
  const config = { base: "/docs", theme: { options: {} } } as unknown as SiteConfig;
  const page = pageOf({ title: "In stall" });
  assert.equal(actionHrefOf(config, page, "/edit?source={source}"), "/docs/edit?source=guide/install.md");
  assert.equal(actionHrefOf(config, page, "https://example.com/{title}"), "https://example.com/In%20stall");
  assert.equal(actionHrefOf(config, page, "javascript:alert(1)"), undefined);
  assert.equal(actionHrefOf(config, page, undefined), undefined);
  assert.equal(actionHrefOf(undefined, page, "https://example.com/"), "https://example.com/");
});

test("the trust entry's build, generation, and review evidence are exposed with exact time values", () => {
  const out = render({
    trust: {
      "/guide/install/": {
        ...entry,
        buildId: "build-42",
        generatedAt: "2026-03-06",
        reviewedAt: "2026-03-04",
      },
    },
  });
  assert.ok(out);
  assert.match(out, /^<details class="trust-panel trust-panel-verified" data-trust-panel data-trust-level="verified"/);
  assert.match(out, /data-trust-build="build-42"/);
  assert.match(out, /data-trust-generated="2026-03-06"/);
  assert.match(out, /data-trust-reviewed="2026-03-04"/);
  assert.match(
    out,
    /<dt class="trust-panel-label">Updated<\/dt><dd class="trust-panel-value trust-panel-generated"><time datetime="2026-03-06" title="March 6, 2026" aria-label="March 6, 2026">March 6, 2026<\/time><\/dd>/,
  );
  assert.match(
    out,
    /<dt class="trust-panel-label">Reviewed<\/dt><dd class="trust-panel-value trust-panel-reviewed"><time datetime="2026-03-04" title="March 4, 2026" aria-label="March 4, 2026">March 4, 2026<\/time><\/dd>/,
  );
  assert.match(out, /trust-panel-reviewer">Reviewed by Ada<\/dd>/);
});

test("timed provenance keeps its full ISO value in the machine-readable time", () => {
  const out = render({
    trust: {
      "/guide/install/": {
        ...entry,
        buildId: "build-42",
        generatedAt: "2026-03-06T10:00:00Z",
        reviewedAt: "2026-03-04T09:30:15+03:30",
      },
    },
  });
  assert.ok(out);
  assert.match(out, /data-trust-generated="2026-03-06T10:00:00Z"/);
  assert.match(out, /data-trust-reviewed="2026-03-04T09:30:15\+03:30"/);
  assert.match(
    out,
    /<dt class="trust-panel-label">Updated<\/dt><dd class="trust-panel-value trust-panel-generated"><time datetime="2026-03-06T10:00:00Z" title="2026-03-06T10:00:00Z" aria-label="2026-03-06T10:00:00Z">March 6, 2026<\/time><\/dd>/,
  );
  assert.match(
    out,
    /<dt class="trust-panel-label">Reviewed<\/dt><dd class="trust-panel-value trust-panel-reviewed"><time datetime="2026-03-04T09:30:15\+03:30" title="2026-03-04T09:30:15\+03:30" aria-label="2026-03-04T09:30:15\+03:30">March 4, 2026<\/time><\/dd>/,
  );
});

test("build and reviewer data supply provenance the entry omits, and the dates stay localised", () => {
  for (const [lang, updated, reviewed] of [
    ["en", "Updated", "Reviewed"],
    ["fa", stringsOf("fa").updated, stringsOf("fa").reviewed],
    ["ar", stringsOf("ar").updated, stringsOf("ar").reviewed],
  ] as const) {
    const out = render(
      {
        trust: { "/guide/install/": entry },
        build: { id: "build-9", generatedAt: "2026-03-06" },
        reviewers: { "/guide/install/": { date: "2026-03-04", author: "Ada" } },
      },
      { lang },
    );
    assert.ok(out, lang);
    assert.match(out, /data-trust-build="build-9"/);
    assert.match(out, /data-trust-generated="2026-03-06"/);
    assert.match(out, /data-trust-reviewed="2026-03-04"/);
    assert.ok(out.includes(`${updated}</dt><dd class="trust-panel-value trust-panel-generated"><time datetime="2026-03-06"`), lang);
    assert.ok(out.includes(`${reviewed}</dt><dd class="trust-panel-value trust-panel-reviewed"><time datetime="2026-03-04"`), lang);
  }
});

test("provenanceOf reads the documented build and reviewer shapes without changing the level", () => {
  const reviewed = entryOf({ level: "verified", buildId: "build-9" });
  assert.ok(reviewed);
  const site = siteOf({
    build: { id: "build-9", generatedAt: "2026-03-06", asOf: "2026-03-07" },
    reviewers: { "/guide/install/": { date: "2026-03-04" } },
  });
  assert.deepEqual(provenanceOf(site, "/guide/install/", reviewed), {
    buildId: "build-9",
    generatedAt: "2026-03-06",
    reviewedAt: "2026-03-04",
  });
  assert.equal(reviewed.level, "verified");

  assert.deepEqual(provenanceOf(undefined, undefined), {});
  assert.deepEqual(provenanceOf(siteOf({ build: "2026-03-06" }), "/guide/install/"), {});
  assert.deepEqual(provenanceOf(siteOf({ build: { date: "2026-03-06" } }), "/guide/install/"), {
    generatedAt: "2026-03-06",
  });
  assert.deepEqual(
    provenanceOf(siteOf({ build: { generatedAt: new Date("2026-03-06T12:00:00Z") } }), "/guide/install/"),
    { generatedAt: "2026-03-06T12:00:00.000Z" },
  );
});

test("missing or malformed provenance adds no attribute, row, or action placeholder", () => {
  for (const evidence of [
    {},
    { buildId: "   " },
    { generatedAt: "not-a-date", reviewedAt: "2026-02-30" },
    { generatedAt: "2026-13-01", reviewedAt: "2026-00-10" },
    { generatedAt: "2026-03-06T99:99:99Z", reviewedAt: "2026-03-04T10:00:00Zjunk" },
  ]) {
    const out = render({ trust: { "/guide/install/": { ...entry, ...evidence } } });
    assert.ok(out);
    assert.doesNotMatch(out, /data-trust-build=/);
    assert.doesNotMatch(out, /data-trust-generated=/);
    assert.doesNotMatch(out, /data-trust-reviewed=/);
    assert.doesNotMatch(out, /<time /);
    assert.doesNotMatch(out, />Updated<\/dt>/);
    assert.doesNotMatch(out, />Reviewed<\/dt>/);
  }
});

test("future provenance is left out, and a review after its build is not evidence", () => {
  const future = render({
    trust: { "/guide/install/": { ...entry, generatedAt: "2026-03-09", reviewedAt: "2026-03-08" } },
    build: { asOf: "2026-03-06" },
  });
  assert.ok(future);
  assert.doesNotMatch(future, /data-trust-generated=/);
  assert.doesNotMatch(future, /data-trust-reviewed=/);
  assert.doesNotMatch(future, /<time /);

  const afterBuild = render({
    trust: { "/guide/install/": { ...entry, reviewedAt: "2026-03-07" } },
    build: { generatedAt: "2026-03-06", asOf: "2026-03-10" },
  });
  assert.ok(afterBuild);
  assert.match(afterBuild, /data-trust-generated="2026-03-06"/);
  assert.doesNotMatch(afterBuild, /data-trust-reviewed=/);

  const reviewFuture = render({
    trust: { "/guide/install/": { ...entry, reviewedAt: "2026-03-08" } },
    build: { date: "2026-03-06" },
  });
  assert.ok(reviewFuture);
  assert.doesNotMatch(reviewFuture, /data-trust-reviewed=/);
});

test("a trust entry from another build does not claim this build's provenance", () => {
  const out = render({
    trust: {
      "/guide/install/": {
        ...entry,
        buildId: "old-build",
        generatedAt: "2026-03-05",
        reviewedAt: "2026-03-04",
      },
    },
    build: { id: "current-build", generatedAt: "2026-03-06" },
  });
  assert.ok(out);
  assert.doesNotMatch(out, /data-trust-build=/);
  assert.doesNotMatch(out, /data-trust-generated=/);
  assert.match(out, /data-trust-reviewed="2026-03-04"/);
});

test("all four states keep their level when provenance is present", () => {
  for (const state of LEVELS) {
    const out = render({
      trust: {
        "/guide/install/": {
          level: state,
          buildId: "build-1",
          generatedAt: "2026-03-06",
          reviewedAt: "2026-03-04",
        },
      },
    });
    assert.ok(out, state);
    assert.match(out, new RegExp(`data-trust-level="${state}"`), state);
    assert.match(out, new RegExp(`class="trust-panel trust-panel-${state}"`), state);
    assert.match(out, /data-trust-build="build-1"/, state);
  }
});

test("action URLs carry page, source, build, and review provenance with safe encoding", () => {
  const config = { base: "/docs", theme: { options: {} } } as unknown as SiteConfig;
  const page = pageOf({ title: "In stall" });
  const provenance = {
    buildId: "build/1?x=é&y",
    generatedAt: "2026-03-06T10:00:00Z",
    reviewedAt: "2026-03-04",
  };
  assert.equal(
    actionHrefOf(
      config,
      page,
      "/context?page={url}&source={source}&title={title}&build={build}&generated={generated}&reviewed={reviewed}",
      provenance,
    ),
    "/docs/context?page=/guide/install/&source=guide/install.md&title=In%20stall&build=build%2F1%3Fx%3D%C3%A9%26y&generated=2026-03-06T10%3A00%3A00Z&reviewed=2026-03-04",
  );
  assert.equal(actionHrefOf(config, page, "/context?build={build}", {}), undefined);
  assert.equal(actionHrefOf(config, page, "/context?reviewed={reviewed}", { buildId: "b" }), undefined);
  assert.equal(actionHrefOf(config, page, "javascript:open({build})", { buildId: "b" }), undefined);
});

test("the panel fills provenance placeholders only when the evidence exists", () => {
  const options = {
    trust: {
      contextPackUrl: "https://example.com/context?build={build}&page={url}",
      suggestEditUrl: "/edit?source={source}&generated={generated}&reviewed={reviewed}",
    },
  };
  const missing = render({ trust: { "/guide/install/": entry } }, { options });
  assert.ok(missing);
  assert.doesNotMatch(missing, /trust-panel-actions/);
  assert.doesNotMatch(missing, /trust-panel-action/);

  const present = render(
    { trust: { "/guide/install/": { ...entry, buildId: "b 42", generatedAt: "2026-03-06", reviewedAt: "2026-03-04" } } },
    { options, base: "/docs" },
  );
  assert.ok(present);
  assert.match(present, /href="https:\/\/example.com\/context\?build=b%2042&amp;page=\/guide\/install\/"/);
  assert.match(
    present,
    /href="\/docs\/edit\?source=guide\/install.md&amp;generated=2026-03-06&amp;reviewed=2026-03-04"/,
  );
});

test("build ids and dates are escaped in the panel and encoded in links", () => {
  const out = render(
    {
      trust: {
        "/guide/install/": {
          ...entry,
          buildId: '"><script>alert(1)</script>',
          generatedAt: "2026-03-06",
        },
      },
    },
    { options: { trust: { contextPackUrl: "https://example.com/context?build={build}" } } },
  );
  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /data-trust-build="&quot;>&lt;script>alert\(1\)&lt;\/script>"/);
  assert.match(out, /href="https:\/\/example.com\/context\?build=%22%3E%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/);
});

/** A panel, its summary, and the keydown listeners `activate` wired. */
function fakePanel(open = true): {
  panel: TrustPanelNode;
  summary: TrustSummary & { focused: boolean };
  listeners: Array<(event: TrustEvent) => void>;
} {
  const summary = {
    focused: false,
    focus() {
      this.focused = true;
    },
  };
  const listeners: Array<(event: TrustEvent) => void> = [];
  const panel: TrustPanelNode = {
    open,
    querySelector(selector: string) {
      assert.equal(selector, SUMMARY_SELECTOR);
      return summary;
    },
    addEventListener(type: string, listener: (event: TrustEvent) => void) {
      assert.equal(type, "keydown");
      listeners.push(listener);
    },
  };
  return { panel, summary, listeners };
}

test("Escape closes the open panel and returns focus to the summary", () => {
  const { panel, summary, listeners } = fakePanel();
  activate(panel);

  let prevented = false;
  listeners[0]!({ key: "Escape", preventDefault: () => (prevented = true) });

  assert.equal(panel.open, false);
  assert.equal(summary.focused, true);
  assert.equal(prevented, true);
});

test("Escape on a closed panel, and every other key, changes nothing", () => {
  const closed = fakePanel(false);
  activate(closed.panel);
  closed.listeners[0]!({ key: "Escape", preventDefault: () => assert.fail("closed panel should not prevent default") });
  assert.equal(closed.panel.open, false);
  assert.equal(closed.summary.focused, false);

  const open = fakePanel();
  let prevented = false;
  closeOnEscape(open.panel, { key: "Enter", preventDefault: () => (prevented = true) });
  assert.equal(open.panel.open, true);
  assert.equal(open.summary.focused, false);
  assert.equal(prevented, false);
});

test("long explanations wrap instead of running off the panel, and rows stack at narrow widths", () => {
  assert.match(css, /\.trust-panel-body\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(
    css,
    /\.trust-panel-body\s*\{[^}]*max-inline-size:\s*min\(var\(--type-measure-min\),\s*calc\(100vw - var\(--space-6\)\)\)/s,
    "the panel never grows wider than the viewport",
  );
  assert.match(
    css,
    /@media \(max-width: 40rem\)[\s\S]*?\.trust-panel-rows\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    "the rows stack on a narrow screen",
  );
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
