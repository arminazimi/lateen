# Styles

Site-wide CSS that belongs to no single unit (reset, base typography, page grid). One file per concern: `styles/<name>.css`, lowercase kebab-case ([ADR 0023](../../../docs/adr/0023-engine-theme-boundary.md)). A unit's own CSS lives in its folder as `style.css`, not here.

Use logical properties only (`margin-inline-start`, not `margin-left`) so right-to-left pages work.

Example, `styles/base.css`:

```css
body {
  margin: 0;
  padding-inline: 1rem;
}
```
