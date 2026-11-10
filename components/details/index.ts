import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";

/** Summary text used when the directive gives none. */
export const DEFAULT_SUMMARY = "Details";

/** Class on the styled `<details>` element. */
export const DETAILS_CLASS = "details";

/** Class on the disclosure control. */
export const SUMMARY_CLASS = "details-summary";

/** Class on the body that holds the rendered Markdown. */
export const BODY_CLASS = "details-body";

export type DetailsProps = {
  /** Text of the disclosure control. */
  summary?: string;
  /** Present (any value, as in `:::details{open}`) when the block starts expanded. */
  open?: string;
};

/**
 * `:::details{summary="…"}` renders a styled `<details>`. It is the native disclosure, so it
 * works without JavaScript, and the browser opens it when the URL anchor is inside it.
 */
export default function details({ props, html }: ComponentProps<DetailsProps>) {
  const summary = props.summary?.trim() ? props.summary : DEFAULT_SUMMARY;
  return h(
    "details",
    { class: DETAILS_CLASS, open: "open" in props },
    h("summary", { class: SUMMARY_CLASS }, summary),
    h("div", { class: BODY_CLASS, dangerouslySetInnerHTML: { __html: html } }),
  );
}
