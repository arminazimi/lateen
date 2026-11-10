# Version badge

A small badge that says when a feature was added, changed, or removed: `v0.3` on screen and
"Added in version 0.3" to a screen reader. It is inline by default and block with the `block` word.

- `index.ts` renders the component. The icon and the screen-reader sentence differ per variant, so
  color is never the only signal. The sentence comes from `i18n/*.json` (`version_added`,
  `version_changed`, `version_removed`) in the page's language.
- `style.css` draws the pill, keeps the version value left to right, and hides the screen-reader
  sentence visually.
- `test/component-version-badge.test.ts` covers the variants, the sentence, block and inline
  layout, a missing version, escaping, and the stylesheet's tokens.

Syntax: `::version-badge{version=0.3 variant=changed block}`. See `site/components/version-badge.md`
for the full reference.
