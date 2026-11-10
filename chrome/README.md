# Chrome

Chrome is everything around the content: header, sidebar, footer, table of contents. One folder per part: `chrome/<name>/`, lowercase kebab-case ([ADR 0023](../../../docs/adr/0023-engine-theme-boundary.md)).

A folder holds `index.ts` (the Preact component, written with `h()`; its default export is the component), `style.css`, an optional `client.ts` (its island), and its tests.

Example, `chrome/footer/index.ts`:

```ts
import { h } from "preact";

export default function footer() {
  return h("footer", null, "Built with Lateen");
}
```
