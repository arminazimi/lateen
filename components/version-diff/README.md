# Version diff

A section-by-section comparison of two versions of a page. Each change is `added`, `removed`,
`changed`, or `moved`; the kind shows as a visible label beside its own icon shape, never as color
alone. A moved change also shows its old and new position. The viewer renders nothing when there are
no changes or the two versions are equal.

- `index.ts` is the Preact component, written with `h()`. Its `directive` export is `version-diff`.
  It accepts the diff from the directive's `data` or `from`/`to`/`changes` attributes, then from the
  page's `versionDiff` front matter. It also reads the engine's `diff/<version>/<page>.json` shape,
  where the four kinds are four lists, so that output can be handed in unchanged.
- `client.ts` is the island. It reveals Previous and Next buttons and a change count, and wires the
  keyboard: ArrowDown and ArrowUp move one change, ArrowRight and ArrowLeft follow the reading
  direction, Home and End jump to the ends, and the keys wrap. One change is in the tab order at a
  time, so the viewer is a single tab stop once it is enhanced.
- `style.css` uses tokens for both themes and logical properties for right-to-left pages.

The data is:

```json
{
  "from": "v1",
  "to": "v2",
  "changes": [
    { "kind": "added", "title": "Retries", "after": "## Retries\n\n..." },
    { "kind": "removed", "title": "Legacy flags", "before": "## Legacy flags\n\n..." },
    { "kind": "changed", "title": "Install", "before": "...", "after": "..." },
    { "kind": "moved", "title": "Upgrade", "from": "3", "to": "5", "before": "...", "after": "..." }
  ]
}
```

Syntax:

```markdown
::version-diff{from="v1" to="v2" changes='[{"kind":"added","title":"Retries"}]'}
```

Without JavaScript the whole diff stays readable in order: a heading, then an ordered list of
sections with their kind labels. Tests live in `test/component-version-diff.test.ts`.
