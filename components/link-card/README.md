# Link card

One card that links to another page, for a "next steps" section: an optional decorative icon, a
title, and an optional plain-text description. The whole card is a single `<a>` with a visible focus
ring, so a reader can tab to it and activate it anywhere.

```markdown
::link-card{href="/guide/install/" title="Install" description="Put Slipway in a project."}
```

The `link-card` directive is a leaf directive. `href` must be root-relative (`/guide/`, but not the
protocol-relative `//host`) or `http`/`https`; anything else (`javascript:`, `data:`, `mailto:`, a
relative path) renders nothing. Without a title the card also renders nothing, because the link
would have no accessible name. The description is plain text, never markup, and the icon is
decorative HTML hidden from assistive technology.

## Placement

The component is one card. For several, wrap them in the optional grid class, which is one column
on a narrow screen and a grid as the article widens:

```html
<div class="link-card-grid">

::link-card{href="/guide/" title="Guides" description="Learn the engine."}

::link-card{href="/reference/" title="Reference" description="Look up an option."}

</div>
```

The relationship to [`components/cards/`](../cards/) is deliberate: `cards` is the home layout's
grid, driven by `sections` front matter, while `link-card` is a Markdown directive for a link in a
normal page. Both draw the same card look from the theme's tokens; `cards` is unchanged.

## Files

- `index.ts`: the component, its `link-card` directive, and the href check.
- `style.css`: the card, the optional grid, the icon, and the logical properties.
- `../../test/component-link-card.test.ts`: the links, escaping, refusals, focus ring, and stylesheet.
