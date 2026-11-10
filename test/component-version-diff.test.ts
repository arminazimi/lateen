import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { renderToString } from "preact-render-to-string";
import { languages, stringsOf } from "../i18n/index.ts";
import versionDiff, {
  DEFAULT_ID,
  ICONS,
  KINDS,
  LABEL_KEYS,
  changeOf,
  diffOf,
  directive,
  idBase,
  kindOf,
  parseJson,
  type VersionChange,
  type VersionDiffProps,
} from "../components/version-diff/index.ts";
import {
  CONTROLS_SELECTOR,
  COUNT_SELECTOR,
  ENHANCED_ATTR,
  ITEM_SELECTOR,
  LIST_SELECTOR,
  NEXT_SELECTOR,
  PREVIOUS_SELECTOR,
  activate,
  countText,
  select,
  step,
  type DiffElement,
  type DiffEvent,
  type DiffGroup,
} from "../components/version-diff/client.ts";

const changes: readonly VersionChange[] = [
  { kind: "added", title: "Retries", after: "## Retries\n\nTry again." },
  { kind: "removed", title: "Legacy flags", before: "## Legacy flags\n\nGone." },
  { kind: "changed", title: "Install", before: "## Install\n\nOld.", after: "## Install\n\nNew." },
  { kind: "moved", title: "Upgrade", from: "3", to: "5" },
];

function dataOf(list: readonly VersionChange[] = changes, from = "v1", to = "v2"): string {
  return JSON.stringify({ from, to, changes: list });
}

