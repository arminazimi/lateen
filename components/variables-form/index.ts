import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::variables-form`. */
export const directive = "variables-form";

/** Class on the `<fieldset>` that holds the form; `style.css` styles it and `client.ts` finds it by `data-variables-form`. */
export const FORM_CLASS = "variables-form";

/** Class on the legend naming the group. */
export const LEGEND_CLASS = "variables-form-legend";

/** Class on the hint that says values stay in the browser. */
export const HINT_CLASS = "variables-form-hint";

/** Class on the element that lays the fields out. */
export const FIELDS_CLASS = "variables-form-fields";

/** Class on one label-and-input pair. */
export const FIELD_CLASS = "variables-form-field";

/** Class on a variable's label. */
export const LABEL_CLASS = "variables-form-label";

/** Class on a variable's text input. */
export const INPUT_CLASS = "variables-form-input";

/** Id prefix used when the directive gives none. */
export const DEFAULT_ID = "variables-form";

/** One variable as N33 declares it in `_data/variables.yml` or a page's front matter. */
export interface VariableDeclaration {
  /** The name between the braces: `api_key` in `{{api_key}}`. */
  readonly name: string;
  /** The value the form starts with, when the declaration gives one. */
  readonly default?: unknown;
  /** What kind of value the variable takes, such as `string` or `url`, when the declaration gives one. */
  readonly type?: string;
}

/** One input the form renders: a variable name and the default shown as both value and placeholder. */
export interface VariableField {
  /** The variable name. It labels the input and is the placeholder's `data-var` value. */
  readonly name: string;
  /** The declared default as text; empty when the declaration gives none or gives a non-scalar. */
  readonly value: string;
  /** The declared type, when there is one. */
  readonly type?: string;
}

export type VariablesFormProps = {
  /** Prefix for this form's element ids. Give each form on a page its own id. */
  id?: string;
  /**
   * JSON array of declarations, each `{"name":"…","default":"…","type":"…"}`, for a form that should not use the
   * page's or site's declarations. When it is missing or unreadable, the page front matter and `site.data` win.
   */
  variables?: unknown;
};

/** Compares by code point, never by locale (ADR 0022, rule 5). */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The id prefix, reduced to letters, digits, `-` and `_` so a prop cannot break the markup. */
export function idBase(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") : "";
  return text || DEFAULT_ID;
}

/** The id suffix for a variable, kept unique per position even when two names sanitize alike. */
export function fieldId(base: string, name: string, index: number): string {
  const slug = name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "variable";
  return `${base}-${slug}-${index + 1}`;
}

/** One scalar default as the text an input carries. A missing, null, or structured default becomes empty. */
export function valueOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "";
}

/** The declaration in one list item, or undefined when it has no usable name. */
function declarationOf(item: unknown): VariableDeclaration | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
  const record = item as Readonly<Record<string, unknown>>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") return undefined;
  const rawType = record.type;
  return {
    name,
    ...(Object.hasOwn(record, "default") ? { default: record.default } : {}),
    ...(typeof rawType === "string" && rawType.trim() !== "" ? { type: rawType.trim() } : {}),
  };
}

/** The JSON or array behind a declarations prop, or undefined when it is absent or not a list. */
function listOf(raw: unknown): unknown[] | undefined {
  if (typeof raw === "string") {
    if (raw.trim() === "") return undefined;
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return Array.isArray(raw) ? raw : undefined;
}

/**
 * The declarations in a N33-shaped list: an array of `{name, default?, type?}`. An absent or malformed value
 * gives an empty list; a declaration without a non-empty string `name` is skipped. Names and types are trimmed.
 */
export function declarationsOf(value: unknown): VariableDeclaration[] {
  return (listOf(value) ?? []).map(declarationOf).filter((item): item is VariableDeclaration => item !== undefined);
}

/**
 * The declarations from the `variables` prop, or undefined when the prop is absent or unreadable, so the
 * caller falls back to page and site data. An empty array is an explicit "no variables".
 */
export function parseDeclarations(raw: unknown): VariableDeclaration[] | undefined {
  const list = listOf(raw);
  if (list === undefined) return undefined;
  return list.map(declarationOf).filter((item): item is VariableDeclaration => item !== undefined);
}

/**
 * Two declaration lists merged by name, sorted by code point. A later declaration fills a default or type the
 * first one left out and otherwise wins, so front matter can override one value from `site.data`.
 */
export function mergeDeclarations(
  first: readonly VariableDeclaration[],
  second: readonly VariableDeclaration[],
): VariableDeclaration[] {
  const merged = new Map<string, VariableDeclaration>();
  for (const declaration of [...first, ...second]) {
    const prior = merged.get(declaration.name);
    merged.set(declaration.name, prior === undefined ? declaration : { ...prior, ...declaration });
  }
  return [...merged.values()].sort((a, b) => byCodePoint(a.name, b.name));
}

/** The variables to show: the prop when it is a list, otherwise front matter over `site.data.variables`. */
export function declarationsFor(
  props: VariablesFormProps,
  page: { readonly frontMatter?: Readonly<Record<string, unknown>> } | undefined,
  site: { readonly data?: Readonly<Record<string, unknown>> } | undefined,
): readonly VariableDeclaration[] {
  const fromProps = parseDeclarations(props.variables);
  if (fromProps !== undefined) return fromProps;
  const fromPage = declarationsOf(page?.frontMatter?.variables);
  const fromSite = declarationsOf(site?.data?.variables);
  return mergeDeclarations(fromSite, fromPage);
}

/** The fields the form renders, in code-point order, each with its default as text. */
export function fieldsFor(
  props: VariablesFormProps,
  page: { readonly frontMatter?: Readonly<Record<string, unknown>> } | undefined,
  site: { readonly data?: Readonly<Record<string, unknown>> } | undefined,
): VariableField[] {
  return declarationsFor(props, page, site).map((declaration) => ({
    name: declaration.name,
    value: valueOf(declaration.default),
    ...(declaration.type === undefined ? {} : { type: declaration.type }),
  }));
}

/**
 * A personalization form for the variables a page's code examples use. Each variable gets a labelled input,
 * and the declared default is both its value and its placeholder, so the form reads correctly and shows the
 * defaults before any script runs. The island (`client.ts`) copies what the reader types into that variable's
 * placeholders; nothing is stored and nothing leaves the browser. With no variable at all it renders nothing.
 */
export default function variablesForm({ props, page, site }: ComponentProps<VariablesFormProps>) {
  const fields = fieldsFor(props, page, site);
  if (fields.length === 0) return null;

  const base = idBase(props.id);
  const lang = page?.lang ?? "en";
  const hintId = `${base}-hint`;

  return h(
    "fieldset",
    { class: FORM_CLASS, "data-variables-form": "" },
    h("legend", { class: LEGEND_CLASS, id: `${base}-legend` }, t(lang, "variables_form_legend")),
    h("p", { class: HINT_CLASS, id: hintId }, t(lang, "variables_form_hint")),
    h(
      "div",
      { class: FIELDS_CLASS },
      fields.map((field, index) => {
        const id = fieldId(base, field.name, index);
        return h(
          "div",
          { class: FIELD_CLASS, key: field.name },
          h("label", { class: LABEL_CLASS, for: id }, field.name),
          h("input", {
            class: INPUT_CLASS,
            id,
            name: field.name,
            type: "text",
            value: field.value,
            placeholder: field.value,
            "data-var": field.name,
            "aria-describedby": hintId,
            autocomplete: "off",
            spellcheck: "false",
          }),
        );
      }),
    ),
  );
}
