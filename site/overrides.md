---
title: "Overrides"
description: "Overrides: Lateen reference."
---

The rest of `theme.options` is the theme's as well. Lateen reads these blocks:

```yaml
theme:
  options:
    announcement:
      id: v0-4
      text: Slipway 0.4 is out.
      href: /changelog/
    editPage:
      headingLinks: true
    logo:
      light: /assets/logo.svg
      dark: /assets/logo-dark.svg
    footer:
      copyright: © 2026 Example
      license: MIT
      links:
        - title: Source
          url: https://github.com/example/site
    pageAgent:
      providers:
        - title: Claude
          url: "https://claude.ai/new?q=Read+{markdown}"
    feedback:
      endpoint: https://feedback.example.com/vote
```

| Option | What it changes |
| --- | --- |
| `announcement.id`, `announcement.text`, `announcement.href` | A dismissible bar above the header. `text` is required; the bar renders nothing without it. `href` links the text; `http`, `https`, `mailto`, and root-relative paths are shown. Dismissal is remembered per `id`. |
| `editPage.headingLinks` | `true` adds a per-heading "suggest an edit" issue link under the "Edit this page" link; absent or any other value leaves it out. |
| `logo.light`, `logo.dark` | The header mark. A root-relative path gets the site's `base`; an absolute URL is used as written. With both, the header swaps them with the theme; with one, it shows that one in both modes. |
| `footer.copyright`, `footer.license` | The two lines of the site footer. |
| `footer.links[]` | Footer links with `title` and `url`; only `http`, `https`, `mailto`, and root-relative paths are shown. |
| `pageAgent.providers[]` | The "Use with an agent" menu. Each provider has a `title` and a `url`; `{markdown}`, `{url}`, and `{title}` are filled per page. Without the block the menu offers Claude, ChatGPT, and Cursor. |
| `feedback.endpoint` | The address the "Was this page helpful?" buttons POST `{url, helpful}` to. Without the block the feedback widget renders nothing. |
