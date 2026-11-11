import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CASES,
  LAYOUTS,
  THEMES,
  WCAG_TAGS,
  allows,
  fileForRequest,
  findingsFrom,
  onlyFrom,
  selectCases,
  splitBaseline,
  type AuditCase,
  type BaselineEntry,
  type Finding,
} from "../../scripts/test-a11y.ts";

const baseline = JSON.parse(readFileSync(new URL("baseline.json", import.meta.url), "utf8")) as {
  known: BaselineEntry[];
};

test("the matrix covers every layout, both themes, and the English and right-to-left locales", () => {
  assert.deepEqual([...new Set(CASES.map((item) => item.layout))].sort(), [...LAYOUTS].sort());
  assert.deepEqual([...new Set(CASES.map((item) => item.lang))].sort(), ["ar", "en", "fa"]);
  assert.deepEqual([...THEMES], ["light", "dark"]);
  assert.equal(new Set(CASES.map((item) => item.name)).size, CASES.length);
  assert.ok(CASES.some((item) => item.open === "drawer"), "the open drawer is audited");
  assert.ok(CASES.some((item) => item.open === "search"), "the open search palette is audited");
  assert.deepEqual([...WCAG_TAGS], ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
});

test("--only filters case names, and a missing value is an error", () => {
  assert.deepEqual(selectCases(CASES, undefined), CASES);
  const fixture = CASES.filter((item) => item.name.includes("fixture"));
  assert.deepEqual(selectCases(CASES, "fixture"), fixture);
  assert.deepEqual(selectCases(CASES, "nothing matches"), []);
  assert.equal(onlyFrom([]), undefined);
  assert.equal(onlyFrom(["--only", "docs home"]), "docs home");
  assert.throws(() => onlyFrom(["--only"]), /needs a case name/);
  assert.throws(() => onlyFrom(["--only", ""]), /needs a case name/);
});

test("only critical and serious impacts are findings, and frame targets are readable", () => {
  const item = CASES[0] as AuditCase;
  const violations = [
    {
      id: "color-contrast",
      impact: "serious",
      help: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://example.com/color-contrast",
      nodes: [{ target: [".home-eyebrow"] }],
    },
    {
      id: "image-alt",
      impact: "critical",
      help: "Images must have alternate text",
      helpUrl: "https://example.com/image-alt",
      nodes: [{ target: [["iframe", "img"]] }],
    },
    { id: "region", impact: "moderate", help: "All content should be in landmarks", helpUrl: "https://example.com/region", nodes: [{ target: ["main"] }] },
    { id: "duplicate-id", impact: null, help: "IDs must be unique", helpUrl: "https://example.com/duplicate-id", nodes: [{ target: ["#a"] }] },
  ];

  const findings = findingsFrom(item, "light", violations);

  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.impact, finding.target]),
    [
      ["color-contrast", "serious", ".home-eyebrow"],
      ["image-alt", "critical", "iframe >>> img"],
    ],
  );
  assert.equal(findings[0]?.case, item.name);
  assert.equal(findings[0]?.theme, "light");
});

test("a baseline entry matches one case, and case \"*\" matches a site-wide component", () => {
  const finding: Finding = {
    case: "docs document",
    theme: "light",
    rule: "color-contrast",
    target: ".edit-page-link",
    impact: "serious",
    help: "contrast",
    helpUrl: "https://example.com/color-contrast",
  };
  const exact = { case: finding.case, theme: finding.theme, rule: finding.rule, target: finding.target } as const;
  const shared = { ...exact, case: "*" };
  const other = { ...exact, case: "docs home" };

  assert.ok(allows(exact, finding));
  assert.ok(allows(shared, finding));
  assert.ok(!allows(other, finding));
  assert.ok(!allows({ ...exact, theme: "dark" }, finding), "the theme is part of the identity");
  assert.ok(!allows({ ...exact, rule: "link-name" }, finding), "the rule is part of the identity");

  const split = splitBaseline([finding], [exact, other]);
  assert.deepEqual(split.unexpected, []);
  assert.deepEqual(split.stale, [other]);

  const newFinding = { ...finding, target: ".new-selector" };
  assert.deepEqual(splitBaseline([newFinding], [exact]).unexpected, [newFinding]);
});

test("the baseline names a real case or \"*\", a real theme, and has no duplicates", () => {
  assert.ok(baseline.known.length > 0);
  const names = new Set(CASES.map((item) => item.name));
  const seen = new Set<string>();
  for (const entry of baseline.known) {
    assert.ok(entry.case === "*" || names.has(entry.case), `unknown case "${entry.case}"`);
    assert.ok(THEMES.includes(entry.theme), `unknown theme "${entry.theme}"`);
    const key = JSON.stringify([entry.case, entry.theme, entry.rule, entry.target]);
    assert.ok(!seen.has(key), `duplicate baseline entry ${key}`);
    seen.add(key);
  }
});

test("the static server maps requests inside the root and refuses to leave it", () => {
  const root = "/site";
  assert.equal(fileForRequest(root, "", "/"), "/site/index.html");
  assert.equal(fileForRequest(root, "", "/doc/"), "/site/doc/index.html");
  assert.equal(fileForRequest(root, "/lateen", "/lateen"), "/site/index.html");
  assert.equal(fileForRequest(root, "/lateen", "/lateen/install/"), "/site/install/index.html");
  assert.equal(fileForRequest(root, "/lateen", "/other/"), undefined);
  assert.equal(fileForRequest(root, "", "/../package.json"), undefined);
  assert.equal(fileForRequest(root, "", "/%2e%2e/package.json"), undefined);
  assert.equal(fileForRequest(root, "/lateen", "/lateen/%2e%2e/package.json"), undefined);
  assert.equal(fileForRequest(root, "", "/a%00b"), undefined);
  assert.equal(fileForRequest(root, "", "/%E0%A4%A"), undefined);
});
