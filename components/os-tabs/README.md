# OS tabs

Install instructions as one tab per operating system. The directive is `:::os-tabs`; each `##` or `###`
heading in its body names an OS — macOS, Windows, or Linux — and starts that section.

- `index.ts`: the Preact component, its directive name, and the classes `style.css` and `client.ts` use.
  It reads the body's headings into sections, maps each label to `mac`, `win`, or `linux`, and writes the
  same tab and panel markup contract as `code-tabs`: a `role="tablist"` that starts `hidden`, one
  `role="tab"` button per section, and one panel per section. A body with no headings is kept whole, with
  no tabs, so nothing is dropped.
- `style.css`: the tab list and panels, styled with tokens and logical properties. Without JavaScript the
  list stays hidden and every panel shows stacked under its title.
- `client.ts`: the island. `detectOs()` maps `navigator.platform` to `mac`, `win`, `linux`, or `unknown`;
  the remembered choice in `localStorage["slipway-os-tabs"]` wins over it, and `unknown` falls back to the
  first tab. A click is remembered and applied to every other `os-tabs` group on the page, keeping the
  scroll offset where it was.

## Known gap

Component islands are not wired into built pages yet: `packages/engine/src/pipeline/build.ts`
(`componentsOf`) passes each component's CSS to the render host but not its `client.ts`, so a build shows
the no-JavaScript state — the tab list hidden and every section stacked — until island wiring lands.
