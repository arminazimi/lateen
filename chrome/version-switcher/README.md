# Version switcher

A native disclosure in the header that lists the same page in every documentation version and links to each. It
works without JavaScript: `<details>` and `<summary>` are keyboard operable on their own, and `style.css` only
positions the open list.

The current version is marked with `aria-current="true"` and the visible "Current version" badge, so the mark is
not color alone. When the page does not exist in another version, that version's entry links its home page, found
from the version's URL folder (`/v1/guide/install/` gives `/v1/`) unless the data sets `home`.

The unit renders nothing when it finds fewer than two versions, and nothing on a page the version data does not
list.

## Where the data comes from

It reads `site.data.versions` first (`_data/versions.json`, `_data/versions.yml`, or `_data/versions.yaml`), in
either of two shapes.

The N17 `versions.json` shape, with an optional `byUrl` lookup that is used when present:

```json
{
  "pages": [
    {
      "path": "guide/install.md",
      "versions": [
        { "version": "v1", "url": "/v1/guide/install/" },
        { "version": "v2", "url": "/v2/guide/install/" }
      ]
    }
  ],
  "byUrl": { "/v1/guide/install/": "guide/install.md", "/v2/guide/install/": "guide/install.md" }
}
```

A simple page-to-versions map, keyed by page URL (with or without `base`) or page path, where a value is a list of
entries or a terse `version: url` map:

```json
{
  "/guide/install/": [
    { "version": "v1", "url": "/v1/guide/install/" },
    { "version": "v2", "url": "/v2/guide/install/" }
  ]
}
```

A bare array is one page's list. URLs may omit `base`; the switcher adds it once, and never twice.

Without `site.data.versions`, it falls back to the page's `versions` front matter:

```yaml
versions:
  - version: v1
    url: /v1/guide/install/
  - version: v2
    url: /v2/guide/install/
```

## Known gap

The engine's `versions.json` output is written to the build root but is not exposed to rendering yet, so a site
cannot read it through `site.data` on its own. Until that wiring lands, copy the output into `_data/versions.json`
before the build or write the front matter above; with neither, the switcher stays hidden.

## Placement

`chrome/header/index.ts` places it in `header-actions` before the search button.
