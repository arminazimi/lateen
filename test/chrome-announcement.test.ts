import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, Head, LayoutProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import announcement, { DEFAULT_ID } from "../chrome/announcement/index.ts";
import {
  activate,
  DISMISS_SELECTOR,
  isDismissed,
  remember,
  storageKey,
  type AnnouncementBar,
  type AnnouncementStorage,
} from "../chrome/announcement/client.ts";
import base from "../layouts/base.ts";
import { stringsOf } from "../i18n/index.ts";

const pos: SourcePos = { file: "index.md", line: 1, column: 1, endLine: 1, endColumn: 1 };

function configWith(options: Readonly<Record<string, unknown>>, lang = "en"): SiteConfig {
  return {
    title: "Example",
    base: "/example",
    lang,
    dir: lang === "fa" || lang === "ar" ? "rtl" : "ltr",
    languages: [],
    source: ".",
    include: [],
    exclude: [],
    navigation: "_data/navigation.yml",
    defaults: [],
    theme: { options },
    search: { text: 300 },
    redirects: {},
    outputs: {},
  };
}

const page: Page = {
  url: "/example/",
  source: pos,
  frontMatter: { title: "Home" },
  title: "Home",
  lang: "en",
  dir: "ltr",
  headings: [],
  html: "",
  markdown: "",
  kind: "doc",
};

const trail: Trail = [];
const pager: Pager = {};

function props(options: Readonly<Record<string, unknown>>, lang = "en"): ChromeProps {
  const site: Site = { config: configWith(options, lang), pages: [page], nav: {}, data: {} };
  return { site, page, trail, pager };
}

const head: Head = { title: "Home · Example", meta: [], links: [], jsonLd: [] };

function layoutProps(options: Readonly<Record<string, unknown>>, lang = "en"): LayoutProps {
  return { ...props(options, lang), head, islands: [] };
}

/** The bar's HTML, or an empty string when it renders nothing. */
function render(options: Readonly<Record<string, unknown>>, lang = "en"): string {
  const node = announcement(props(options, lang));
  return node === null ? "" : renderToString(node as never);
}

