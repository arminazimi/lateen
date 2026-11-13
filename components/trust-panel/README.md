# Trust panel

A chip under the page title that opens a panel with the page's trust state, the examples it tested,
its drift status, its build and review provenance, its last reviewer, and why it has that state. The
chip is a native `<details>` summary, so the panel opens with Enter, Space, or a click and closes with
Escape without JavaScript; the island only adds the focus return to the chip.

- `index.ts` renders the component. It reads the page's entry from `site.data.trust`, keyed by
  `page.url`, or from the directive's props for a manual panel. A page with no entry renders nothing,
  so a page with no trust record never gets a chip. An entry that is present but unreadable renders an
  `unknown` panel marked `data-trust-evidence="invalid"`, so a malformed record is reported instead of
  disappearing.
- `style.css` draws the chip and the panel with tokens and logical properties. The panel sits under
  the chip on a wide screen and in the flow on a narrow one, so it works under RTL too. Long reasons
  wrap (`overflow-wrap: anywhere`) and the panel never grows wider than the viewport, so a long
  translation stays readable at narrow widths and zoom.
- `client.ts` is the island: Escape closes the open panel and puts focus back on the chip.
- `examples.ts` turns one page's `site.data.examples` entry into honest evidence: the tested-chip's
  run states plus the distinct `none`, `invalid`, and `absent` gaps, with the row's text, class, and
  `data-trust-examples*` attributes derived from it.
- `test/component-trust-panel.test.ts` covers absent versus malformed entries, every state, every
  evidence row, provenance, the action links, localisation, escaping, the island, and the
  stylesheet's tokens.

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
  buildId: build-42
  generatedAt: 2026-03-06
  reviewedAt: 2026-03-04
```

```yaml
pages:
  "/guide/install/":
    level: unreviewed
    reasons: Reviewed more than 90 days ago.
```

`buildId`, `generatedAt`, and `reviewedAt` are optional provenance. When the entry omits them, the panel
reads the same evidence from the documented build and reviewer shapes: `site.data.build.id` and
`site.data.build.generatedAt` (or `.date` / `.asOf`), and `site.data.reviewers[url].date`.

```yaml
# _data/build.yml
id: build-42
generatedAt: 2026-03-06
asOf: 2026-03-06
```

## Provenance

Valid provenance ties the recorded evidence to the build and review that produced it. The panel exposes
it as `data-trust-build`, `data-trust-generated`, and `data-trust-reviewed` on the panel root. A build
generation date and a human review date render as their own rows, labelled with the existing `updated`
and `reviewed` strings, each with an exact `<time datetime>` value. A written date-time keeps its clock,
seconds, and offset in `datetime` and the tooltip; only the visible text is localised to its calendar
day. The build date is not a source-change date, and the review date is not a build date, so the two
never stand in for each other.

A malformed or impossible date is left out. A date after the build's as-of day is future evidence and is
left out too, as is a review dated after the generation it describes. When an entry names a build and
`site.data.build.id` names another, the entry's build provenance is stale and is left out. Missing
provenance never changes the level: it only removes evidence, so it cannot turn a partial, unreviewed, or
unknown panel into a verified one.

`level` names the state, strongest first:

| State | What it means |
| --- | --- |
| `verified` | All recorded evidence is present and clean: examples pass, drift is empty, and a reviewer signed off. |
| `partial` | Some recorded evidence is missing, failing, or out of date. |
| `unreviewed` | The evidence has not been reviewed, so no reviewer is recorded. |
| `unknown` | No evidence is recorded for the page. |

The names are matched without regard to case or surrounding spaces, and spaces and `_` read as `-`.
The first trust score's names still work: `review-due` reads as `unreviewed` and `at-risk` as
`partial`. A page with no entry for its URL stays hidden: absent data is not a claim either way. An
entry that is present but cannot be read — a bare string, list, number, or `null`, or a record with a
missing or unrecognised `level` — renders an `unknown` panel with `data-trust-evidence="invalid"` on
its root and the unknown explanation from the i18n table. That malformed entry supplies no reasons,
reviewer, build, dates, or actions, and the panel does not borrow the page's examples or drift either,
so none of its written fields can arrive as a valid trust claim. A manual panel with an unreadable
`level` is reported the same way; the directive cannot express "no level" and "malformed level"
differently, so only a present, unreadable level is marked invalid.

`reasons` is a list of sentences, or one string split on line breaks or `|`. `lastReviewer` is
optional. When an entry records no reasons, the panel shows the state's own explanation from the
i18n table, so every state is inspectable and never just a badge.

The examples row reads `site.data.examples`, keyed by page URL, and consumes `passed`, `failed`,
`total`, and `unrun` conservatively (`examples.ts`). The evidence states follow the tested-chip
contract: `passed`, `partial`, `unrun`, and `failed` for run results, plus three honest gaps the chip
does not have to show inline: `none` for a recorded suite that counted zero examples, `invalid` for
a report that cannot be read (a malformed count, a total smaller than the results, an `unrun` that
contradicts the total, or an entry that is not a record), and `absent` for no report at all. The row
names the state in words, as a class (`trust-panel-examples-<state>`) and as `data-trust-examples`
on the value; readable evidence also carries `data-trust-examples-passed`, `-failed`, `-total`, and
`-unrun`. A report with unrun examples always says so next to the run result, so it never reads as
fully passed, and invalid or absent evidence exposes no counts, so it can never look like a recorded
zero. Example evidence never changes the declared level. The drift row reads `site.data.drift`, keyed
by page URL (a list of findings); zero findings say so, a missing entry says the value is not
recorded.

## Options

The action links are optional and come from `theme.options.trust`. `{url}`, `{title}`, and
`{source}` are filled from the page; `{build}`, `{generated}`, and `{reviewed}` are filled from the
panel's valid provenance. Every value is percent-encoded, a root-relative URL gets the site's `base`,
and a template that asks for provenance the page does not have is left out rather than losing the
build context it promises.

```yaml
theme:
  options:
    trust:
      contextPackUrl: "https://example.com/context?page={url}&build={build}"
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
