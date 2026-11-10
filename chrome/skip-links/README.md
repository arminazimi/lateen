# Skip links

The first stops in the tab order: "Skip to content" goes to `#main`, and "Skip to navigation" goes
to `#site-navigation` when the site has navigation and the layout places that landmark. The links
stay in the tab order and `style.css` keeps them off the page until one has keyboard focus.

`base.ts` places the unit at the start of `<body>` and passes `navigation: false` when it does not
render the sidebar aside, so a page without a sidebar never links to a missing target. The labels
come from `i18n/` (`skip_to_content`, `skip_to_navigation`).
