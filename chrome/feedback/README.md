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
- `client.ts`: the island. It reveals the widget, reads `data-endpoint`, `data-url`, `data-source`,
  `data-lang`, and `data-version` from the root, POSTs
  `{ "url": "<page url>", "helpful": true | false, "source": "<source file>", "lang": "<page language>", "version"?: "<declared version>" }`
  as JSON when a button is pressed, and writes the outcome on the `role="status"` region. The source
  file is the page's canonical path from the model, and the version comes from the page's `version`
  front matter when it declares one, so an answer keeps the exact localized/versioned page and the
  text it came from. Both buttons disable while a request is pending, so a double click submits once.
  A failed request (network, HTTP, or missing `fetch`) writes the translated failure message and
  re-enables both buttons so the reader can retry; a stale response cannot record a vote. The only
  stored value is `sessionStorage["lateen-feedback:<page url>"]` (`yes` or `no`); the island never
  reads or writes cookies or `localStorage`, and a denied `sessionStorage` still reveals the buttons.
  A page answered earlier in the same session shows the stored acknowledgement instead of the buttons.

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

`test/chrome-feedback.test.ts` covers the rendered markup, the missing-endpoint case, localized and
versioned POST payloads, pending/double-click races, stale responses, HTTP/network failure, retry,
session-only storage and storage denial, an existing vote, and keyboard-native buttons.
