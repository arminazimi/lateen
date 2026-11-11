---
title: Accessibility
description: How the Lateen theme is tested against WCAG 2.2 AA, and what is checked by hand.
layout: doc
permalink: /accessibility/
---

This page lists the WCAG 2.2 success criteria at levels A and AA that the Lateen theme is tested against, and how each is tested. It is written from the gates in this repository and published with each release. It is not an audit by a third party.

## The accessibility gate

`npm run test:a11y` builds the Lateen docs site and a small fixture site, serves them on a loopback port, and runs [axe-core](https://github.com/dequelabs/axe-core) in Chromium through [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm). It runs the WCAG 2.2 A and AA rules.

The matrix is 44 page states, covering:

- **Every layout:** api, changelog, doc, home, not-found, search-results, tutorial, and versions.
- **Every theme:** light and dark, set the way the theme switch stores the choice.
- **Every locale:** English and the right-to-left Persian and Arabic pages.
- **Component states:** code tabs, disclosures closed and open, tabs, a terminal, a table, a form, and callouts.
- **Open overlays:** the mobile drawer and the search palette.

A new **critical or serious** violation fails the run. Moderate and minor findings do not fail it, because axe finds only part of the problems for any criterion. Violations that existed when the gate was added are listed in [`test/accessibility/baseline.json`](https://github.com/velella-sh/lateen/blob/main/test/accessibility/baseline.json); the gate fails on anything not listed there. Fixing one of them is worth doing, and its entry is then removed.

### Run it

From a clean checkout on Node 24:

```bash
npm ci
npx playwright install chromium
npm run test:a11y
```

On Linux, `npx playwright install --with-deps chromium` also installs the system libraries the browser needs; CI does this. The Playwright version is pinned in `package-lock.json`, so the browser download is reproducible.

To reproduce one failure without running the whole matrix, filter by case name:

```bash
npm run test:a11y -- --only "docs home"
```

The failing output names the case, the theme, the rule, and the element's selector, plus axe's help link. CI runs the same command in the `a11y` job of `.github/workflows/ci.yml`.

## What automation cannot check

axe checks the rules it has; a pass is not an audit. A person still reviews each release for what a browser rule cannot see:

- **Screen reader reading order and announcements.** Follow the skip link, the sidebar, search, the drawer, and code tabs with a screen reader.
- **Resize, reflow, and text spacing.** Check 200% zoom, a 320 px wide window with no sideways scroll, and a text-spacing override.
- **Non-text contrast, hover and focus content, and focus not obscured.** Check focus rings, popovers, the sticky header, and the sidebar against a focused link.
- **Keyboard traps and focus order.** Open every overlay, tab through it, and close it with Escape.
- **Language of parts and consistent navigation.** Read mixed-direction text and compare the navigation across pages.

## Criteria

11 of 21 criteria have an automated check, three of them only in part. The rest are checked only by hand. Automated tools find only part of the problems for any criterion, so a person still reviews each release.

| Criterion | Name | Level | Tested by | Notes |
| --- | --- | --- | --- | --- |
| 1.1.1 | Non-text content | A | axe gate, by hand | axe checks that an alternative exists; whether it is meaningful is read by a person. |
| 1.3.1 | Info and relationships | A | axe gate | List, table, and ARIA parent-child structure. |
| 1.3.2 | Meaningful sequence | A | by hand | A person follows the reading order with a screen reader. |
| 1.4.1 | Use of color | A | axe gate | Links in text are underlined or otherwise marked. |
| 1.4.3 | Contrast (minimum) | AA | axe gate, by hand | Rendered text is checked at 4.5:1 (3:1 for large text), in light and dark. |
| 1.4.4 | Resize text | AA | axe gate (partly), by hand | axe catches a viewport that blocks zoom; a person checks the layout at 200%. |
| 1.4.10 | Reflow | AA | by hand | Checked at a 320 px wide window: nothing may scroll sideways. |
| 1.4.11 | Non-text contrast | AA | by hand | Focus rings and interface marks are checked at 3:1. |
| 1.4.12 | Text spacing | AA | axe gate (partly), by hand | axe catches inline styles that block spacing overrides; a person checks the result. |
| 1.4.13 | Content on hover or focus | AA | by hand | Popovers open on focus and close with Escape. |
| 2.1.1 | Keyboard | A | axe gate (partly), by hand | axe finds scroll regions that cannot take focus; a person operates every control. |
| 2.1.2 | No keyboard trap | A | by hand | The drawer and the search palette trap focus only while open, and return it on close. |
| 2.4.1 | Bypass blocks | A | axe gate | A skip link is the first stop. |
| 2.4.3 | Focus order | A | by hand | A person checks which element has focus at each step. |
| 2.4.7 | Focus visible | AA | by hand | A person checks that the focus ring is visible at each step. |
| 2.4.11 | Focus not obscured (minimum) | AA | by hand | The sticky header and sidebar are checked against a focused link. |
| 2.5.8 | Target size (minimum) | AA | axe gate | axe's target-size rule. |
| 3.1.1 | Language of page | A | axe gate | Every page sets `lang` and `dir`; the Persian and Arabic pages are in the matrix. |
| 3.1.2 | Language of parts | AA | by hand | Mixed-direction text is isolated; a person checks the wording. |
| 3.2.3 | Consistent navigation | AA | by hand | One layout renders the navigation on every page. |
| 4.1.2 | Name, role, value | A | axe gate, by hand | axe checks names, roles, and ARIA state; a person checks the behavior. |

## Report a problem

If something on a Lateen site is hard to use, open an issue in the [repository](https://github.com/velella-sh/lateen/issues).
