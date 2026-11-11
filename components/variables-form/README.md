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
- `style.css`: tokens only and logical properties only, so dark mode and right-to-left pages follow.
- `client.ts`: the island. Typing in an input copies its value into that variable's placeholders on the
  page; each default is applied once on load; a change marks the recorded output that depends on it
  stale; and the reset button puts every declared default back. Values stay in the browser: no cookie,
  no storage, no request, and no command runs.
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
  pairs with its label's `for`, the hint is its `aria-describedby`, and focus is visible.
- An input's `type` follows the declaration's `type` when that is an HTML input type (`url`, `email`,
  `number`, …), so the browser validates it and reports a bad value itself. Any other type, or none, is a
  text field, and a value the browser rejects never reaches an example.
- The inline placeholders the engine writes (`<span class="placeholder" data-var="name">`), code blocks
  that carry `data-placeholders`, and a terminal's session all follow the input. A terminal's copy button
  reads the command text from the page when it is clicked, so it copies the values on screen.
- A recorded output block that names the variable in `data-output-deps` is marked stale instead of being
  rewritten: the text is what a command printed once, and only running the command again can change it.
  Its note says so and its edge turns to the warning color.
- The reset button restores every declared default, in the inputs and in the examples. It starts `hidden`
  and the island reveals it, because only the island can put the examples back too.
- Without JavaScript the inputs still show every default, so a reader can copy the values by hand; the
  code examples keep the literal `{{name}}` the author wrote.
- A declaration with no default, or a structured default, shows an empty value.
- The legend and hint are localized through the theme's i18n keys `variables_form_legend` and
  `variables_form_hint`; the reset action uses `variables_form_reset`.

This unit does not edit the code component, the layouts, the engine, or a shared index; the engine's
registry finds it by its folder name.
