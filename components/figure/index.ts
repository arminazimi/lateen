import { h } from "preact";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { baseOf, srcsetWithBase, withBase } from "../../src/url.ts";

/** Class on the `<figure>` element. */
export const FIGURE_CLASS = "figure";

/** Class added to a figure that has a dark image, so its styles can swap the pair. */
export const PAIRED_CLASS = "figure-paired";

/** The class of the paired figure's dark image; `style.css` keeps it out of view in every theme. */
export const DARK_IMAGE_CLASS = "figure-img figure-img-dark";

/** The wrapper that owns a pair's one accessible identity; both images inside it are presentational. */
export const PAIR_CLASS = "figure-pair";

/** Props from the directive: `:::figure{src=… alt=… caption=…}` or `::figure{src=…}`. Every value is a string. */
export type FigureProps = {
  /** The image. Without it the figure renders nothing. */
  src?: string;
  /** The image shown in dark mode. Without it, or when equal to `src`, one image is shown in both modes. */
  src_dark?: string;
  /** Text alternative for the image. Empty when missing, which marks the image as decorative. In a paired figure it names the wrapper, and both images stay presentational. */
  alt?: string;
  /** Caption text. When missing, the body of the directive is the caption. */
  caption?: string;
  /** Who made the image, shown under the caption. */
  credit?: string;
  /** Link for the credit. Only `http` and `https` addresses become links. */
  credit_url?: string;
  /** Responsive image candidates for `src` (the light image), passed to `srcset`. */
  srcset?: string;
  /** Layout hint for `srcset`, passed to `sizes`. */
  sizes?: string;
  /** Intrinsic width in pixels, so the layout does not shift when the image loads. */
  width?: string;
  /** Intrinsic height in pixels, so the layout does not shift when the image loads. */
  height?: string;
  /** `lazy` (the default) or `eager`. Use `eager` for an image above the fold. */
  loading?: string;
  /** `async` (the default), `sync`, or `auto`. */
  decoding?: string;
};

const LOADING = ["lazy", "eager"] as const;
const DECODING = ["async", "sync", "auto"] as const;

/** A whole number above zero, or `undefined` when the value is not one. */
export function dimension(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const number = Number(value.trim());
  return number > 0 ? number : undefined;
}

/** The credit link, or `undefined` unless it is an `http` or `https` address. */
export function creditHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The caption and credit under the image, or `null` when there is neither. */
function captionOf(props: FigureProps, html: string) {
  const caption = text(props.caption);
  const credit = text(props.credit);
  const href = creditHref(props.credit_url);

  let body = null;
  if (caption !== "") body = h("div", { class: "figure-text" }, caption);
  else if (html.trim() !== "") body = h("div", { class: "figure-text", dangerouslySetInnerHTML: { __html: html } });

  const creditNode =
    credit === ""
      ? null
      : h(
          "div",
          { class: "figure-credit" },
          href === undefined ? credit : h("a", { href, rel: "noopener" }, credit),
        );

  if (body === null && creditNode === null) return null;
  return h("figcaption", { class: "figure-caption" }, body, creditNode);
}

/**
 * An image with an optional caption and credit. It reserves its space with `width` and `height`, loads
 * lazily unless told otherwise, and with `src_dark` swaps to a second image in dark mode (`style.css`).
 * A pair keeps one accessible identity on its wrapper (`role="img"`, `aria-label`), while both images
 * are presentational (`alt=""`, `aria-hidden`), so assistive technology meets the figure exactly once in
 * either theme, with custom CSS, in forced colors, and before the styles load. The caption and credit
 * sit outside the wrapper, so they stay readable and a credit link stays operable. The body arrives
 * already rendered to HTML.
 */
export default function figure({ props, html, site }: ComponentProps<FigureProps>) {
  const authored = text(props.src);
  if (authored === "") return null;
  const base = baseOf(site);
  const src = withBase(base, authored);
  const alt = typeof props.alt === "string" ? props.alt : "";
  const authoredDark = text(props.src_dark);
  const darkSrc = authoredDark === "" ? "" : withBase(base, authoredDark);
  const paired = darkSrc !== "" && darkSrc !== src;
  const shared = {
    width: dimension(props.width),
    height: dimension(props.height),
    loading: oneOf(props.loading, LOADING, "lazy"),
    decoding: oneOf(props.decoding, DECODING, "async"),
  };

  const light = h("img", {
    class: paired ? "figure-img figure-img-light" : "figure-img",
    src,
    alt: paired ? "" : alt,
    "aria-hidden": paired ? "true" : undefined,
    srcset: typeof props.srcset === "string" && props.srcset !== "" ? srcsetWithBase(base, props.srcset) : undefined,
    sizes: typeof props.sizes === "string" && props.sizes !== "" ? props.sizes : undefined,
    ...shared,
  });
  const dark = paired
    ? h("img", { class: DARK_IMAGE_CLASS, src: darkSrc, alt: "", "aria-hidden": "true", ...shared })
    : null;
  const images = paired
    ? h("div", { class: PAIR_CLASS, role: alt === "" ? undefined : "img", "aria-label": alt === "" ? undefined : alt }, light, dark)
    : light;

  return h(
    "figure",
    { class: paired ? `${FIGURE_CLASS} ${PAIRED_CLASS}` : FIGURE_CLASS },
    images,
    captionOf(props, html),
  );
}
