# Footnote popover

A GFM footnote reference (`<sup><a … data-footnote-ref>1</a></sup>`) shows its note in a small
tooltip on hover or focus. The reference stays a plain link, so a visitor without JavaScript still
navigates to the footnote at the end of the page, and the note's back-link still returns them to the
reference.

## Files

- `index.ts`: the Preact component. It renders one hidden `<span class="footnote-popover"
  role="tooltip">` mount point, and only on a doc page whose rendered HTML holds a footnote
  reference. A component cannot attach to GFM's markup (the reference and the definition section are
  generated after the Markdown stage), so the unit is chrome rather than a component.
- `style.css`: the tooltip, from design tokens only. It is absolutely positioned below the
  reference, with logical insets so Persian and Arabic pages open it in their reading direction.
  `client.ts` marks the reference's `<sup>` with `data-footnote-anchor`, which makes that element
  the containing block.
- `client.ts`: the island. It finds every `[data-footnote-ref]`, resolves the definition by the
  link's `#id`, copies the note's text without its back-links, and shows it in the mount point on
  `mouseenter` and `focus`. `mouseleave` and `blur` hide it, and Escape hides it from anywhere in
  the document. It never calls `preventDefault`, adds no click handler, and takes no focus, so the
  plain link still navigates and focus order is unchanged. With no references it does nothing.
- `../../test/chrome-footnote-popover.test.ts`: the unit's tests.

## Placement

`layouts/base.ts` places the unit once, after the page's layout and before the footer, so every
page that needs a popover has one. On a page with no footnote reference the component returns
`null`, and the layout output is unchanged.

## Limits

The engine does not wire chrome islands or chrome stylesheets into built pages yet
(`packages/engine/src/pipeline/build.ts` collects component islands only). Until it does, a built
page keeps the plain link to the footnote, which is the no-JavaScript fallback and works today; the
popover starts working when the engine loads `chrome/footnote-popover/client.ts` and
`chrome/footnote-popover/style.css`. The footnote definitions themselves come from `remark-gfm` and
are unchanged by this unit.
