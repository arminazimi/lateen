# Variables form

A small personalization form for the `{{name}}` variables a page's code examples use. Each variable gets
a labelled text input, and the declared default is both the input's value and its placeholder, so the
form and the page are readable before any script runs.

```markdown
::variables-form{id="quickstart"}
```

## Unit

- `index.ts`: the Preact component, its `variables-form` directive, and the parsers that merge the N33
  declaration shape from the directive, the page's front matter, and `site.data`.
- `group.ts`: the group identity contract shared with the terminal and output-block components.
- `validation.ts`: the documented `url`, `number`, and `boolean` rules; every other type is `string`.
- `style.css`: tokens only and logical properties only, so dark mode and right-to-left pages follow.
- `client.ts`: the island. Typing in an input copies its value into the examples of that form's group;
  each default is applied once on load; a change revalidates the input, blocks or unblocks the group's
  terminal copy buttons, and recomputes whether the group's recorded output is stale. The reset button
  puts every declared default of that group back, revalidates them, and recomputes freshness in the same
  step. Code blocks and terminals are rendered
  from the text the author wrote, so an unrelated literal that happens to equal a value is never
  rewritten, a token split across highlighted spans still changes as a whole, and escaped placeholders
  stay literal. Values stay in the browser: no cookie, no storage, no request, and no command runs.
- `test/component-variables-form.test.ts`: labels, defaults, the empty case, the data fallback, every
  language, escaping, input types, the reset button, validation, stale output, the island's placeholder
  updates, and the stylesheet rules.

## Data

Variables use the shape the engine's [`variables` output](../../../engine/src/outputs/variables.ts) documents (N33):
a list of declarations in `_data/variables.yml`, and optionally the same list in a page's front matter.

```yaml
# _data/variables.yml
- name: api_key
  default: YOUR_KEY
  type: string
- name: host
  default: https://api.example.com
```

```yaml
# a page's front matter, overriding one default
variables:
  - name: api_key
    default: YOUR_SANDBOX_KEY
```

A page's declaration wins over the site's for the same name; a declaration missing a default keeps the
site's default. Declarations sort by name, so the form is deterministic. `site.data.variables` is read
as a list; a missing or non-list value contributes nothing.

The `variables` prop takes the same list as JSON, for a form that should not read page or site data:

```markdown
::variables-form{variables='[{"name":"api_key","default":"YOUR_KEY"}]'}
```

When the prop is present and valid, it is the whole list; when it is absent or unreadable, the page and
site data are used. An empty list renders nothing, as does a page with no declarations.

## Behaviour

- One `<fieldset>` with a legend, a hint, and one label-and-input pair per variable. The input's `id`
  pairs with its label's `for`, the hint is its `aria-describedby`, and focus is visible. The first form
  on a page keeps the ids it publishes; a second default form, or one whose `id` sanitizes to the same base
  as an earlier form, gets a deterministic `-2`, `-3`, … suffix, so labels and descriptions on a page with
  several forms always point into their own form. A form with no variable takes no instance id.
- One explicit `group` connects this form to the terminals and output blocks that should follow it. It
  renders as `data-variable-group` on the form root, with `data-variable-group-explicit="true"` when the
  author wrote it. Without one the group is the sanitized `id` base, then `variables-form`, so a single
  form needs no group. The value is letters, digits, `_`, and `-`; a malformed value is treated as absent
  rather than silently rewritten. A form, terminal, and output block belong together only when the group
  values match exactly. On a page with exactly one form and no authored group, ungrouped examples still
  follow it; with more than one form or any authored group, ungrouped examples are left alone.
- Every variable is a text input; the declared `type` is carried in `data-type` and used only for
  validation. `string` and an unknown type accept any text, including empty. `url` needs a non-empty
  absolute `http:`/`https:` URL or a root-relative path starting with a single `/` (not `//host`), with no
  whitespace or control characters. `number` needs the documented decimal form and may not be empty.
  `boolean` needs `true` or `false`, case-insensitive, and may not be empty. An invalid input sets
  `aria-invalid="true"`, shows its localized message, sets `data-variables-invalid` on the form, and
  blocks the copy buttons of terminals in the same group; its value never reaches an example. A default
  that is itself invalid is marked on load and stays blocked. The reset revalidates the defaults.
- Repeated declarations of one name in one group, including duplicates in the `variables` prop, collapse
  with the same merge rule as page and site data: the later declaration fills fields the earlier one left
  out and otherwise wins. One input per name, in code-point order.
- The inline placeholders the engine writes (`<span class="placeholder" data-var="name">`), code blocks
  that carry `data-placeholders`, and a terminal's session follow the input within the group. A terminal's
  copy button reads the command text from the page when it is clicked, so it copies the values on screen
  and copies nothing while the group is invalid. The engine has no group identity for inline code, so
  grouped inline and code-block annotation is not part of this island.
- Each block and session keeps the text the author wrote, and every edit is rendered from that text. A
  token split across highlighted spans is replaced as a whole, repeated tokens all follow the value, and
  unrelated text that happens to equal a default or an earlier value is never rewritten. An escaped
  `\{{name}}` stays literal, and swapping two values cannot cascade into the other variable.
- A recorded output block that names the variable in `data-output-deps` is marked stale instead of being
  rewritten: the text is what a command printed once, and only running the command again can change it.
  Its note says so and its edge turns to the warning color.
- Freshness is recomputed against the values the form was wired with, over all of the output's declared and
  inferred dependencies: changing any one of them marks the output stale, and restoring every one of them
  to its recorded value clears the marker and the note. An output that depends on a variable no wired form
  holds keeps its state; the island never infers freshness from a baseline it cannot check. The stale marker
  is the only thing rewritten — the recorded text is untouched.
- The reset button restores every declared default of its own group, in the inputs and in the examples,
  revalidates them, clears the invalid state and stale output, and announces the reset in a live region;
  other groups are untouched. A default the declared type rejects is marked again and copy stays blocked.
  It starts `hidden` and the island reveals it, because only the island can put the examples back too.
- Without JavaScript the inputs still show every default, so a reader can copy the values by hand; the
  code examples keep the literal `{{name}}` the author wrote.
- A declaration with no default, or a structured default, shows an empty value.
- The legend and hint are localized through the theme's i18n keys `variables_form_legend` and
  `variables_form_hint`; the reset action uses `variables_form_reset`.

This unit does not edit the code component, the layouts, the engine, or a shared index; the engine's
registry finds it by its folder name.
