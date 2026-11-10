import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps, Page } from "@velella/mizzen/contracts";
import { t } from "../i18n/index.ts";
import base from "./base.ts";
import blockActions from "../chrome/block-actions/index.ts";
import breadcrumb from "../chrome/breadcrumb/index.ts";
import copyMarkdown from "../chrome/copy-markdown/index.ts";
import drawer from "../chrome/drawer/index.ts";
import feedback from "../chrome/feedback/index.ts";
import header from "../chrome/header/index.ts";
import pageFooter from "../chrome/page-footer/index.ts";
import pager from "../chrome/pager/index.ts";
import sidebar from "../chrome/sidebar/index.ts";
import toc from "../chrome/toc/index.ts";
import pageStatus, { type PageStatusProps } from "../components/page-status/index.ts";
import readingTime from "../components/reading-time/index.ts";

/**
 * A tutorial step: a title and the heading id it links to. Steps come from the page's depth-2
 * headings, or from a `steps: [{ title, id? }]` front-matter list when the page is a tutorial whose
 * steps are not h2 headings. A step without an `id` is anchored to a slug of its title.
 */
export interface TutorialStep {
  readonly title: string;
  readonly id: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A lower-case anchor id from a title: letters and numbers, runs of other characters become `-`. */
export function slugOf(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** The valid entries of a front-matter `steps` list, in order, with duplicate ids dropped. */
function stepsFromFrontMatter(value: unknown): TutorialStep[] {
  if (!Array.isArray(value)) return [];
  const steps: TutorialStep[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (title === "") continue;
    const given = typeof item.id === "string" ? item.id.trim() : "";
    const id = given === "" ? slugOf(title) : given;
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    steps.push({ title, id });
  }
  return steps;
}

/** The page's steps: front matter when it lists any, else its depth-2 headings. */
export function stepsOf(page: Page): TutorialStep[] {
  const fromFrontMatter = stepsFromFrontMatter(page.frontMatter.steps);
  if (fromFrontMatter.length > 0) return fromFrontMatter;

  const steps: TutorialStep[] = [];
  const seen = new Set<string>();
  for (const heading of page.headings) {
    if (heading.depth !== 2 || seen.has(heading.id)) continue;
    seen.add(heading.id);
    steps.push({ title: heading.text, id: heading.id });
  }
  return steps;
}

/**
 * True when the body already supplies the page's `h1`, by the same rule as the engine's
 * `resolveTitle`: any top-level depth-1 heading counts, even when front matter wins the title,
 * so the layout never renders a second `h1` above it.
 */
function titleFromBody(props: LayoutProps): boolean {
  return props.page.headings.some((heading) => heading.depth === 1);
}

/** The banner's props from front matter: a key is passed only when it holds a usable value. */
function statusProps(page: LayoutProps["page"]): PageStatusProps {
  const { status, since, replaced_by } = page.frontMatter;
  return {
    ...(status === undefined ? {} : { status }),
    ...(typeof since === "string" ? { since } : {}),
    ...(typeof replaced_by === "string" ? { replaced_by } : {}),
  };
}

/** "Step n of N", localised through the theme's string table. */
function stepCount(lang: string, index: number, total: number): string {
  return t(lang, "tutorial_step", { n: index + 1, total });
}

/** The numbered list of steps, every item a link to its heading and its own "Step n of N" text. */
function progress(page: Page, steps: readonly TutorialStep[]): ComponentChildren {
  return h(
    "nav",
    { class: "tutorial-progress", "aria-label": t(page.lang, "tutorial_steps") },
    h(
      "ol",
      { class: "tutorial-step-list" },
      ...steps.map((step, index) =>
        h(
          "li",
          { class: "tutorial-step-item" },
          h(
            "a",
            { class: "tutorial-step-link", href: `#${step.id}` },
            h("span", { class: "tutorial-step-count" }, stepCount(page.lang, index, steps.length)),
            h("span", { class: "tutorial-step-title" }, step.title),
          ),
        ),
      ),
    ),
  );
}

/** Where each step's `h2` starts in the rendered body, or undefined when the ids do not line up. */
function headingStarts(html: string, steps: readonly TutorialStep[]): number[] | undefined {
  const starts: number[] = [];
  let previous = -1;
  for (const step of steps) {
    const escaped = step.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`<h2\\b[^>]*\\bid="${escaped}"`, "i").exec(html);
    if (match === null || match.index <= previous) return undefined;
    starts.push(match.index);
    previous = match.index;
  }
  return starts;
}

/** The body split at the step headings: content before the first step, then one segment per step. */
function splitBody(
  page: Page,
  steps: readonly TutorialStep[],
): { readonly intro: string; readonly segments: readonly { readonly step: TutorialStep; readonly html: string }[] } | undefined {
  const starts = headingStarts(page.html, steps);
  const first = starts?.[0];
  if (starts === undefined || first === undefined) return undefined;
  return {
    intro: page.html.slice(0, first),
    segments: steps.map((step, index) => ({
      step,
      html: page.html.slice(starts[index] ?? first, starts[index + 1] ?? page.html.length),
    })),
  };
}

/** Previous and next step links, pointing at the adjacent step's heading id. */
function stepNav(page: Page, steps: readonly TutorialStep[], index: number): ComponentChildren {
  const prev = steps[index - 1];
  const next = steps[index + 1];
  if (prev === undefined && next === undefined) return null;

  return h(
    "nav",
    { class: "tutorial-step-nav", "aria-label": t(page.lang, "tutorial_step_navigation") },
    prev === undefined
      ? null
      : h(
          "a",
          { class: "tutorial-step-link tutorial-step-prev", href: `#${prev.id}`, rel: "prev" },
          h("span", { class: "tutorial-step-nav-label" }, t(page.lang, "tutorial_previous")),
          h("span", { class: "tutorial-step-nav-title" }, prev.title),
        ),
    next === undefined
      ? null
      : h(
          "a",
          { class: "tutorial-step-link tutorial-step-next", href: `#${next.id}`, rel: "next" },
          h("span", { class: "tutorial-step-nav-label" }, t(page.lang, "tutorial_next")),
          h("span", { class: "tutorial-step-nav-title" }, next.title),
        ),
  );
}

/** One step: its progress text, the step's rendered body, and the links to the adjacent steps. */
function stepSection(
  page: Page,
  steps: readonly TutorialStep[],
  step: TutorialStep,
  index: number,
  segmentHtml: string,
): ComponentChildren {
  return h(
    "section",
    { class: "tutorial-step", "data-step": String(index + 1) },
    h("p", { class: "tutorial-step-progress" }, stepCount(page.lang, index, steps.length)),
    h("div", { class: "tutorial-step-body", dangerouslySetInnerHTML: { __html: segmentHtml } }),
    stepNav(page, steps, index),
  );
}

/**
 * The body: split at the step headings so each step gets its own progress text and adjacent links.
 * When the step ids are not all h2 headings in the body, the body renders whole and only the
 * progress list remains; nothing is lost or reordered.
 */
function body(page: Page, steps: readonly TutorialStep[]): ComponentChildren {
  if (steps.length === 0) {
    return h("div", { class: "doc-body", dangerouslySetInnerHTML: { __html: page.html } });
  }

  const split = splitBody(page, steps);
  if (split === undefined) {
    return h("div", { class: "doc-body", dangerouslySetInnerHTML: { __html: page.html } });
  }

  return h(
    "div",
    { class: "doc-body tutorial-body" },
    split.intro === "" ? null : h("div", { class: "tutorial-intro", dangerouslySetInnerHTML: { __html: split.intro } }),
    ...split.segments.map((segment, index) => stepSection(page, steps, segment.step, index, segment.html)),
  );
}

/**
 * The tutorial page: breadcrumb, status banner, title, progress list, the steps with adjacent
 * links, page footer, copy-Markdown control, feedback, and pager, marked for Pagefind.
 */
function article(props: LayoutProps): ComponentChildren {
  const { page } = props;
  const steps = stepsOf(page);
  return h(
    "article",
    { class: "doc tutorial", "data-pagefind-body": true },
    breadcrumb(props) as ComponentChildren,
    pageStatus({ props: statusProps(page), page, site: props.site, html: "" }) as ComponentChildren,
    titleFromBody(props) ? null : h("h1", null, page.title),
    readingTime({ props: {}, page, site: props.site, html: "" }) as ComponentChildren,
    steps.length === 0 ? null : progress(page, steps),
    body(page, steps),
    pageFooter(props) as ComponentChildren,
    copyMarkdown(props) as ComponentChildren,
    feedback(props) as ComponentChildren,
    pager(props) as ComponentChildren,
  );
}

/**
 * The tutorial page: the doc layout's shell, sidebar, and on-this-page aside, with the article
 * replaced by the step-by-step one. `tutorial.css` styles the progress list and the step links.
 */
const tutorial: Layout = (props) =>
  base({
    ...props,
    header: h(
      Fragment,
      null,
      header(props) as ComponentChildren,
      drawer(props) as ComponentChildren,
    ),
    sidebar: sidebar(props) as ComponentChildren,
    main: h(Fragment, null, article(props), blockActions(props) as ComponentChildren),
    aside: toc(props) as ComponentChildren,
  });

export default tutorial;
