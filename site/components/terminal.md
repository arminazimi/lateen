---
title: Terminal
description: A shell session with prompts, output, and a copy button that takes only the complete commands.
layout: doc
permalink: /components/terminal/
redirect_from:
  - /blocks/terminal/
---

A terminal shows a shell session: lines that start with `$` are commands, and every other line is output. A command can run over several lines with a backslash continuation or a heredoc. The copy button copies only the complete commands, so a reader never pastes the output back into the shell.

## Syntax

```markdown
:::terminal
$ npm install mizzen
added 1 package

$ npm run build
Built 12 pages.
:::
```

## Multiline commands

Write a multiline session as one fenced block inside the directive, so Markdown keeps its backslashes and tabs. A line that ends in a backslash continues the command on the next line, even when the next line does not start with `$`:

````markdown
:::terminal
```sh
$ npm run build \
  --out dist
Built 12 pages.
```
:::
````

A heredoc starts with `<<` (or `<<-`), then its body, then the delimiter line. The body is input, so a line inside it that starts with `$` is not a prompt:

````markdown
:::terminal
```sh
$ cat > notes.md <<EOF
$ this line is input, not a prompt
EOF
wrote notes.md
```
:::
````

Quoted delimiters (`<<'EOF'`, `<<"EOF"`) and escaped ones (`<<\EOF`) work, and `<<-` lets the delimiter line start with tabs. Several heredocs can follow one command, and their bodies are read in the order the commands name them. The delimiter line is part of the command, so a copied heredoc pastes whole. A heredoc that never closes stays command input to the end of the session, the way a shell keeps waiting for it.

The session is read, never executed or expanded: the parser only decides which lines belong to which command. It does not interpret quotes, so a `<<` followed by a word opens a heredoc even inside quotes, and an odd run of backslashes at the end of a line continues the command even inside single quotes.

## Options

None. The prompt is `$ `.

## Example

:::terminal
```sh
$ npm install mizzen
added 1 package

$ npx mizzen build site --out dist \
    --minify
Written 12 pages to dist

$ cat > notes.md <<'EOF'
$ this stays in the file
EOF
```
:::

## For agents

The session publishes one record per command, in document order, in an inert JSON script:

```html
<script type="application/json" data-terminal-commands>[{"prompt":"$","input":"cat <<EOF\nhi\nEOF","output":["hi"]}]</script>
```

`input` is the whole command without prompts, with its continuation and heredoc lines joined by newlines; `output` holds the lines recorded after it, unchanged. Each visible row carries `data-line="command"` or `data-line="output"` and `data-command` with the index of the record it belongs to, so a row can be matched to its command without reading the colors. The script is in the page whether or not JavaScript runs, and the visible session is the same with or without it.

## Notes

- A line that starts with `$` opens a command; the prompt and one space after it are not part of the copied text. Every other line is output, kept as written.
- Continuation and heredoc lines show no prompt, so the prompt marks only where a command begins.
- Use a fenced block for a multiline command. In plain text Markdown removes a trailing backslash as a hard line break before the theme reads the session.
- The copy button reads the session again when it is clicked, so a value the variables form changed is the value copied.
- The copy button is made by JavaScript and starts hidden; the session still reads without it.
- The command and output colors come from the code tokens, in light and dark. A continuation line is command text, so it takes the command color and not the output one.
