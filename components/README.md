# Components

A component is a piece of content or interface used inside pages (a callout, a code tab). One folder per component: `components/<name>/`, lowercase kebab-case ([ADR 0023](../../../docs/adr/0023-engine-theme-boundary.md)).

A folder holds `index.ts` (the Preact component, written with `h()`; its default export is the component), `style.css`, an optional `client.ts` (its island), and its tests.

Example, `components/callout/index.ts`:

```ts
import { h } from "preact";
import type { ComponentChildren } from "preact";

export default function callout({ children }: { children?: ComponentChildren }) {
  return h("aside", { class: "callout" }, children);
}
```
