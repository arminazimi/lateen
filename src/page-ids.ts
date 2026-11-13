/** The ids claimed on one page object, and the page HTML they were counted against. */
const pages = new WeakMap<object, { html: unknown; used: Set<string> }>();

/**
 * The id base one instance owns on a page: `base` for the first claim, then `base-2`, `base-3` in page
 * order. Extra suffixes (`legend`, `hint`) are reserved with each claim, so a label or description id
 * cannot resolve into another instance. Keyed by the page object and reset when its HTML changes, so one
 * page's ids cannot leak into another page or build.
 */
export function instanceId(page: { readonly html?: unknown }, base: string, suffixes: readonly string[] = []): string {
  let state = pages.get(page);
  if (state === undefined || state.html !== page.html) {
    state = { html: page.html, used: new Set() };
    pages.set(page, state);
  }
  const keys = (id: string) => [id, ...suffixes.map((suffix) => `${id}-${suffix}`)];
  let id = base;
  for (let n = 2; keys(id).some((key) => state.used.has(key)); n += 1) id = `${base}-${n}`;
  for (const key of keys(id)) state.used.add(key);
  return id;
}
