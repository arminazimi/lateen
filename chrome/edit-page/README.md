# Edit page

An "Edit this page" link to the page's source on GitHub or GitLab, placed by the doc layout between the
article and the page footer. With the opt-in below it also renders a list of per-heading "suggest an edit"
issue links.

## Options

```yaml
theme:
  options:
    editPage:
      headingLinks: true
```

- `headingLinks` is `false` when absent. `true` adds, under the page link, one issue link per heading that has a
  source position, each with the heading text and the host's new-issue form. Every other value leaves them out.

## Where the URL comes from

The link is hidden entirely when the site has no address for the page (AC1, AC3), so a site without a
`repository` shows no dead control.

1. `site.data["edit-links"]` (or `site.data.editLinks`), when a build writes it, keyed by page URL. It accepts
   the engine's array of `{ url, source, editUrl }` and a record of page URL to either the URL or an object with
   `editUrl` (`edit_url` also reads). Only `http` and `https` addresses are linked.
2. Otherwise the URL comes from `repository`, by the same rules as the engine's `outputs/edit-links.ts`
   (N35): `main` when no branch is set, `${root}/edit/${branch}/${path}` on GitHub and
   `${root}/-/edit/${branch}/${path}` on GitLab, one encoded branch segment, and each source path segment encoded
   while its `/` separators stay. `repository.dir` is already part of `page.source.file`, so it is not added.
   A repository on another forge, or one that is not a web URL, gives no link.

The heading links use the same repository rules and the new-issue shapes from the engine's
`outputs/suggest-links.ts` (N36): `/issues/new?title=&body=` on GitHub and `/-/issues/new?issue[title]=&issue[description]=`
on GitLab. The body names the page, the source file and line, and the heading id; the title is capped so the URL
stays within 8 KB.

## Heading links and hover

A chrome part keeps the page body as the engine rendered it, so it cannot put a link inside each heading. The
per-heading links therefore render as a visible list in the footer for now. `style.css` already carries the rules
that hide a `.edit-page-heading-link` placed inside an `h2` to `h4` until the heading is hovered or focused (and
shows it on touch, where hover does not exist), so the engine HTML stage can inject the same markup later without
a theme change. That injection is a separate engine task; the acceptance criterion "heading link appears on hover
and focus" is met by the CSS, not yet by links inside headings.

## Without JavaScript

The block is plain markup: a link and, when enabled, a list of links. Nothing is hidden behind a script, and a
reader without JavaScript sees the same address.
