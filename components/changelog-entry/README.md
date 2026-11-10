# Changelog entry

One release in a changelog: a version heading that links to itself, a machine-readable date, the categories
the release touches, and the entry text. It is a container directive, so the body is Markdown.

```markdown
:::changelog-entry{version="1.2.0" date="2026-11-09" categories="added,fixed"}
- Add the `--verbose` flag to `slipway build`.
- Fix a crash when `site.config.md` is missing.
:::
```

## Options

| Name | Type | Default | What it does |
| --- | --- | --- | --- |
| `version` | string | `Unreleased` | The release version, such as `1.2.0` or `v1.2.0`. |
| `date` | string | `Date unknown` | An ISO date, `YYYY-MM-DD`; a date-time keeps its date part. |
| `categories` | string | none | Comma-separated names or a JSON array: `added`, `changed`, `fixed`, `removed`, `security`. Unknown names are dropped and repeats are removed, in author order. |

## Rendered shape

```html
<section class="changelog-entry" id="v1-2-0" aria-labelledby="changelog-version-v1-2-0">
  <h2 class="changelog-entry-version" aria-labelledby="changelog-version-v1-2-0">
    <span id="changelog-version-v1-2-0" class="changelog-entry-version-text">1.2.0</span>
    <a class="changelog-entry-anchor" href="#v1-2-0" aria-label="Link to release 1.2.0">…</a>
  </h2>
  <div class="changelog-entry-meta">
    <time class="changelog-entry-date" datetime="2026-11-09">November 9, 2026</time>
    <ul class="changelog-entry-categories" aria-label="Categories">…</ul>
  </div>
  <div class="changelog-entry-body">…</div>
</section>
```

## Decisions

- The section id is `v` plus a slug of the version: lower case, dots become dashes, and any other run of
  characters becomes one dash. `1.2.0` becomes `v1-2-0`; a leading `v` is not doubled. The id is
  deterministic, so links to a release survive a rebuild.
- A missing or blank version renders the heading text "Unreleased" and the id `vunversioned`. It never
  renders a bare `v`. Two unversioned entries on one page share an id, so give every entry a version when a
  page has more than one.
- A date that is missing, not a calendar date, or not written as an ISO date renders "Date unknown". Only a
  real date gets a `<time datetime>` element; the visible text uses the page's calendar, as the rest of the
  theme does.
- An empty body still renders the heading, date, and categories, plus a short "No details for this release"
  paragraph. A stub entry looks like a stub instead of an empty section.
- Each category is an icon and a text label, so the difference between categories never depends on color.
  Colors come from tokens; the icon and label carry the meaning in monochrome and for screen readers.
