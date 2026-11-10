import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ChromeProps, Page, Pager, Site, SiteConfig, SourcePos, Trail } from "@velella/mizzen/contracts";
import versionSwitcher, { versionsOf } from "../chrome/version-switcher/index.ts";

const pos: SourcePos = { file: "guide/install.md", line: 3, column: 1, endLine: 9, endColumn: 1 };

function configWith(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    title: "Example",
    base: "/example",
    lang: "en",
    dir: "ltr",
    languages: [],
    source: ".",
    include: [],
    exclude: [],
    navigation: "_data/navigation.yml",
    defaults: [],
    theme: { options: {} },
    search: { text: 300 },
    redirects: {},
    outputs: {},
    ...overrides,
  };
}

function pageWith(overrides: Partial<Page> = {}): Page {
  return {
    url: "/example/v2/guide/install/",
    source: pos,
    frontMatter: { title: "Install" },
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

const trail: Trail = [];
const pager: Pager = {};

function props(data: Readonly<Record<string, unknown>>, page = pageWith(), config = configWith()): ChromeProps {
  const site: Site = { config, pages: [page], nav: {}, data };
  return { site, page, trail, pager };
}

function render(input: ChromeProps): string {
  const node = versionSwitcher(input);
  return node == null ? "" : renderToString(node as never);
}

/** The N17 `versions.json` shape, with the page's URL in each version. */
const n17 = {
  pages: [
    {
      path: "guide/install.md",
      versions: [
        { version: "v1", url: "/v1/guide/install/", status: "removed" },
        { version: "v2", url: "/v2/guide/install/" },
      ],
    },
  ],
};

test("lists versions from the N17 versions.json shape and marks the current one", () => {
  const out = render(props({ versions: n17 }));

  assert.match(out, /^<nav class="version-switcher" aria-label="Versions">/);
  assert.match(out, /<details class="version-switcher-details">/);
  assert.match(out, /<summary class="version-switcher-summary">/);
  assert.match(out, /<span class="version-switcher-label">Versions<\/span>/);
  assert.match(out, /<span class="version-switcher-value" dir="ltr">v2<\/span>/);
  assert.match(out, /<a class="version-switcher-link" href="\/example\/v1\/guide\/install\/">/);
  assert.match(out, /<a class="version-switcher-link" href="\/example\/v2\/guide\/install\/" aria-current="true">/);
  assert.match(out, /<span class="version-switcher-current">Current version<\/span>/);
  assert.equal(out.match(/aria-current="true"/g)?.length, 1);
});

test("links the same page URL from the data, adding base once", () => {
  const out = render(props({ versions: n17 }));

  assert.match(out, /href="\/example\/v1\/guide\/install\/"/);
  assert.match(out, /href="\/example\/v2\/guide\/install\/"/);
  assert.doesNotMatch(out, /\/example\/example/);

  const prefixed = render(props({ versions: { ...n17, pages: [{ ...n17.pages[0]!, versions: n17.pages[0]!.versions.map((entry) => ({ ...entry, url: `/example${entry.url}` })) }] } }));
  assert.match(prefixed, /href="\/example\/v1\/guide\/install\/"/);
  assert.doesNotMatch(prefixed, /\/example\/example/);
});

test("accepts a simple page-to-versions map keyed by URL, and a terse version-to-URL map", () => {
  const map = {
    "/guide/install/": [
      { version: "v1", url: "/v1/guide/install/" },
      { version: "v2", url: "/v2/guide/install/" },
    ],
  };
  const out = render(props({ versions: map }));
  assert.match(out, /href="\/example\/v1\/guide\/install\/"/);
  assert.match(out, /href="\/example\/v2\/guide\/install\/" aria-current="true"/);

  const terse = { "/guide/install/": { v1: "/v1/guide/install/", v2: "/v2/guide/install/" } };
  const terseOut = render(props({ versions: terse }));
  assert.match(terseOut, /<span class="version-switcher-version" dir="ltr">v1<\/span>/);
  assert.match(terseOut, /href="\/example\/v2\/guide\/install\/" aria-current="true"/);
});

test("falls back to the page's versions front matter without data", () => {
  const page = pageWith({
    frontMatter: {
      title: "Install",
      versions: [
        { version: "1.0", url: "/v1/guide/install/" },
        { version: "2.0", url: "/v2/guide/install/" },
      ],
    },
  });
  const out = render(props({}, page));

  assert.match(out, /<span class="version-switcher-version" dir="ltr">1.0<\/span>/);
  assert.match(out, /href="\/example\/v1\/guide\/install\/"/);
  assert.match(out, /href="\/example\/v2\/guide\/install\/" aria-current="true"/);
  assert.match(out, /<span class="version-switcher-current">Current version<\/span>/);
});

test("a page missing from another version links that version's home, derived from its folder", () => {
  const data = {
    pages: [
      {
        path: "guide/legacy.md",
        versions: [
          { version: "v1", url: "/v1/guide/legacy/" },
          { version: "v2", url: "/v2/guide/legacy/" },
        ],
      },
      { path: "guide/install.md", versions: [{ version: "v2", url: "/v2/guide/install/" }] },
    ],
  };
  const out = render(props({ versions: data }));

  assert.match(out, /<a class="version-switcher-link" href="\/example\/v1\/">/);
  assert.match(out, /href="\/example\/v1\/"><span class="version-switcher-version" dir="ltr">v1<\/span>/);
  assert.match(out, /href="\/example\/v2\/guide\/install\/" aria-current="true"/);
});

test("data can set a version home instead of deriving it", () => {
  const data = {
    pages: [
      { path: "guide/legacy.md", versions: [{ version: "v1", url: "/v1/guide/legacy/", home: "/v1/" }] },
      { path: "guide/install.md", versions: [{ version: "v2", url: "/v2/guide/install/" }] },
    ],
  };
  assert.match(render(props({ versions: data })), /href="\/example\/v1\//);
});

test("renders nothing for one version, no versions, or a page the data does not list", () => {
  const one = { pages: [{ path: "guide/install.md", versions: [{ version: "v2", url: "/v2/guide/install/" }] }] };
  assert.equal(versionSwitcher(props({ versions: one })), null);
  assert.equal(versionSwitcher(props({})), null);
  assert.equal(versionSwitcher(props({ versions: { pages: [] } })), null);

  const otherPage = {
    pages: [
      {
        path: "guide/other.md",
        versions: [
          { version: "v1", url: "/v1/guide/other/" },
          { version: "v2", url: "/v2/guide/other/" },
        ],
      },
    ],
  };
  assert.equal(versionSwitcher(props({ versions: otherPage })), null);
});

test("the disclosure is native, so it works with the keyboard and no JavaScript", () => {
  const out = render(props({ versions: n17 }));

  assert.match(out, /<details class="version-switcher-details"><summary class="version-switcher-summary">/);
  assert.doesNotMatch(out, /tabindex|role="button"|<script/);
  assert.match(out, /<a class="version-switcher-link" href="[^"]+"/);
  assert.equal(existsSync(new URL("../chrome/version-switcher/client.ts", import.meta.url)), false);

  const css = readFileSync(new URL("../chrome/version-switcher/style.css", import.meta.url), "utf8");
  assert.match(css, /\.version-switcher-summary:focus-visible \{\n {2}outline: 2px solid var\(--state-focus-ring\);\n {2}outline-offset: 2px;\n\}/);
  assert.match(css, /\.version-switcher-summary::-webkit-details-marker \{\n {2}display: none;\n\}/);
});

test("escaping: version names and URLs are escaped, and an unsafe URL is dropped", () => {
  const page = pageWith({
    frontMatter: {
      title: "Install",
      versions: [
        { version: "v<2>", url: "/v2/guide/install/" },
        { version: "v1", url: "/v1/guide/install/" },
      ],
    },
  });
  const out = render(props({}, page));
  assert.match(out, /v&lt;2>/);
  assert.doesNotMatch(out, /v<2>/);
  assert.doesNotMatch(out, /<img/);

  const unsafe = pageWith({
    frontMatter: {
      title: "Install",
      versions: [
        { version: "v0", url: "javascript:alert(1)" },
        { version: "v1", url: "/v1/guide/install/" },
        { version: "v2", url: "/v2/guide/install/" },
      ],
    },
  });
  const safe = render(props({}, unsafe));
  assert.doesNotMatch(safe, /javascript:/);
  assert.match(safe, /href="\/example\/v1\/guide\/install\/"/);
});

test("the label is localised: Persian and Arabic use their own strings", () => {
  const fa = render(props({ versions: n17 }, pageWith({ lang: "fa", dir: "rtl" })));
  assert.match(fa, /aria-label="نسخه‌ها"/);
  assert.match(fa, /<span class="version-switcher-current">نسخهٔ کنونی<\/span>/);

  const ar = render(props({ versions: n17 }, pageWith({ lang: "ar", dir: "rtl" })));
  assert.match(ar, /aria-label="الإصدارات"/);
  assert.match(ar, /<span class="version-switcher-current">الإصدار الحالي<\/span>/);
});

test("versionsOf returns the links without rendering, and ignores unusable entries", () => {
  const links = versionsOf(props({ versions: n17 }).site, pageWith());
  assert.deepEqual(links, [
    { version: "v1", url: "/example/v1/guide/install/", current: false },
    { version: "v2", url: "/example/v2/guide/install/", current: true },
  ]);

  const mixed = { pages: [{ path: "guide/install.md", versions: [{ version: "v2", url: "/v2/guide/install/" }, { url: "/nope/" }] }] };
  assert.equal(versionsOf(props({ versions: mixed }).site, pageWith())?.length, 1);
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  const tokenNames = new Set(
    Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
  );
  const css = readFileSync(new URL("../chrome/version-switcher/style.css", import.meta.url), "utf8");
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});