/** Render the viewer the way the render host calls it: directive props, language, and front matter. */
function render(
  props: VersionDiffProps,
  lang = "en",
  frontMatter: Record<string, unknown> = {},
): string | null {
  const input = {
    props,
    html: "",
    page: { lang, frontMatter },
    site: {},
  } as unknown as ComponentProps<VersionDiffProps>;
  const node = versionDiff(input);
  return node === null ? null : renderToString(node as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/version-diff/style.css", import.meta.url), "utf8");

test("default export is the component, the directive is version-diff, and there are four kinds", () => {
  assert.equal(typeof versionDiff, "function");
  assert.equal(directive, "version-diff");
  assert.deepEqual([...KINDS], ["added", "removed", "changed", "moved"]);
  assert.equal(DEFAULT_ID, "version-diff");
});

test("all four kinds render with their visible label, their icon, and their class", () => {
  const out = render({ data: dataOf() });
  assert.ok(out);

  for (const kind of KINDS) {
    const label = stringsOf("en")[LABEL_KEYS[kind]];
    assert.equal(typeof label, "string", `en.${LABEL_KEYS[kind]}`);
    assert.match(out, new RegExp(`class="version-diff-item version-diff-item-${kind}"`));
    assert.match(out, new RegExp(`class="version-diff-kind version-diff-kind-${kind}"`));
    assert.match(out, /<svg class="version-diff-icon"[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.ok(out.includes(`<span class="version-diff-kind-label">${label!}</span>`), `${kind} says "${label}"`);
  }
});

test("each kind has its own icon shape, so color is never the only signal", () => {
  const shapes = KINDS.map((kind) => ICONS[kind].join("|"));
  assert.equal(new Set(shapes).size, KINDS.length);
  for (const kind of KINDS) assert.ok(ICONS[kind].length > 0, `${kind} has a shape`);
});

test("a moved change shows its old and new position", () => {
  const out = render({ data: dataOf([{ kind: "moved", title: "Upgrade", from: "3", to: "5" }]) });
  assert.ok(out);
  assert.match(out, /class="version-diff-position"/);
  assert.ok(out.includes(stringsOf("en").version_diff_moved_from!.replace("{from}", "3")));
  assert.ok(out.includes(stringsOf("en").version_diff_moved_to!.replace("{to}", "5")));
});

test("the diff is a heading and an ordered list with one h3 per change", () => {
  const out = render({ data: dataOf() });
  assert.ok(out);
  assert.match(out, /<section class="version-diff"/);
  assert.match(out, /aria-labelledby="version-diff-title"/);
  assert.match(out, /<h2 class="version-diff-title" id="version-diff-title">/);
  assert.match(out, /<ol class="version-diff-list" id="version-diff-list"/);
  assert.equal([...out.matchAll(/<li class="version-diff-item/g)].length, 4);
  assert.equal([...out.matchAll(/<h3 class="version-diff-item-title"/g)].length, 4);
  assert.ok(out.includes(`>${stringsOf("en").version_diff_title!.replace("{from}", "v1").replace("{to}", "v2")}</h2>`));
});

test("previous and next are real buttons with labels and a change count", () => {
  const out = render({ data: dataOf() });
  assert.ok(out);

  assert.match(out, /<button type="button" class="version-diff-previous" data-version-diff-previous aria-controls="version-diff-list">Previous change<\/button>/);
  assert.match(out, /<button type="button" class="version-diff-next" data-version-diff-next aria-controls="version-diff-list">Next change<\/button>/);

  const count = stringsOf("en").version_diff_count!.replace("{current}", "1").replace("{total}", "4");
  assert.match(out, new RegExp(`class="version-diff-count"[^>]*aria-live="polite"[^>]*>${count}<`));
  assert.match(out, /data-version-diff-count/);
  assert.match(out, /data-template="Change \{current\} of \{total\}"/);
  assert.match(out, /data-total="4"/);
});

test("the controls start hidden, so a page without JavaScript shows no dead buttons", () => {
  const out = render({ data: dataOf() });
  assert.ok(out);
  assert.match(out, /<div class="version-diff-controls"[^>]*hidden/);
});

test("the labels, buttons, count, and title follow the page language", () => {
  for (const lang of languages) {
    const out = render({ data: dataOf() }, lang);
    assert.ok(out, `${lang} renders`);
    const strings = stringsOf(lang);

    for (const kind of KINDS) {
      assert.ok(out.includes(`>${strings[LABEL_KEYS[kind]]!}<`), `${lang} ${kind} label`);
    }
    assert.ok(out.includes(`>${strings.version_diff_previous!}<`), `${lang} previous`);
    assert.ok(out.includes(`>${strings.version_diff_next!}<`), `${lang} next`);
    assert.ok(
      out.includes(strings.version_diff_count!.replace("{current}", "1").replace("{total}", "4")),
      `${lang} count`,
    );
    assert.ok(
      out.includes(strings.version_diff_title!.replace("{from}", "v1").replace("{to}", "v2")),
      `${lang} title`,
    );
    assert.ok(out.includes(strings.version_diff_before!), `${lang} before`);
    assert.ok(out.includes(strings.version_diff_after!), `${lang} after`);
    assert.ok(out.includes(strings.version_diff_moved_from!.replace("{from}", "3")), `${lang} old position`);
  }
});

test("the i18n keys exist with matching placeholders in every language", () => {
  const keys = [
    ...Object.values(LABEL_KEYS),
    "version_diff_after",
    "version_diff_before",
    "version_diff_count",
    "version_diff_group",
    "version_diff_moved_from",
    "version_diff_moved_to",
    "version_diff_next",
    "version_diff_previous",
    "version_diff_title",
  ];
  const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
  for (const lang of languages) {
    for (const key of keys) {
      const text = stringsOf(lang)[key];
      assert.equal(typeof text, "string", `${lang}.${key}`);
      assert.deepEqual(placeholders(text!), placeholders(stringsOf("en")[key]!), `${lang}.${key} placeholders`);
    }
  }
});

test("no changes, two equal versions, or no versions render nothing", () => {
  assert.equal(render({ data: dataOf([]) }), null);
  assert.equal(render({ data: dataOf(changes, "v1", "v1") }), null);
  assert.equal(render({ from: "v1", to: "v1", changes: JSON.stringify(changes) }), null);
  assert.equal(render({ from: "v1", changes: JSON.stringify(changes) }), null);
  assert.equal(render({}), null);
  assert.equal(render({ data: "not json" }), null);
});

test("a change with an unknown kind or no section title is dropped", () => {
  const raw = {
    from: "v1",
    to: "v2",
    changes: [
      { kind: "renamed", title: "Nope" },
      { kind: "added", title: "   " },
      { kind: "added" },
      "not a change",
      { kind: " ADDED ", title: "  Kept  " },
    ],
  };
  const diff = diffOf(raw);
  assert.deepEqual(diff, { from: "v1", to: "v2", changes: [{ kind: "added", title: "Kept" }] });
  assert.equal(kindOf(" Moved "), "moved");
  assert.equal(kindOf("deleted"), undefined);
  assert.equal(changeOf({ kind: "added", title: "X", before: " ", after: "Y" })?.before, undefined);
});

test("the page's versionDiff front matter is the fallback, and the attributes win over it", () => {
  const frontMatter = { versionDiff: { from: "v2", to: "v3", changes: [{ kind: "added", title: "From front matter" }] } };
  const fromMatter = render({}, "en", frontMatter);
  assert.ok(fromMatter);
  assert.ok(fromMatter.includes("Changes from v2 to v3"));
  assert.ok(fromMatter.includes("From front matter"));

  const props = render({ data: dataOf([{ kind: "removed", title: "From the directive" }]) }, "en", frontMatter);
  assert.ok(props);
  assert.ok(props.includes("From the directive"));
  assert.ok(!props.includes("From front matter"));

  const separate = render(
    { from: "v1", to: "v2", changes: JSON.stringify([{ kind: "changed", title: "Separate" }]) },
    "en",
    frontMatter,
  );
  assert.ok(separate?.includes("Separate"));
});

test("the engine's grouped diff shape is accepted unchanged", () => {
  const grouped = {
    from: "v1",
    to: "v2",
    added: [{ heading: "Retries", id: "retries", occurrence: 1, text: "## Retries" }],
    removed: [{ heading: "Old flags", id: "old-flags", occurrence: 1, text: "## Old flags" }],
    changed: [{ heading: "Install", id: "install", occurrence: 1, oldText: "old", newText: "new" }],
    moved: [{ heading: "Upgrade", id: "upgrade", occurrence: 1, oldText: "up old", newText: "up new" }],
  };
  const out = render({ data: JSON.stringify(grouped) });
  assert.ok(out);
  assert.equal([...out.matchAll(/<li class="version-diff-item/g)].length, 4);
  for (const title of ["Retries", "Old flags", "Install", "Upgrade"]) {
    assert.ok(out.includes(`>${title}</h3>`), `${title} renders`);
  }
  assert.ok(out.includes(">old</p>"));
  assert.ok(out.includes(">new</p>"));
});

test("a custom id names the elements, and a broken one falls back", () => {
  const out = render({ data: dataOf(), id: "Diff 2" });
  assert.ok(out);
  assert.match(out, /aria-labelledby="Diff-2-title"/);
  assert.match(out, /id="Diff-2-list"/);
  assert.equal(idBase('"><script>'), "script");
  assert.equal(idBase(""), DEFAULT_ID);
});

test("text is escaped, never parsed as markup", () => {
  const out = render({
    data: JSON.stringify({
      from: "v1",
      to: "v2",
      changes: [{ kind: "changed", title: '<script>alert("x")</script> &', before: "<b>old</b>", after: "new &" }],
    }),
  });
  assert.ok(out);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script>alert\(&quot;x&quot;\)&lt;\/script> &amp;</);
  assert.match(out, /&lt;b>old&lt;\/b>/);
});

test("parseJson() reads JSON and treats blank or broken text as absent", () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.equal(parseJson(""), undefined);
  assert.equal(parseJson("  "), undefined);
  assert.equal(parseJson("{"), undefined);
  assert.equal(parseJson(42), undefined);
});

/* The island, with fakes standing in for the browser's elements. */

class FakeElement implements DiffElement {
  hidden = false;
  textContent: string | null = null;
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, Array<(event: DiffEvent) => void>>();
  readonly dataset: { readonly template?: string };
  focused = false;

  constructor(template?: string) {
    this.dataset = template === undefined ? {} : { template };
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  focus(): void {
    this.focused = true;
  }

  addEventListener(type: string, listener: (event: DiffEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  fire(type: string, event: Partial<DiffEvent> = {}): void {
    const full: DiffEvent = { target: this, preventDefault: () => {}, ...event };
    for (const listener of this.listeners.get(type) ?? []) listener(full);
  }
}

/** A viewer with `count` changes and the island's parts; the controls start hidden, as in the markup. */
function fakeGroup(count: number, template = "Change {current} of {total}") {
  const items = Array.from({ length: count }, () => new FakeElement());
  const list = new FakeElement();
  const controls = new FakeElement();
  controls.hidden = true;
  const previous = new FakeElement();
  const next = new FakeElement();
  const countEl = new FakeElement(template);

  const group = {
    attrs: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    querySelector(selector: string) {
      if (selector === LIST_SELECTOR) return list;
      if (selector === CONTROLS_SELECTOR) return controls;
      if (selector === PREVIOUS_SELECTOR) return previous;
      if (selector === NEXT_SELECTOR) return next;
      if (selector === COUNT_SELECTOR) return countEl;
      return null;
    },
    querySelectorAll(selector: string) {
      return selector === ITEM_SELECTOR ? items : [];
    },
  } satisfies DiffGroup & { attrs: Map<string, string> };

  return { group, items, list, controls, previous, next, countEl };
}

test("step() moves, wraps, and follows the reading direction", () => {
  assert.equal(step("ArrowDown", 0, 3, false), 1);
  assert.equal(step("ArrowUp", 0, 3, false), 2);
  assert.equal(step("ArrowRight", 0, 3, false), 1);
  assert.equal(step("ArrowLeft", 0, 3, false), 2);
  assert.equal(step("ArrowRight", 0, 3, true), 2, "right moves back under RTL");
  assert.equal(step("ArrowLeft", 0, 3, true), 1, "left moves forward under RTL");
  assert.equal(step("Home", 2, 3, false), 0);
  assert.equal(step("End", 0, 3, false), 2);
  assert.equal(step("Tab", 0, 3, false), undefined);
  assert.equal(step("ArrowDown", 0, 0, false), undefined);
});

test("countText() fills the template, with a plain fallback for an empty one", () => {
  assert.equal(countText("Change {current} of {total}", 2, 4), "Change 2 of 4");
  assert.equal(countText("", 2, 4), "2 / 4");
});

test("select() focuses one change, keeps one in the tab order, and updates the count", () => {
  const { items, countEl } = fakeGroup(3);
  select(items, 1, countEl);
  assert.deepEqual(
    items.map((item) => item.getAttribute("tabindex")),
    ["-1", "0", "-1"],
  );
  assert.deepEqual(
    items.map((item) => item.focused),
    [false, true, false],
  );
  assert.equal(countEl.textContent, "Change 2 of 3");
});

test("activate() reveals the controls, marks the viewer, and makes the first change the tab stop", () => {
  const { group, items, controls, countEl } = fakeGroup(3);
  activate(group, false);
  assert.equal(controls.hidden, false);
  assert.equal(group.attrs.get(ENHANCED_ATTR), "");
  assert.deepEqual(
    items.map((item) => item.getAttribute("tabindex")),
    ["0", "-1", "-1"],
  );
  assert.equal(countEl.textContent, "Change 1 of 3");
});

test("activate() moves with the buttons and wraps", () => {
  const { group, items, previous, next, countEl } = fakeGroup(3);
  activate(group, false);

  next.fire("click");
  assert.equal(countEl.textContent, "Change 2 of 3");
  assert.equal(items[1]?.focused, true);

  previous.fire("click");
  assert.equal(countEl.textContent, "Change 1 of 3");

  previous.fire("click");
  assert.equal(countEl.textContent, "Change 3 of 3", "previous wraps to the last change");

  next.fire("click");
  assert.equal(countEl.textContent, "Change 1 of 3", "next wraps to the first change");
});

test("activate() moves with the arrow keys, Home, and End, and stops the default scroll", () => {
  const { group, list, countEl } = fakeGroup(3);
  activate(group, false);

  let prevented = 0;
  const key = (value: string) => list.fire("keydown", { key: value, preventDefault: () => (prevented += 1) });

  key("ArrowDown");
  assert.equal(countEl.textContent, "Change 2 of 3");
  key("End");
  assert.equal(countEl.textContent, "Change 3 of 3");
  key("ArrowDown");
  assert.equal(countEl.textContent, "Change 1 of 3", "ArrowDown wraps");
  key("ArrowUp");
  assert.equal(countEl.textContent, "Change 3 of 3", "ArrowUp wraps");
  key("Home");
  assert.equal(countEl.textContent, "Change 1 of 3");
  key("Tab");
  assert.equal(prevented, 5, "only the handled keys prevent the default");

  activate(group, true);
  key("ArrowRight");
  assert.equal(countEl.textContent, "Change 3 of 3", "ArrowRight moves back under RTL");
});

test("activate() leaves a viewer without changes alone", () => {
  const { group, controls } = fakeGroup(0);
  activate(group, false);
  assert.equal(controls.hidden, true);
  assert.equal(group.attrs.get(ENHANCED_ATTR), undefined);
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
  assert.doesNotMatch(css, /\b(left|right|top|bottom):/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});

test("style.css keeps every kind visible with its own colour and a text label beside the icon", () => {
  for (const kind of KINDS) {
    assert.match(css, new RegExp(`\\.version-diff-kind-${kind}\\s*\\{[^}]*color:\\s*var\\(--color-`));
  }
  assert.match(css, /\.version-diff-text-label\s*\{[^}]*text-transform:\s*uppercase/s);
  assert.match(css, /\.version-diff-item:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--state-focus-ring\)/s);
  assert.match(css, /\.version-diff-previous:focus-visible/);
});
