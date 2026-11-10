# Last updated

The line under a page title: when the page last changed, as "Updated 2 days ago", and up to three
contributor names. `index.ts` renders it, `style.css` styles it, and `test/chrome-last-updated.test.ts`
tests it. The doc layout places it under the `h1`.

## Data

A page's date comes from front matter: `last_modified_at`, else `updated`. Without either, it comes from
the page's entry in `site.data.reviewers`, keyed by page URL:

```yaml
# _data/reviewers.yml
"/guide/install/":
  date: 2026-03-04
  author: Ada Lovelace
  contributors: [Grace Hopper, Ada Lovelace]
```

Contributors come from `author` and the optional `contributors` array. Names are trimmed, deduplicated,
sorted by code point, and the line shows at most three. The entry's `date` may be a date or a date and a
time; an impossible date is left out rather than rolled over.

## Relative and absolute dates

"2 days ago" needs a date to measure from. The build reads it from data, never from the clock:

- `site.data.build.date` (or `site.data.build.asOf`) from `_data/build.yml`, or
- `site.data.reviewers.asOf` on `_data/reviewers.yml`.

Without one, the line shows the absolute date ("Updated March 4, 2026") and the build still gives the
same bytes on every machine. The absolute date always fills the `<time>` element's `title` and
`aria-label`, and is written in the page's calendar through `calendarDate` (Gregorian for English,
Jalali for Persian, Hijri for Arabic).

The line renders nothing when the page has neither a date nor contributors, so a site without review
data carries no empty element.

## Follow-up

`chrome/page-footer/index.ts` also prints the front matter `last_modified_at` as "Last updated". The two
lines duplicate the date on doc pages until the page footer drops its copy in favour of this unit. That
file is outside this unit and is not edited here.
