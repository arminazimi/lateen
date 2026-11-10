# Tokens

Design tokens, one group per file: `tokens/<group>.json`, lowercase kebab-case ([ADR 0023](../../../docs/adr/0023-engine-theme-boundary.md)). A group file is a JSON object of token names to values; the registry reads the groups in sorted path order.

A `tokens/<group>.light.json` file sets only the light values of a group. Its dark values and motion reduced values come from `names.json` or a plain `<group>.json` file. Example, `tokens/color.light.json` sets `canvas` and `text`; `color.dark.json` is not supported yet.

Example, `tokens/space.json`:

```json
{
  "1": "0.25rem",
  "2": "0.5rem",
  "3": "1rem"
}
```

## State

`tokens/state.json` holds the interaction states every control shares. The values come from the
approved palette (`docs/design/decisions.md`) and the approved mockups:

| Token | Light | Dark | Source |
| --- | --- | --- | --- |
| `state-hover-bg` | `#d8dee98c` | `#3636468c` | `overlay`, at the mockups' 55% opacity |
| `state-active-bg` | `#c5cddc` | `#54546d` | `highlight` |
| `state-selected-bg` | `#d8dee9` | `#363646` | `overlay`, the mockups' active item |
| `state-selected-fg` | `#3f5f88` | `#7fb4ca` | `accent-text`, darkened on light to pass WCAG 2.2 AA |
| `state-disabled-fg` | `#8892a6` | `#727169` | `muted` |
| `state-focus-ring` | `#5e81ac` | `#7e9cd8` | `accent` |
| `state-overlay` | `#00000066` | `#000000b3` | modal scrim, unchanged |

`state-selected-fg` is the one deliberate departure from the raw palette: `accent-text` in day
(`#4c6f9a`) reaches only 3.84:1 on `state-selected-bg`, so its token task value is `#3f5f88`
(4.85:1), as `docs/design/decisions.md` allows. The focus ring keeps the accent: 3.50:1 on the day
canvas and 5.94:1 on the night canvas, above the 3:1 non-text minimum. `styles/base.css` names the
ring again as `Highlight` under `forced-colors: active` so it survives forced colors.
