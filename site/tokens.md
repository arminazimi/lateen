---
title: "Tokens"
description: "Tokens: Lateen reference."
---

Every visual decision is a design token, defined once and read from CSS. `tokens/names.json` freezes the names; one file per group (`color.json`, `type.json`, `space.json`, and the rest) sets the values. Run `npm run tokens` after editing a group: it writes `styles/tokens.css`, which `npm test` keeps current. Never edit that CSS by hand, and never put a raw color, length, or duration in a unit's stylesheet; use `var(--color-accent)`, `var(--space-4)`, and the other token variables.

A site changes a token in its config, not in the theme. The site config is `mizzen.yml` (it was `slipway.yml` before [ADR 0025](https://github.com/arminazimi/slipway/blob/main/docs/adr/0025-mizzen-and-lateen.md)); the engine passes `theme.options` to the theme unread ([ADR 0024](https://github.com/arminazimi/slipway/blob/main/docs/adr/0024-site-config.md)), and the token overrides live under `theme.options.tokens`:

```yaml
theme:
  options:
    tokens:
      accent: "#0b6e4f"
      canvas: "#ffffff"
      text: "#222222"
      font_body: '"Source Serif 4", Georgia, serif'
      radius: "0.5rem"
```

The keys are the 0.2 `slipway.tokens` names that ADR 0024 maps into the theme's CSS variables: `accent`, `canvas`, `text`, `font_body`, and `radius`. `font_display` left with the blog layouts and is not read. An unset color keeps the theme's light and dark pair; a set one replaces both, so check the contrast in both modes.
