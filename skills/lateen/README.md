# Lateen Agent Skill

Use Lateen's theme-development workflows from a compatible coding agent: layouts, Preact components, browser islands, design tokens, responsive CSS, RTL, and accessibility.

## Install

```bash
npx skills add velella-sh/lateen --skill lateen --yes
```

Update an existing installation:

```bash
npx skills update lateen
```

## Example requests

- “Add a Lateen callout component with token-based styles and RTL tests.”
- “Fix keyboard focus in the mobile search dialog.”
- “Change the dark-mode accent token and check WCAG contrast.”
- “Add a documentation layout using the existing base layout.”

Mizzen engine-only work belongs to the `mizzen` Skill. Dependency lifecycle checks belong to Ebb or Offing.

## Package contents

The portable Skill is `SKILL.md`. The `evals/` folder contains its trigger corpus and is excluded from the npm package. There are no executable Skill scripts, credentials, hooks, or pre-approved tools.