/** An in-memory store that records what was written. */
function store(saved: Readonly<Record<string, string>> = {}): AnnouncementStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...saved };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** A store whose every access throws, as private browsing can. */
function brokenStore(): AnnouncementStorage {
  return {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
}

/** A bar whose dismiss button records its click listeners. */
function fakeBar(id: string): AnnouncementBar & {
  button: { hidden: boolean; clicks: Array<() => void> };
} {
  const button = {
    hidden: true,
    clicks: [] as Array<() => void>,
    addEventListener(type: string, listener: () => void) {
      assert.equal(type, "click");
      button.clicks.push(listener);
    },
  };
  const bar = {
    hidden: false,
    button,
    getAttribute(name: string) {
      assert.equal(name, "data-announcement-id");
      return id;
    },
    querySelector(selector: string) {
      assert.equal(selector, DISMISS_SELECTOR);
      return button;
    },
  };
  return bar;
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

test("renders nothing when the config sets no announcement, or sets no usable text", () => {
  assert.equal(announcement(props({})), null);
  assert.equal(announcement(props({ announcement: "not an object" })), null);
  assert.equal(announcement(props({ announcement: null })), null);
  assert.equal(announcement(props({ announcement: { id: "release" } })), null);
  assert.equal(announcement(props({ announcement: { id: "release", text: "" } })), null);
  assert.equal(announcement(props({ announcement: { id: "release", text: "   " } })), null);
});

test("renders a labelled region with the text and a dismiss button hidden until the island runs", () => {
  const out = render({ announcement: { id: "v0-4", text: "Slipway 0.4 is out." } });

  assert.match(out, /^<div class="announcement" role="region" aria-label="Announcement"/);
  assert.match(out, /data-announcement="true"/);
  assert.match(out, /data-announcement-id="v0-4"/);
  assert.match(out, /<p class="announcement-text">Slipway 0\.4 is out\.<\/p>/);
  assert.match(out, /<button type="button" class="announcement-dismiss" aria-label="Dismiss announcement" hidden data-announcement-dismiss="true">/);
  assert.match(out, /<span aria-hidden="true">×<\/span>/);
  assert.doesNotMatch(out, /announcement-link/);
});

test("names the region and the dismiss button in the page's language", () => {
  const options = { announcement: { id: "v0-4", text: "Slipway 0.4 is out." } };

  const english = render(options);
  assert.match(english, new RegExp(`aria-label="${stringsOf("en").announcement}"`));
  assert.match(english, new RegExp(`aria-label="${stringsOf("en").announcement_dismiss}"`));

  const persian = render(options, "fa");
  assert.match(persian, new RegExp(`aria-label="${stringsOf("fa").announcement}"`));
  assert.match(persian, new RegExp(`aria-label="${stringsOf("fa").announcement_dismiss}"`));
});

test("links the text when href is set, adds the site base to a site path, and opens an absolute URL safely", () => {
  const internal = render({ announcement: { id: "v0-4", text: "Read the notes", href: "/changelog/" } });
  assert.match(internal, /<a class="announcement-link" href="\/example\/changelog\/">Read the notes<\/a>/);

  const external = render({ announcement: { id: "v0-4", text: "Read the notes", href: "https://example.com/notes" } });
  assert.match(external, /<a class="announcement-link" href="https:\/\/example\.com\/notes" rel="noopener">Read the notes<\/a>/);
});

test("drops an unsafe or empty href instead of linking it", () => {
  for (const href of ["javascript:alert(1)", "//evil.example/", "data:text/html,x", "relative/path"]) {
    const out = render({ announcement: { id: "v0-4", text: "Message", href } });
    assert.doesNotMatch(out, /<a /, href);
    assert.match(out, /Message/);
  }
});

test("uses the configured id for storage, and the default id when none is set", () => {
  const custom = render({ announcement: { id: "  v0-4  ", text: "Message" } });
  assert.match(custom, /data-announcement-id="v0-4"/);

  const fallback = render({ announcement: { text: "Message" } });
  assert.match(fallback, new RegExp(`data-announcement-id="${DEFAULT_ID}"`));
});

test("escapes text and attribute values, so config values stay text", () => {
  const out = render({
    announcement: { id: 'a" onmouseover="x', text: '<script>alert("x")</script> & more' },
  });

  assert.match(out, /&lt;script>alert\(&quot;x&quot;\)&lt;\/script> &amp; more/);
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /data-announcement-id="a&quot; onmouseover=&quot;x"/);
});

test("isDismissed reads only this announcement's key, and treats any other value as not dismissed", () => {
  const storage = store({ [storageKey("old")]: "true", [storageKey("other")]: "yes" });
  assert.equal(isDismissed(storage, "old"), true);
  assert.equal(isDismissed(storage, "other"), false);
  assert.equal(isDismissed(storage, "missing"), false);
  assert.equal(isDismissed(brokenStore(), "old"), false);
});

test("remember writes true under this announcement's key and survives a broken store", () => {
  const storage = store();
  remember(storage, "v0-4");
  assert.deepEqual(storage.data, { "slipway-announcement:v0-4": "true" });
  assert.doesNotThrow(() => remember(brokenStore(), "v0-4"));
});

test("activate reveals the dismiss button; a click hides the bar and remembers the id", () => {
  const bar = fakeBar("v0-4");
  const storage = store();
  activate(bar, storage, "v0-4");

  assert.equal(bar.hidden, false);
  assert.equal(bar.button.hidden, false);
  assert.equal(bar.button.clicks.length, 1);

  bar.button.clicks[0]!();
  assert.equal(bar.hidden, true);
  assert.equal(storage.data["slipway-announcement:v0-4"], "true");
});

test("activate hides a bar dismissed on an earlier visit and leaves the button hidden", () => {
  const bar = fakeBar("v0-4");
  activate(bar, store({ [storageKey("v0-4")]: "true" }), "v0-4");

  assert.equal(bar.hidden, true);
  assert.equal(bar.button.hidden, true);
  assert.equal(bar.button.clicks.length, 0);
});

test("a dismissal is remembered per announcement id", () => {
  const storage = store({ [storageKey("old")]: "true" });
  const bar = fakeBar("new");
  activate(bar, storage, "new");

  assert.equal(bar.hidden, false, "the old dismissal does not hide the new announcement");
  bar.button.clicks[0]!();
  assert.equal(storage.data[storageKey("old")], "true");
  assert.equal(storage.data[storageKey("new")], "true");
});

test("activate survives a broken store, still hiding the bar for this view", () => {
  const bar = fakeBar("v0-4");
  assert.doesNotThrow(() => activate(bar, brokenStore(), "v0-4"));
  assert.equal(bar.button.hidden, false);
  assert.doesNotThrow(() => bar.button.clicks[0]!());
  assert.equal(bar.hidden, true);
});

test("the base layout places the bar above the header", () => {
  const out = renderToString(
    base({ ...layoutProps({ announcement: { id: "v0-4", text: "Slipway 0.4 is out." } }), header: h("span", null, "H") }) as never,
  );

  const bar = out.indexOf('class="announcement"');
  const header = out.indexOf("<header>");
  assert.ok(bar > out.indexOf("</a>"), "the bar comes after the skip link");
  assert.ok(header > bar, "the header comes after the bar");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const css = readFileSync(new URL("../chrome/announcement/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css uses logical properties and keeps the hidden bar and button hidden", () => {
  const css = readFileSync(new URL("../chrome/announcement/style.css", import.meta.url), "utf8");

  assert.match(css, /\.announcement\[hidden\] \{/);
  assert.match(css, /\.announcement-dismiss\[hidden\] \{/);
  assert.doesNotMatch(css, /\b(?:margin|padding|border)-(?:left|right)\b/);
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
});
