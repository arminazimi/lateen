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
| `stream` | `stdout`, `stderr`, or `combined` | none | The declared stream the recorded text came out of. |
| `exit` | decimal integer, 0–255 | none | The declared exit code of the command that printed the output. |
| `duration` | milliseconds: `340`, `340ms`, `1.5s`, up to one hour | none | The declared time the command took. |

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

## Execution evidence

`stream`, `exit`, and `duration` declare what is known about the run that produced the output, kept apart
from the output text itself:

```markdown
:::output-block{stream=stderr exit=1 duration=340ms}
error: no such file or directory: {{path}}
:::
```

The rendered block publishes the three declarations as an inert JSON script (`data-output-evidence`), so an
agent reads the evidence directly instead of scraping visual labels or re-parsing the text. Each kind is
recorded with exactly one state:

| State | Meaning |
| --- | --- |
| `"valid"` | The declaration followed the contract; `value` carries it. |
| `"invalid"` | Something was declared but the contract rejects it; `declared` carries the text as written. |
| `"omitted"` | Nothing was declared. Nothing is inferred — never a stream, never an exit code, and in particular never success. |

The contracts are strict and closed:

- **Stream** — exactly `stdout`, `stderr`, or `combined`, case as written. Anything else (`stdin`,
  `Stdout`) is recorded as invalid, not quietly mapped onto one of the three.
- **Exit code** — a plain decimal integer from 0 to 255, the range a shell can carry. Signs (`+7`, `-1`),
  base prefixes (`0x1f`), leading zeros (`007`), separators (`1_0`), exponents, fractions, and words like
  `success` are all invalid. A declared `0` is recorded as the author's claim of a zero exit; silence is
  never read as one.
- **Duration** — whole milliseconds up to one hour (`3600000` ms), written as `340`, `340ms`, `2s`, or
  `1.5s`. Seconds carry at most three decimal places (`0.125s`), because sub-millisecond precision in a
  recorded run is a declaration error, and the value is built from the digits so no float rounding
  changes it.

The evidence never touches the recorded output: the visible text stays byte-for-byte what the command
printed, copying returns exactly that text with nothing inserted, and an invalid declaration is
distinguishable from a missing one for a reader with or without JavaScript, because the script is in the
served HTML.

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

:::output-block{stream=stderr exit=1 duration=340ms}
error: no such file or directory
:::

## Notes

- An empty body, or one that holds only whitespace, renders nothing.
- The body stays text: `<b>` written in it is shown as it is written, never turned into markup.
- A body that names a variable (`{{project}}`) records it. `deps` declares inputs the text never repeats, such as an exit status or a timing result; both are recorded together. When the reader changes one of those values, the block is marked stale instead of pretending the recorded output still matches.
- The recorded output is never rewritten: the stale note explains why the text did not follow, and copying returns the original text exactly.
- A malformed `deps` value is ignored, so the block still renders with the names its text mentions.
- Evidence declarations never change the recorded text: an invalid `stream`, `exit`, or `duration` is
  published as `"invalid"` in the JSON record, a missing one as `"omitted"`, and neither is ever read as a
  successful run.
- The copy button copies the whole output and nothing else. It is made by JavaScript and starts hidden; the output still reads without it.
- Use a [terminal](../terminal/) when the commands and their output belong together in one block, and this block when only the result matters.
