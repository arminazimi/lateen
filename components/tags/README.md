# Tags

A wrapping list of small chips for the categories or topics of a page.

`index.ts` exports the `tags` component and the directive of the same name. Each chip shows its
label; it is a link only when its URL is root-relative (`/guide/`) or `http`/`https`, so an unsafe
URL such as `javascript:` reads as plain text. The list takes its items from the `items` prop, a JSON
array of strings or `{label, url}` objects, and otherwise from the page's `tags` front matter (a list
of strings or one comma-separated string). With no tags it renders nothing.

`style.css` uses tokens only and logical properties, so the chips wrap cleanly and read the same in
right-to-left pages. The accessible name of the list is the theme's `tags` string.
