---
title: Layouts
description: "The page layouts Lateen provides, and how a page picks one."
layout: doc
permalink: /layouts/
---

A page picks a layout with `layout` in its front matter, or gets one from `defaults` in the site config. `mizzen build` uses `doc` when neither sets one.

| Layout | What it renders |
| --- | --- |
| `base` | The document shell: `<head>`, skip link, theme script, and slots for the header, sidebar, main column, aside, and footer. The other layouts build on it; a page does not name it. |
| `doc` | The docs page: header, sidebar, breadcrumb, article, table of contents, pager, and page footer. Front matter `status`, `since`, and `replaced_by` add the page-status banner. |
| `home` | The docs home: a hero, action buttons, and section cards from `hero`, `actions`, and `sections` in front matter. |
| `not-found` | The 404 page, with a search form and links to the home page and the top-level sections. |
| `versions` | The versions index: a page's versions from `site.data.versions` or the `versions` front matter key, each row linked to the same page when it exists and marked with Latest, Deprecated, or Dev in text. |

Each layout is `layouts/<name>.ts`; the rules for adding one are in `layouts/README.md`.
