import { h } from "preact";
import type { Component } from "@velella/mizzen/contracts";
import { t } from "../../i18n/index.ts";

/** The Markdown directive this component handles: `::symbol-popover{name="…"}`. */
export const directive = "symbol-popover";

/** Class on the inline chip. `style.css` draws it and reveals its tooltip. */
export const SYMBOL_CLASS = "symbol-popover";

/** Class on the popover that holds the signature and the reference link. */
export const TOOLTIP_CLASS = "symbol-popover-tooltip";

/** Class on the signature, shown as code text. */
export const SIGNATURE_CLASS = "symbol-popover-signature";

/** Class on the optional link to the symbol's reference page. */
export const LINK_CLASS = "symbol-popover-link";

/** Props from the directive: `::symbol-popover{name=… signature=… href=…}`. Every value is a string. */
export type SymbolPopoverProps = {
  /** The symbol's name, shown on the chip. Required: without it the component renders nothing. */
  name?: string;
  /** The signature shown in the popover, as code text: `runExample(input: Input): Promise<Result>`. */
  signature?: string;
  /** An optional reference page: root-relative or `http`/`https`. Anything else is ignored. */
  href?: string;
};

/**
 * A URL the popover may link to: root-relative (`/reference/runner/`, but not protocol-relative
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

/**
 * A named symbol in running text. The chip shows the name; hovering or focusing it reveals the
 * signature and, when the directive gives one, a link to the reference page. The popover is hidden
 * with CSS by default, so a page without JavaScript still shows it on hover and keyboard focus.
 * A symbol inside an ordinary fenced code block needs engine markers (not in scope here); the
 * directive on its own line is the supported form.
 */
const symbolPopover: Component<SymbolPopoverProps> = ({ props, page }) => {
  const name = textOf(props.name);
  if (name === "") return null;

  const signature = textOf(props.signature);
  const href = referenceHref(props.href);
  const tooltip =
    signature === "" && href === undefined
      ? null
      : h(
          "span",
          { class: TOOLTIP_CLASS, role: "tooltip" },
          signature === "" ? null : h("code", { class: SIGNATURE_CLASS }, signature),
          href === undefined ? null : h("a", { class: LINK_CLASS, href }, t(page.lang, "symbol_reference")),
        );

  return h("span", { class: SYMBOL_CLASS, tabindex: 0, "data-symbol": name }, name, tooltip);
};

export default symbolPopover;
