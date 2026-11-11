---
title: Output block
description: The result of a command, shown apart from the command above it, with a copy button that takes only the output.
layout: doc
permalink: /components/output-block/
---

An output block shows what a command printed. It is the result, not the input: the body is read as plain text, and a dashed edge and the surface color keep it visually distinct from the code block above it.

## Syntax

```markdown
:::output-block
Written 12 pages to dist
:::
```

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `label` | string | "Output" | The accessible name of the group. |
| `deps` | JSON array of variable names | none | Inputs the output was produced from when its text does not repeat them: `'["project"]'`. |

```markdown
:::output-block{label="Build result"}
Written 12 pages to dist
:::
```

The value of `deps` is JSON, so use single quotes around it in the directive and double quotes inside. Names follow the same rule as variables elsewhere: letters, digits, `.`, `_`, and `-`. A malformed declaration is ignored without hiding the names that are valid.

```markdown
:::output-block{deps='["project"]'}
Finished in 340 ms
:::
```

## Example

:::output-block
Written 12 pages to dist
:::

:::output-block{label="Build result"}
Compiled 24 files
Copied 6 assets
:::

:::output-block{deps='["project"]'}
Finished in 340 ms
:::

## Notes

- An empty body, or one that holds only whitespace, renders nothing.
- The body stays text: `<b>` written in it is shown as it is written, never turned into markup.
- A body that names a variable (`{{project}}`) records it. `deps` declares inputs the text never repeats, such as an exit status or a timing result; both are recorded together. When the reader changes one of those values, the block is marked stale instead of pretending the recorded output still matches.
- The recorded output is never rewritten: the stale note explains why the text did not follow, and copying returns the original text exactly.
- A malformed `deps` value is ignored, so the block still renders with the names its text mentions.
- The copy button copies the whole output and nothing else. It is made by JavaScript and starts hidden; the output still reads without it.
- Use a [terminal](../terminal/) when the commands and their output belong together in one block, and this block when only the result matters.
