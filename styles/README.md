# Styles

Site-wide CSS that belongs to no single unit (reset, base typography, page grid). One file per concern: `styles/<name>.css`, lowercase kebab-case. A unit's own CSS lives in its folder as `style.css`, not here.

The exception is a component a layout renders directly instead of page Markdown. The engine bundles a page's component CSS from the components its content uses, so a layout-only component's `style.css` would never load; its rules live here as `styles/parts-<name>.css` instead. These files load after `base.css` and before `print.css` and `rtl.css`, so their overrides still win.

Use logical properties only (`margin-inline-start`, not `margin-left`) so right-to-left pages work.

Example, `styles/base.css`:

```css
body {
  margin: 0;
  padding-inline: 1rem;
}
```
