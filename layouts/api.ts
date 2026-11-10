import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps } from "@velella/mizzen/contracts";
import base from "./base.ts";
import breadcrumb from "../chrome/breadcrumb/index.ts";
import drawer from "../chrome/drawer/index.ts";
import header from "../chrome/header/index.ts";
import sidebar from "../chrome/sidebar/index.ts";
import toc from "../chrome/toc/index.ts";
import { t } from "../i18n/index.ts";

/**
 * The API reference layout: the docs article (breadcrumb, title, body) beside a sticky panel of
 * examples on wide screens, stacked below them on narrow ones.
 *
 * Pages choose it with `layout: api` in front matter, or `layout: api` in `defaults` in
 * `slipway.yml` for a folder. The examples come from front matter:
 *
 * - `examples: [{ title, lang, code }]` — one panel entry per example; `title` and `lang` are
 *   optional, `code` is what the panel shows.
 * - `example: "..."` — a single example, used when `examples` has nothing usable.
 *
 * Entries that are not the shape above are dropped, never a broken page. The body's own
 * `h1` wins over the title, by the same rule as `doc` so the page never renders two. The page
 * body may contain `endpoint` components; this layout only places it, the component styles it.
 */

/** One example in the panel: the heading, the optional language note, and the code. */
interface Example {
  readonly title: string;
  readonly lang: string;
  readonly code: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** True when the body already supplies the page's `h1`, by the engine's `resolveTitle` rule. */
function titleFromBody(props: LayoutProps): boolean {
  return props.page.headings.some((heading) => heading.depth === 1);
}

/** The heading for an example: its own title, else `Example {n}` in the page's language. */
function titleOf(fields: Readonly<Record<string, unknown>>, index: number, lang: string): string {
  const title = fields.title;
  return isString(title) && title.trim() !== "" ? title : t(lang, "api_example", { n: index + 1 });
}

/** The examples from front matter, in document order; unusable entries are dropped. */
export function examplesOf(frontMatter: LayoutProps["page"]["frontMatter"], lang: string): readonly Example[] {
  const examples: Example[] = [];

  const list = frontMatter.examples;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (isString(entry)) {
        if (entry.trim() !== "") examples.push({ title: t(lang, "api_example", { n: examples.length + 1 }), lang: "", code: entry });
        continue;
      }
      if (!isRecord(entry)) continue;
      const code = entry.code;
      if (!isString(code) || code.trim() === "") continue;
      const exampleLang = entry.lang;
      examples.push({
        title: titleOf(entry, examples.length, lang),
        lang: isString(exampleLang) ? exampleLang : "",
        code,
      });
    }
  }

  if (examples.length > 0) return examples;

  const single = frontMatter.example;
  if (isString(single) && single.trim() !== "") {
    return [{ title: t(lang, "api_example", { n: 1 }), lang: "", code: single }];
  }
  return [];
}

/** One panel entry: the example's heading, its language note when it has one, and its code. */
function exampleItem(example: Example, index: number): ComponentChildren {
  return h(
    "li",
    { class: "api-example" },
    h("h3", { class: "api-example-title" }, example.title),
    example.lang === "" ? null : h("p", { class: "api-example-lang" }, example.lang),
    h(
      "pre",
      { class: "api-example-code" },
      h("code", { class: example.lang === "" ? undefined : `language-${example.lang}` }, example.code),
    ),
  );
}

/** The examples panel, or nothing when the page has no example to show. */
function examplesPanel(props: LayoutProps, examples: readonly Example[]): ComponentChildren {
  if (examples.length === 0) return null;
  return h(
    "aside",
    { class: "api-examples", "aria-labelledby": "api-examples-title" },
    h("h2", { class: "api-examples-title", id: "api-examples-title" }, t(props.page.lang, "api_examples")),
    h("ul", { class: "api-examples-list" }, examples.map(exampleItem)),
  );
}

/** The page itself: breadcrumb, title, and body, marked for Pagefind. */
function article(props: LayoutProps): ComponentChildren {
  const { page } = props;
  return h(
    "article",
    { class: "doc", "data-pagefind-body": true },
    breadcrumb(props) as ComponentChildren,
    titleFromBody(props) ? null : h("h1", null, page.title),
    h("div", { class: "doc-body", dangerouslySetInnerHTML: { __html: page.html } }),
  );
}

/**
 * The API page: the base shell with the header and the mobile drawer on top, the navigation
 * sidebar, the on-this-page aside, and the article beside the examples panel. `api.css` places
 * those two columns and stacks them below its breakpoint.
 */
const api: Layout = (props) => {
  const examples = examplesOf(props.page.frontMatter, props.page.lang);
  return base({
    ...props,
    header: h(
      Fragment,
      null,
      header(props) as ComponentChildren,
      drawer(props) as ComponentChildren,
    ),
    sidebar: sidebar(props) as ComponentChildren,
    main: h("div", { class: "api-page" }, article(props), examplesPanel(props, examples)),
    aside: toc(props) as ComponentChildren,
  });
};

export default api;
