import { h } from "preact";
import type { ComponentChildren } from "preact";
import type { Layout, LayoutProps } from "@velella/mizzen/contracts";
import base from "./base.ts";
import { t } from "../i18n/index.ts";

/** Id of the query field, which its label points to. */
export const SEARCH_RESULTS_INPUT_ID = "search-results-input";

/** Most results shown on the page; Pagefind ranks them and the top of the list is what a reader wants. */
export const RESULT_LIMIT = 20;

/** A value safe to put inside the inline module script: `<` cannot close the tag early. */
export function scriptValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The page's client code. It reads `q` from the address, loads the Pagefind index from `base`,
 * searches, announces the count in the status region, and builds result links and excerpts from
 * text nodes. Pagefind's excerpts carry only its own `<mark>` emphasis, so the excerpt is parsed in
 * an inert `<template>` and only text and `<mark>` elements are copied into the page.
 */
function clientScript(props: LayoutProps): string {
  const lang = props.page.lang;
  const messages = {
    empty: t(lang, "search_results_empty"),
    failed: t(lang, "search_results_failed"),
    loading: t(lang, "search_results_loading"),
    many: t(lang, "search_count"),
    one: t(lang, "search_results_one"),
  };
  return `const base = ${scriptValue(props.site.config.base)};
const messages = ${scriptValue(messages)};
const input = document.querySelector("[data-search-input]");
const status = document.querySelector("[data-search-status]");
const list = document.querySelector("[data-search-results]");
const query = new URLSearchParams(location.search).get("q") || "";
if (input) input.value = query;

function safeHref(url) {
  return url.startsWith("/") || url.startsWith("./") || url.startsWith("../") || /^https?:\\/\\//i.test(url) ? url : undefined;
}

/** Copies text nodes and Pagefind's <mark> elements out of the inert excerpt template. */
function copyExcerpt(node, target) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) target.append(document.createTextNode(child.nodeValue));
    else if (child.nodeName === "MARK") {
      const mark = document.createElement("mark");
      copyExcerpt(child, mark);
      target.append(mark);
    } else copyExcerpt(child, target);
  }
}

function render(records) {
  if (!list) return;
  const items = [];
  for (const record of records) {
    const href = safeHref(record.url);
    const link = document.createElement(href === undefined ? "span" : "a");
    link.className = "search-results-link";
    if (href !== undefined) link.setAttribute("href", href);
    const title = document.createElement("span");
    title.className = "search-results-title";
    title.textContent = record.meta && record.meta.title ? record.meta.title : record.url;
    const excerpt = document.createElement("span");
    excerpt.className = "search-results-excerpt";
    const template = document.createElement("template");
    template.innerHTML = record.excerpt || "";
    copyExcerpt(template.content, excerpt);
    link.append(title, excerpt);
    const item = document.createElement("li");
    item.append(link);
    items.push(item);
  }
  list.replaceChildren(...items);
}

if (status && list && query.trim() !== "") {
  status.textContent = messages.loading;
  import(base.replace(/\\/$/, "") + "/pagefind/pagefind.js")
    .then((api) => api.search(query))
    .then((page) => Promise.all(page.results.slice(0, ${RESULT_LIMIT}).map((hit) => hit.data())))
    .then((records) => {
      render(records);
      status.textContent =
        records.length === 0
          ? messages.empty.replace("{query}", () => query)
          : records.length === 1
            ? messages.one
            : messages.many.replace("{n}", () => String(records.length));
    })
    .catch(() => {
      status.textContent = messages.failed;
    });
}`;
}

/**
 * The search results content: the page title, a labelled GET form that submits to this page, the
 * status region, the result list, and the no-JavaScript note. The form works on its own; the
 * inline module fills the list when the reader has JavaScript and the query is in the address.
 */
function content(props: LayoutProps): ComponentChildren {
  const lang = props.page.lang;
  return h(
    "div",
    { class: "search-results", "data-search-page": "" },
    h("h1", { class: "search-results-title-page" }, props.page.title),
    h(
      "form",
      { class: "search-results-form", role: "search", action: props.page.url, method: "get", "data-search-form": "" },
      h("label", { class: "search-results-label", for: SEARCH_RESULTS_INPUT_ID }, t(lang, "search")),
      h("input", {
        class: "search-results-input",
        id: SEARCH_RESULTS_INPUT_ID,
        type: "search",
        name: "q",
        autocomplete: "off",
        "data-search-input": "",
      }),
      h("button", { class: "search-results-submit", type: "submit" }, t(lang, "search")),
    ),
    h("p", { class: "search-results-status", role: "status", "data-search-status": "" }, ""),
    h("noscript", null, h("p", { class: "search-results-nojs" }, t(lang, "search_results_js"))),
    h("ol", { class: "search-results-list", "data-search-results": "" }),
    h("script", { type: "module", dangerouslySetInnerHTML: { __html: clientScript(props) } }),
  );
}

/**
 * The search results page, a dedicated page usable without the dialog.
 *
 * It is named `search-results` rather than `search`: the engine-boundary gate reads every layout
 * name in this folder and rejects it inside `packages/engine/`, and the engine's search output uses
 * the word `search`. Renaming the layout keeps that gate honest about the boundary.
 */
const searchResults: Layout = (props) => base({ ...props, main: content(props) });

export default searchResults;
