# Version badge

A small badge that says when a feature was added, changed, or removed: `v0.3` on screen and
"Added in version 0.3" to a screen reader. It is inline by default and block with the `block` word.

- `index.ts` renders the component. The icon and the screen-reader sentence differ per variant, so
  color is never the only signal. The sentence comes from `i18n/*.json` (`version_added`,
  `version_changed`, `version_removed`) in the page's language. The root carries `data-version` and
  `data-variant`, so the state is machine-readable next to the diff's `data-version-from` and
  `data-version-to`.
- Variant matching trims and ignores case. An omitted or blank variant is `added`, the documented
  default. A non-blank variant that is not one of the three is `unknown`: it gets a muted `?` badge
  and `data-variant="unknown"`, and the version stays visible and announced as `v0.3` with no
  invented added/changed/removed sentence.
- `style.css` draws the pill, keeps the version value left to right, and hides the screen-reader
  sentence visually. In print a known variant prints the sentence in place of the icon and value; an
  unknown badge prints as it renders, so its version is not lost.
- `test/component-version-badge.test.ts` covers the variants, the unknown state, the sentence, block
  and inline layout, a missing version, case and Unicode, escaping, RTL, and the stylesheet's tokens.

Syntax: `::version-badge{version=0.3 variant=changed block}`. See `site/components/version-badge.md`
for the full reference.
