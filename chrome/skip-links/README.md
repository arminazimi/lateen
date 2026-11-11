# Skip links

The first stops in the tab order: "Skip to content" goes to `#main`, and "Skip to navigation" goes
to `#site-navigation`, the sidebar column that holds the named navigation landmark, when the site
has navigation and the layout places that column. The links stay in the tab order and `style.css`
keeps them off the page until one has keyboard focus.

`base.ts` places the unit at the start of `<body>` and passes `navigation: false` when it does not
render the sidebar, so a page without a sidebar never links to a missing target. The labels come
from `i18n/` (`skip_to_content`, `skip_to_navigation`).

`client.ts` is the island: on a skip link's activation it moves focus to the fragment target, so the
next Tab continues from the destination instead of the header. The engine gives every page the
chrome islands (`chromeIslandsOf`), and the island does nothing on a page without a `.skip-link`.

## Files

- `index.ts`: the Preact chrome part, the two plain fragment links, and the target ids
  (`MAIN_ID`, `NAVIGATION_ID`).
- `style.css`: token-only, logical-property styles. The links are above the page and translated out
  of sight until `:focus`.
- `client.ts`: the island. It wires every `.skip-link`, resolves the link's `#id` on click, and
  focuses the target. It never calls `preventDefault`, so the fragment is still followed, the URL
  still updates, and a missing target or an unavailable `focus` API leaves ordinary navigation
  intact. It listens only to the links' clicks: an initial load or an unrelated `hashchange` never
  moves focus.
- `../../test/chrome-skip-links.test.ts`: the unit's tests, including the island on a real document.

## Focus without changing the markup

`layouts/base.ts` already gives `<main tabindex="-1">`, so the content target is focusable and keeps
that attribute. Any other target (the `#site-navigation` column is a plain `<div>`) takes focus only
after the island adds `tabindex="-1"`, and the attribute is removed again on `blur`, so the page
returns to the markup the server sent. A target that already has its own `tabindex` keeps that value
and is never rewritten.
