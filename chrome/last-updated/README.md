# Last updated

The line under a page title: when the page last changed, as "Updated 2 days ago", and up to three
contributor names. `index.ts` renders it, `style.css` styles it, and `test/chrome-last-updated.test.ts`
tests it. The doc layout places it under the `h1`.

## Data

A page's own date comes from front matter: `last_modified_at`, else `updated`. Its review date comes
from the page's entry in `site.data.reviewers`, keyed by page URL:

```yaml
# _data/reviewers.yml
"/guide/install/":
  date: 2026-03-04
  author: Ada Lovelace
  contributors: [Grace Hopper, Ada Lovelace]
```

The line labels each date by what it records: a front matter date reads "Updated", and a review date
reads "Reviewed" (`reviewed` in `i18n/*.json`). When both dates exist on different days, both show, so
source recency and review recency stay distinct. A review on the same day as the source change is left
out as a duplicate. `data-date-source` on each date says `source` or `review` for scripts and tests.

Contributors come from `author` and the optional `contributors` array. Names are trimmed, deduplicated,
sorted by code point, and the line shows at most three.

## Relative and absolute dates

"2 days ago" needs a date to measure from. The build reads it from data, never from the clock:

- `site.data.build.date` (or `site.data.build.asOf`) from `_data/build.yml`, or
- `site.data.reviewers.asOf` on `_data/reviewers.yml`.

Without one, the line shows the absolute date ("Updated March 4, 2026") and the build still gives the
same bytes on every machine. The absolute date always fills the `<time>` element's `datetime`, `title`,
and `aria-label`, and is written in the page's calendar through `calendarDate` (Gregorian for English,
Jalali for Persian, Hijri for Arabic), so the accessible value is exact even when the visible text is
relative.

The relative date is formatted for the page's BCP 47 tag, negotiated through `Intl` rather than a fixed
map: `fa-IR`, `ar-EG`, and `en-CA` keep their region, other languages `Intl` supports (`de`, `sv-SE`)
use their own wording, and an invalid or unsupported tag falls back to English. The tag is canonicalised,
so the same input always gives the same text.

## Direction isolation

A contributor name's script can differ from the page's, so each name is wrapped in a `<bdi>` element
and the localized comma stays between the names in the sentence's direction. The visible date text
(relative or absolute) is likewise wrapped in a `<bdi>`. The `<time>` element's `datetime`, `title`, and
`aria-label` carry the exact date unchanged, so assistive technology reads the real value rather than
the isolated rendering.

A date after the build's as-of date is not a recency the build can vouch for, so it stays absolute
rather than reading as "in 2 days". A date that is not a real calendar date (`2026-02-30`) is left out
entirely; it never becomes "today" or any other relative claim. A page with no usable date and no
contributors renders nothing, so a site without review data carries no empty element.

## Follow-up

`chrome/page-footer/index.ts` also prints the front matter `last_modified_at` as "Last updated". The two
lines duplicate the date on doc pages until the page footer drops its copy in favour of this unit. That
file is outside this unit and is not edited here.
