import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** The Markdown directive this component handles: `:::key-value` with one `key: value` per line. */
export const directive = "key-value";

/** Class on the `<dl>`. `style.css` lays it out in two columns. */
export const LIST_CLASS = "key-value";

/** Class on each key (`<dt>`). */
export const KEY_CLASS = "key-value-key";

/** Class on each value (`<dd>`). */
export const VALUE_CLASS = "key-value-value";

/** Extra class on a value long enough to need wrapping, so a page can target it. */
export const LONG_VALUE_CLASS = "key-value-long";

/** Values longer than this many characters also carry {@link LONG_VALUE_CLASS}. */
export const LONG_VALUE_LENGTH = 48;

/** The JSON type of a pair's value, as the payload names it. */
export type KeyValueType = "string" | "number" | "boolean" | "object" | "array" | "null";

/** One key and its value, in the order the author wrote them. Values keep the type the prop gave them. */
export interface KeyValueItem {
  readonly key: string;
  readonly value: unknown;
}

export type KeyValueProps = {
  /**
   * JSON array of pairs: `[{"key":"Version","value":"1.0"}]` or `[["Version","1.0"]]`.
   * When it is missing or unreadable the body's `key: value` lines are used instead.
   */
  items?: string;
};

/** The named character references a rendered Markdown body can contain. */
const ENTITIES: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };

/** Decodes one named or numeric character reference; an unknown one stays as written. */
function decodeEntity(match: string, hex: string | undefined, decimal: string | undefined, named: string | undefined): string {
  if (named !== undefined) return ENTITIES[named.toLowerCase()] ?? match;
  const code = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? "", 10);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** Decodes the character references Markdown leaves in text (`&amp;`, `&#39;`). */
export function decodeText(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi, decodeEntity);
}

/** One pair from an item, or undefined when it has no usable key. Values may be empty, and keep their type. */
function itemOf(key: unknown, value: unknown): KeyValueItem | undefined {
  if (key === undefined || key === null) return undefined;
  const name = String(key).trim();
  if (name === "") return undefined;
  return { key: name, value: value === undefined ? "" : value };
}

/** One element of the `items` array: an object with `key` and `value`, or a two-item pair. */
function pairOf(raw: unknown): KeyValueItem | undefined {
  if (Array.isArray(raw)) return itemOf(raw[0], raw[1]);
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Readonly<Record<string, unknown>>;
    return itemOf(record.key, record.value);
  }
  return undefined;
}

/**
 * The pairs from the `items` prop, in order. The prop is a JSON array of objects or pairs; anything that is
 * not a JSON array gives no pairs, so the caller can fall back to the body.
 */
export function parseItems(raw: unknown): KeyValueItem[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(pairOf).filter((item): item is KeyValueItem => item !== undefined);
}

/**
 * The pairs in the rendered body: one per `key: value` line, trimmed, blank lines skipped, in order. A line
 * without a colon is ignored. Soft line breaks in the Markdown survive as newlines in the HTML, so a plain
 * paragraph of pairs reads line by line; `<br>` and block ends are treated as line breaks too.
 */
export function parseBody(html: string): KeyValueItem[] {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|dt|dd|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const items: KeyValueItem[] = [];
  for (const line of decodeText(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (key !== "") items.push({ key, value });
  }
  return items;
}

/** A value as the list shows it: a string unchanged, anything else as JSON. Markup stays text, so it renders escaped. */
export function displayOf(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/** The JSON type of a value, for the published payload. */
export function valueTypeOf(value: unknown): KeyValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "object";
  }
}

/** The class names of a displayed value: the base class, plus the long-value marker when it is long. */
export function valueClassOf(value: string): string {
  return value.length > LONG_VALUE_LENGTH ? `${VALUE_CLASS} ${LONG_VALUE_CLASS}` : VALUE_CLASS;
}

/** One pair as published for automation: order kept, duplicate keys kept, the value exactly as supplied. */
export interface KeyValuePairNode {
  readonly key: string;
  readonly value: unknown;
  readonly type: KeyValueType;
}

/** The whole payload a list publishes for automation: its ordered pairs, duplicates included. */
export interface KeyValuePayload {
  /** Names the component, so a consumer knows how to read the rest. */
  readonly component: "key-value";
  /** Shape version; bumped when the meaning of a pair changes. */
  readonly version: 1;
  /** Pairs in list order, duplicate keys included. Body-authored values are strings. */
  readonly pairs: readonly KeyValuePairNode[];
}

/** The payload for one list: every displayed pair with its JSON type kept. */
export function pairsPayloadOf(items: readonly KeyValueItem[]): KeyValuePayload {
  return {
    component: "key-value",
    version: 1,
    pairs: items.map((item) => ({ key: item.key, value: item.value, type: valueTypeOf(item.value) })),
  };
}

/** JSON safe inside a `<script>` element: a `<` can never close the tag early. */
export function pairsJson(payload: KeyValuePayload): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/**
 * `:::key-value` renders a two-column list of keys and values: properties, options, metadata. Pairs come from
 * the `items` prop (a JSON array) or, when it gives none, from one `key: value` per line in the body. The markup
 * is a `<dl>`, so it reads as a description list without CSS or JavaScript; duplicates keep their order. An
 * inert JSON script publishes the same pairs with their JSON types, so agents read the authored values without
 * scraping the list.
 */
export default function keyValue({ props, html }: ComponentProps<KeyValueProps>) {
  const fromProps = parseItems(props.items);
  const items = fromProps.length > 0 ? fromProps : parseBody(html);
  if (items.length === 0) return null;

  return h(
    "dl",
    { class: LIST_CLASS },
    items.flatMap((item) => {
      const shown = displayOf(item.value);
      return [h("dt", { class: KEY_CLASS }, item.key), h("dd", { class: valueClassOf(shown) }, shown)];
    }),
    h("script", {
      type: "application/json",
      "data-key-value-pairs": "",
      dangerouslySetInnerHTML: { __html: pairsJson(pairsPayloadOf(items)) },
    }),
  );
}
