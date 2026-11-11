import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::symbol-popover{name="…"}`. */
export const directive = "symbol-popover";

/** Class on the disclosure root, or on the static chip when there is nothing to disclose. */
export const SYMBOL_CLASS = "symbol-popover";

/** Class on the chip: the `<summary>` of the disclosure, or the static chip's label. */
export const CHIP_CLASS = "symbol-popover-chip";

/** Class on the panel that holds the signature and the reference link. */
export const PANEL_CLASS = "symbol-popover-panel";

/** Class on the signature, shown as code text. */
export const SIGNATURE_CLASS = "symbol-popover-signature";

/** Class on the optional link to the symbol's reference page. */
export const LINK_CLASS = "symbol-popover-link";

/** Props from the directive: `::symbol-popover{name=… signature=… href=…}`. Every value is a string. */
export type SymbolPopoverProps = {
  /** The symbol's name, shown on the chip. Required: without it the component renders nothing. */
  name?: string;
  /** The signature shown in the panel, as code text: `runExample(input: Input): Promise<Result>`. */
  signature?: string;
  /** An optional reference page: root-relative or `http`/`https`. Anything else is ignored. */
  href?: string;
};

/**
 * A URL the panel may link to: root-relative (`/reference/runner/`, but not protocol-relative
 * `//host`) or `http`/`https`. Anything else (`javascript:`, a relative path) renders no link.
 */
const SAFE_HREF = /^(?:\/(?![/\\])|https?:\/\/)[^\s"'<>\\]*$/i;

/** A prop as trimmed text; `undefined` for anything that is not a string. */
export function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The reference URL to use, or `undefined` when the prop is missing or not a safe URL. */
export function referenceHref(value: unknown): string | undefined {
  const href = textOf(value);
  return SAFE_HREF.test(href) ? href : undefined;
}

/** What a copy action takes: the signature when there is one, otherwise the name, never the reference label. */
export function copyValueOf(name: string, signature: string): string {
  return signature === "" ? name : signature;
}

/**
 * A named symbol in running text: a native `<details>` disclosure. The chip is its `<summary>`, so
 * a tap, click, Enter, or Space opens it, and the signature and reference link are ordinary content
 * inside. Native details means no JavaScript is needed to open or read it, and no element inside a
 * tooltip is interactive because there is no tooltip role at all.
 *
 * The island only adds Escape and outside dismissal, with focus returning to the chip. The
 * disclosure needs no ids, so repeated names or explicit ids cannot collide in a relationship.
 * A symbol inside an ordinary fenced code block needs engine markers (not in scope here); the
 * directive on its own line is the supported form.
 */
const symbolPopover: Component<SymbolPopoverProps> = ({ props, page }) => {
  const name = textOf(props.name);
  if (name === "") return null;

  const signature = textOf(props.signature);
  const href = referenceHref(props.href);
  const copyValue = copyValueOf(name, signature);

  if (signature === "" && href === undefined) {
    return h(
      "span",
      { class: `${SYMBOL_CLASS} ${CHIP_CLASS}`, "data-symbol": name, "data-copy-value": copyValue },
      name,
    );
  }

  return h(
    "details",
    { class: SYMBOL_CLASS, "data-symbol": name },
    h("summary", { class: CHIP_CLASS, "data-copy-value": copyValue }, name),
    h(
      "div",
      { class: PANEL_CLASS },
      signature === "" ? null : h("code", { class: SIGNATURE_CLASS }, signature),
      href === undefined ? null : h("a", { class: LINK_CLASS, href }, t(page.lang, "symbol_reference")),
    ),
  );
};

export default symbolPopover;
