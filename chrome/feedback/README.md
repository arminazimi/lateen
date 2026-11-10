# Feedback

A short "Was this page helpful?" question with a Yes and a No button, under the article. It is
optional: the unit renders nothing at all unless the site configures an endpoint.

## Files

- `index.ts`: the Preact chrome part (`h()`, never JSX). It reads
  `site.config.theme.options.feedback.endpoint` and returns `null` when that key is missing or is not
  a non-empty string. The question, the two button names, the acknowledgement, and the failure text
  come from the theme's string table, so English, Persian, and Arabic pages read their own language.
- `style.css`: token-only, logical-property styles. The widget and its buttons start `hidden` so a
  visitor without JavaScript never sees a control that would do nothing.
- `client.ts`: the island. It reveals the widget, reads `data-endpoint` and `data-url` from the root,
  POSTs `{ "url": "<page url>", "helpful": true | false }` as JSON when a button is pressed, and
  writes the outcome on the `role="status"` region. A failed request still shows a neutral
  thank-you. The only stored value is `sessionStorage["slipway-feedback:<page url>"]` (`yes` or
  `no`); the island never reads or writes cookies or `localStorage`. A page answered earlier in the
  same session shows the stored acknowledgement instead of the buttons.

## Configure

```yaml
theme:
  options:
    feedback:
      endpoint: https://feedback.example.com/vote
```

The endpoint is the theme's option, not an engine config key: `theme.options` is handed to the theme
unread, so this needs no config schema change. Without the block the doc layout renders no feedback
markup.

## Known gap

Chrome islands are not wired into built pages yet: the render host collects `client.ts` and the
per-unit `style.css` for components, not for chrome units (`packages/engine/src/pipeline/build.ts`).
The unit and its tests work when called directly, and the docs layout places it under the page footer,
but a current build neither loads this island nor its stylesheet. Because the whole widget starts
hidden, a built page shows nothing until chrome islands are wired.

## Test

`packages/theme/test/chrome-feedback.test.ts` covers the rendered markup, the missing-endpoint case,
the POST payload, session-only storage, an existing vote, and the failure path.
