# Layouts

A layout turns one page into a document. One file per layout: `layouts/<name>.ts`, with a lowercase kebab-case name that is unique here ([ADR 0023](../../../docs/adr/0023-engine-theme-boundary.md)).

Layouts are `.ts`, not `.tsx`: Node's type stripping does not transform JSX, so write elements with `h()` from `preact`. The file's default export is the layout, typed by the engine's layout contract.

Example, `layouts/doc.ts`:

```ts
import { h } from "preact";
import type { LayoutProps } from "../../engine/src/contracts/render.ts";

export default function doc({ page, children }: LayoutProps) {
  return h("main", null, h("h1", null, page.title), children);
}
```
