/** The site's base path, or an empty string when a test passes no site model. */
export function baseOf(site: { readonly config?: { readonly base?: string } } | undefined): string {
  return site?.config?.base ?? "";
}

/**
 * Prefixes a root-relative URL with the site's base path. Absolute, protocol-relative, `data:`, and
 * fragment URLs are left as written, so an external address never becomes a local one.
 */
export function withBase(base: string, url: string): string {
  return url.startsWith("/") && !url.startsWith("//") ? `${base}${url}` : url;
}

/** Prefixes every root-relative candidate in a `srcset` list, keeping each descriptor. */
export function srcsetWithBase(base: string, srcset: string): string {
  return srcset
    .split(",")
    .map((candidate) => {
      const [url = "", ...descriptor] = candidate.trim().split(/\s+/);
      return [withBase(base, url), ...descriptor].join(" ");
    })
    .join(", ");
}
