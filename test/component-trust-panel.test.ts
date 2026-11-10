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
  actionHrefOf,
  driftFor,
  driftText,
  entryFor,
  entryOf,
  examplesFor,
  examplesText,
  levelOf,
  pagesOf,
  reasonsOf,
  reviewerText,
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

test("renders nothing when the site has no trust data for the page", () => {
  assert.equal(render({}), null);
  assert.equal(render({ trust: undefined }), null);
  assert.equal(render({ trust: null }), null);
  assert.equal(render({ trust: "not a map" }), null);
  assert.equal(render({ trust: [] }), null);
  assert.equal(render({ trust: { "/other/": entry } }), null);
  assert.equal(render({ trust: { "/guide/install/": {} } }), null);
  assert.equal(render({ trust: { "/guide/install/": { level: "unknown" } } }), null);
  assert.equal(render({ trust: { "/guide/install/": "verified" } }), null);
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

test("all three levels render their own label and shape", () => {
  for (const [level, key] of [
    ["verified", "trust_level_verified"],
    ["review due", "trust_level_review_due"],
    ["at risk", "trust_level_at_risk"],
  ] as const) {
    const out = render({ trust: { "/guide/install/": { level } } });
    assert.ok(out, level);
    assert.ok(out.includes(`<span class="trust-panel-level">Trust: ${stringsOf("en")[key]}</span>`), level);
    assert.match(out, new RegExp(`class="trust-panel trust-panel-${level.replace(/ /g, "-")}"`));
  }
});

test("level words are matched without case, spaces, or underscores", () => {
  assert.equal(levelOf("Verified"), "verified");
  assert.equal(levelOf(" review due "), "review-due");
  assert.equal(levelOf("REVIEW_DUE"), "review-due");
  assert.equal(levelOf("at_risk"), "at-risk");
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
  assert.match(out, /<dt class="trust-panel-label">Examples<\/dt><dd class="trust-panel-value trust-panel-examples">1 of 4 examples failed<\/dd>/);
  assert.match(out, /<dt class="trust-panel-label">Drift<\/dt><dd class="trust-panel-value trust-panel-drift">2 drift findings<\/dd>/);
  assert.match(out, /<dt class="trust-panel-label">Last reviewer<\/dt><dd class="trust-panel-value trust-panel-reviewer">Reviewed by Ada<\/dd>/);
  assert.match(out, /<p class="trust-panel-reasons-label">Why this level<\/p><ul class="trust-panel-reasons"><li>All examples passed.<\/li><li>No drift.<\/li><\/ul>/);
});

test("the examples and drift rows say so when the data is missing, empty, or clean", () => {
  assert.match(render({ trust: { "/guide/install/": entry } })!, /trust-panel-examples">Not recorded<\/dd>/);
  assert.match(render({ trust: { "/guide/install/": entry } })!, /trust-panel-drift">Not recorded<\/dd>/);
  assert.match(
    render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": {} } })!,
    /trust-panel-examples">No examples recorded<\/dd>/,
  );
  assert.match(
    render({ trust: { "/guide/install/": entry }, drift: { "/guide/install/": [] } })!,
    /trust-panel-drift">No drift findings<\/dd>/,
  );
  assert.match(
    render({ trust: { "/guide/install/": entry }, examples: { "/guide/install/": { passed: 3, failed: 0 } } })!,
    /trust-panel-examples">3 of 3 examples passed<\/dd>/,
  );
});

test("a page without a reviewer says so", () => {
  const out = render({ trust: { "/guide/install/": { level: "review due" } } });
  assert.match(out!, /trust-panel-reviewer">No reviewer recorded<\/dd>/);
});

test("the top-level and nested pages shapes are both accepted, and nested wins", () => {
  assert.deepEqual(pagesOf({ "/guide/install/": entry }), { "/guide/install/": entry });
  assert.deepEqual(pagesOf({ pages: { "/guide/install/": entry } }), { "/guide/install/": entry });

  const nested = render({ trust: { pages: { "/guide/install/": { level: "at risk" } } } });
  assert.match(nested!, /data-trust-level="at-risk"/);

  const both = { pages: { "/guide/install/": { level: "verified" } }, "/guide/install/": { level: "at-risk" } };
  assert.equal(entryFor(siteOf({ trust: both }), "/guide/install/")?.level, "verified");
});

test("the directive's props make a manual panel, and they win over the data", () => {
  const out = render(
    { trust: { "/guide/install/": entry } },
    { props: { level: "at risk", reasons: "First|Second", lastReviewer: "Bo" } },
  );
  assert.match(out!, /data-trust-level="at-risk"/);
  assert.match(out!, /<li>First<\/li><li>Second<\/li>/);
  assert.match(out!, /Reviewed by Bo/);
});

test("an empty reason list is left out", () => {
  const out = render({ trust: { "/guide/install/": { level: "verified" } } });
  assert.doesNotMatch(out!, /trust-panel-reasons/);
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
  assert.deepEqual(examplesFor(site, "/guide/install/"), { passed: 2, failed: 0 });
  assert.equal(examplesFor(site, "/other/"), undefined);
  assert.equal(driftFor(site, "/guide/install/"), 1);
  assert.equal(driftFor(site, "/other/"), undefined);

  assert.deepEqual(reasonsOf([" a ", "", 3, "b"]), ["a", "b"]);
  assert.deepEqual(reasonsOf("a|b\nc"), ["a", "b", "c"]);
  assert.equal(entryOf({ level: "verified" })?.level, "verified");
  assert.equal(entryOf({ level: "verified", lastReviewer: "  " })?.lastReviewer, undefined);

  assert.equal(examplesText("en", undefined), "Not recorded");
  assert.equal(examplesText("en", { passed: 0, failed: 0 }), "No examples recorded");
  assert.equal(examplesText("en", { passed: 2, failed: 1 }), "1 of 3 examples failed");
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
