# Trust panel

A chip under the page title that opens a panel with the page's trust level, the examples it tested,
its drift status, its last reviewer, and why it has that level. The chip is a native `<details>`
summary, so the panel opens with Enter, Space, or a click and closes with Escape without JavaScript;
the island only adds the focus return to the chip.

- `index.ts` renders the component. It reads the page's entry from `site.data.trust`, keyed by
  `page.url`, or from the directive's props for a manual panel. It renders nothing when neither has
  a level it knows.
- `style.css` draws the chip and the panel with tokens and logical properties. The panel sits under
  the chip on a wide screen and in the flow on a narrow one, so it works under RTL too.
- `client.ts` is the island: Escape closes the open panel and puts focus back on the chip.
- `test/component-trust-panel.test.ts` covers the missing-data case, every level, all three rows,
  the action links, localisation, escaping, the island, and the stylesheet's tokens.

## Data

The entry is either keyed by page URL directly or under `pages`; both shapes are accepted and the
nested one wins:

```yaml
# _data/trust.yml
"/guide/install/":
  level: verified
  reasons:
    - 3 of 3 examples passed
    - No drift findings
  lastReviewer: Ada Lovelace
```

```yaml
pages:
  "/guide/install/":
    level: review-due
    reasons: Reviewed more than 90 days ago.
```

`level` is `verified`, `review due`, or `at risk`, without regard to case or surrounding spaces
(`review-due` and `review due` are the same). A missing or unrecognised level hides the panel.
`reasons` is a list of sentences, or one string split on line breaks or `|`. `lastReviewer` is
optional.

The examples row reads `site.data.examples`, keyed by page URL (`passed`, `failed`). The drift row
reads `site.data.drift`, keyed by page URL (a list of findings); zero findings say so, a missing
entry says the value is not recorded.

## Options

The action links are optional and come from `theme.options.trust`. `{url}`, `{title}`, and
`{source}` are filled from the page; a root-relative URL gets the site's `base`.

```yaml
theme:
  options:
    trust:
      contextPackUrl: "https://example.com/context?page={url}"
      suggestEditUrl: "https://github.com/example/docs/edit/main/{source}"
```

An unsafe value (`javascript:`, a protocol-relative path, a bare relative path) is dropped, and a
link with no configured URL is left out.

## Directive

The doc layout adds the panel automatically; a page that wants a manual one writes:

```markdown
:::trust-panel{level=verified reasons="3 of 3 examples passed|No drift findings" lastReviewer="Ada"}
:::
```

## Known gap

Writing `trust.json` per page is a separate issue (N14). Until it lands, `site.data.trust` is absent
and the layout's panel stays hidden; a site can write `_data/trust.yml` in the meantime, and the
directive works anywhere it is placed.
