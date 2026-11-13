import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import terminal, {
  bodyText,
  commandJson,
  commandRecords,
  commandsOf,
  directive,
  heredocsOf,
  parseLines,
  variableNamesOf,
} from "../components/terminal/index.ts";
import {
  activate,
  activateAll,
  BUTTON_SELECTOR,
  COMMAND_SELECTOR,
  commandsOf as commandsInFrame,
  copy,
  RESET_MS,
  type Clipboard,
  type CopyButton,
  type CopyDocument,
  type CopyEnv,
  type TerminalFrame,
} from "../components/terminal/client.ts";

function render(html: string, lang = "en", props: Record<string, string> = {}): string {
  const input = { props, html, page: { lang }, site: {} } as unknown as ComponentProps;
  return renderToString(terminal(input) as never);
}

/** The command records from the inert JSON script the frame publishes. */
function recordsIn(out: string): unknown[] {
  const match = /<script type="application\/json" data-terminal-commands>([\s\S]*?)<\/script>/.exec(out);
  assert.ok(match, "command records rendered");
  return JSON.parse(match[1]!) as unknown[];
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/terminal/style.css", import.meta.url), "utf8");

const SESSION = "<p>$ npm ci\nadded 200 packages\n$ npm run check\n&lt;ok&gt; all gates passed</p>";

test("the directive is terminal and the default export is a component", () => {
  assert.equal(directive, "terminal");
  assert.equal(typeof terminal, "function");
});

test("a group is rendered on the frame, the session, the button, and the status", () => {
  const out = render(SESSION, "en", { group: "install" });
  assert.match(out, /class="terminal" data-variable-group="install" data-variable-group-explicit="true"/);
  assert.match(out, /data-terminal-copy="true"[^>]*data-variable-group="install"/);
  assert.match(
    out,
    /class="terminal-status" role="status" data-terminal-status(?:="")? data-invalid-text="Fix the highlighted values before copying commands\." data-variable-group="install"/,
  );
  assert.match(out, /<code (?:data-placeholders="[^"]*" )?data-variable-group="install"/);

  const ungrouped = render(SESSION);
  assert.doesNotMatch(ungrouped, /data-variable-group/);
  const malformed = render(SESSION, "en", { group: "not a group" });
  assert.doesNotMatch(malformed, /data-variable-group/);
});

test("bodyText keeps line breaks, drops tags, and decodes entities", () => {
  assert.equal(bodyText("<p>a<br>b &amp; c</p>\n<p>d &lt;e&gt; &quot;f&quot; &#39;g&#39;</p>"), 'a\nb & c\n\nd <e> "f" \'g\'');
  assert.equal(bodyText('<pre data-src="a.md:1"><code class="language-sh">$ ls\nout\n</code></pre>'), "$ ls\nout");
});

test("bodyText drops tags that a first pass would rebuild", () => {
  assert.doesNotMatch(bodyText("<scrip<script>t>alert(1)"), /<[^>]*>/);
  assert.doesNotMatch(bodyText("<<b>b>x<<i>/i>"), /<[^>]*>/);
});

test("parseLines marks $ lines as commands and strips the prompt and one space", () => {
  assert.deepEqual(parseLines("$ npm ci\nadded\n$ \n$npm test"), [
    { kind: "command", text: "npm ci", command: 0, continuation: false },
    { kind: "output", text: "added", command: 0, continuation: false },
    { kind: "command", text: "", command: 1, continuation: false },
    { kind: "command", text: "npm test", command: 2, continuation: false },
  ]);
  assert.deepEqual(parseLines(""), []);
});

test("a trailing backslash continues the command on the next line", () => {
  const lines = parseLines("$ npm run build \\\n  --out dist\nBuilt 12 pages.");

  assert.deepEqual(lines, [
    { kind: "command", text: "npm run build \\", command: 0, continuation: false },
    { kind: "command", text: "  --out dist", command: 0, continuation: true },
    { kind: "output", text: "Built 12 pages.", command: 0, continuation: false },
  ]);
  assert.equal(commandsOf(lines), "npm run build \\\n  --out dist");
  assert.deepEqual(commandRecords(lines), [
    { prompt: "$", input: "npm run build \\\n  --out dist", output: ["Built 12 pages."] },
  ]);
});

test("an escaped trailing backslash does not continue the command", () => {
  const lines = parseLines("$ printf '%s\\\\'\nfinished");

  assert.deepEqual(lines, [
    { kind: "command", text: "printf '%s\\\\'", command: 0, continuation: false },
    { kind: "output", text: "finished", command: 0, continuation: false },
  ]);
});

test("a heredoc body is input, even when it starts with a prompt", () => {
  const lines = parseLines("$ cat > notes.md <<EOF\n$ this is not a prompt\nplain\nEOF\nwrote notes.md");

  assert.deepEqual(lines, [
    { kind: "command", text: "cat > notes.md <<EOF", command: 0, continuation: false },
    { kind: "command", text: "$ this is not a prompt", command: 0, continuation: true },
    { kind: "command", text: "plain", command: 0, continuation: true },
    { kind: "command", text: "EOF", command: 0, continuation: true },
    { kind: "output", text: "wrote notes.md", command: 0, continuation: false },
  ]);
  assert.equal(commandsOf(lines), "cat > notes.md <<EOF\n$ this is not a prompt\nplain\nEOF");
  assert.deepEqual(commandRecords(lines), [
    {
      prompt: "$",
      input: "cat > notes.md <<EOF\n$ this is not a prompt\nplain\nEOF",
      output: ["wrote notes.md"],
    },
  ]);
});

test("heredoc delimiters may be quoted, tab-stripped, and several in one command", () => {
  const lines = parseLines("$ cat <<'A' <<-B\n\tone\nA\n\ttwo\n\tB\nafter");

  assert.equal(commandsOf(lines), "cat <<'A' <<-B\n\tone\nA\n\ttwo\n\tB");
  assert.deepEqual(commandRecords(lines), [
    { prompt: "$", input: "cat <<'A' <<-B\n\tone\nA\n\ttwo\n\tB", output: ["after"] },
  ]);
});

test("a heredoc opened on a continuation line is queued before any body is read", () => {
  const lines = parseLines("$ cat <<A \\\n  && cat <<B\na\nA\nb\nB\nafter");
  const input = "cat <<A \\\n  && cat <<B\na\nA\nb\nB";

  assert.equal(commandsOf(lines), input);
  assert.deepEqual(commandRecords(lines), [{ prompt: "$", input, output: ["after"] }]);
  assert.deepEqual(
    lines.filter((line) => line.kind === "output"),
    [{ kind: "output", text: "after", command: 0, continuation: false }],
    "only the line after both heredocs is output",
  );
});

test("a heredoc that never closes stays command input to the end of the session", () => {
  const lines = parseLines("$ cat <<EOF\none\n$ two\nthree");

  assert.equal(commandsOf(lines), "cat <<EOF\none\n$ two\nthree");
  assert.deepEqual(commandRecords(lines), [{ prompt: "$", input: "cat <<EOF\none\n$ two\nthree", output: [] }]);
  assert.equal(heredocsOf("cat <<\\EOF")[0]?.delimiter, "EOF");
  assert.equal(heredocsOf("cat <<< 'text'").length, 0, "a here-string is not a heredoc");
});

test("commandsOf joins only the commands, one per line", () => {
  const lines = parseLines("$ npm ci\nadded 200 packages\n$ npm run check\nall gates passed");
  assert.equal(commandsOf(lines), "npm ci\nnpm run check");
});

test("output before the first command belongs to no record", () => {
  const lines = parseLines("booting\n$ run\nok");

  assert.deepEqual(lines[0], { kind: "output", text: "booting", command: null, continuation: false });
  assert.deepEqual(commandRecords(lines), [{ prompt: "$", input: "run", output: ["ok"] }]);
});

test("a session publishes one record per command with the output that follows it", () => {
  const out = render("<p>$ npm ci\nadded\n$ cat &lt;&lt;EOF\nhello\nEOF\nwritten</p>");

  assert.deepEqual(recordsIn(out), [
    { prompt: "$", input: "npm ci", output: ["added"] },
    { prompt: "$", input: "cat <<EOF\nhello\nEOF", output: ["written"] },
  ]);
  assert.match(out, /data-line="output" data-command="0">added<\/span>/);
  assert.match(out, /terminal-command" data-line="command" data-command="1"><span class="terminal-prompt"/);
});

test("continuation and heredoc lines show no prompt and copy with their command", () => {
  const out = render("<p>$ npm run build \\\n  --out dist\n$ cat &lt;&lt;EOF\n$ literal\nEOF\nBuilt 12 pages.</p>");

  assert.match(out, /<span class="terminal-line terminal-command terminal-continuation" data-line="command" data-command="0"><span class="terminal-text"> {2}--out dist<\/span><\/span>/);
  assert.match(out, /<span class="terminal-line terminal-command terminal-continuation" data-line="command" data-command="1"><span class="terminal-text">\$ literal<\/span><\/span>/);
  assert.doesNotMatch(out, /terminal-continuation"[^>]*><span class="terminal-prompt"/);
  assert.match(out, /data-commands="npm run build \\\n {2}--out dist\ncat &lt;&lt;EOF\n\$ literal\nEOF"/);
});

test("variableNamesOf reads the variables a plain-text session names, once each", () => {
  assert.deepEqual(variableNamesOf("$ curl {{host}}/v1\n$ curl -H 'Bearer {{ api_key }}' {{host}}"), ["host", "api_key"]);
  assert.deepEqual(variableNamesOf("no variables here"), []);
  assert.deepEqual(variableNamesOf("{{name.with-dots}}"), ["name.with-dots"]);
  assert.deepEqual(variableNamesOf("\\{{escaped}}"), [], "an escaped placeholder stays literal");
  assert.deepEqual(variableNamesOf("\\\\{{real}}"), ["real"], "an even run of backslashes leaves a variable");
  assert.deepEqual(variableNamesOf("{{not a name}}"), []);
});

test("a session records the variables it names, so the form island can follow them", () => {
  const out = render("<p>$ curl {{host}}/v1/status\n200 OK</p>");

  assert.match(out, /<code data-placeholders="\[\{&quot;name&quot;:&quot;host&quot;\}\]">/);
});

test("a session with no variable leaves the code element plain", () => {
  const out = render(SESSION);

  assert.doesNotMatch(out, /data-placeholders/);
  assert.match(out, /<pre class="terminal-body" tabindex="0"><code>/);
});

test("the island reads the commands from the session, not from a stale attribute", () => {
  const text = (value: string) => ({ textContent: value });
  const frame: TerminalFrame = {
    querySelectorAll(selector) {
      assert.equal(selector, COMMAND_SELECTOR);
      return [text("curl https://api.example.com"), text("npm run check")];
    },
  };
  assert.equal(COMMAND_SELECTOR, ".terminal-command .terminal-text");
  assert.equal(commandsInFrame(frame), "curl https://api.example.com\nnpm run check");
});

test("a click copies the command text the page shows now", async () => {
  const button = fakeButton();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  const lines = [text("curl {{host}}")];
  const frame: TerminalFrame = { querySelectorAll: () => lines };

  activateAll({ querySelectorAll: () => [Object.assign(button, { parentElement: { parentElement: frame } })] }, env);
  lines[0] = text("curl https://sandbox.example.com");
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["curl https://sandbox.example.com"]);
});

test("command records keep a closing script tag inert", () => {
  const out = render("<p>$ printf '%s' &lt;/script&gt;\nok</p>");
  const json = commandJson([{ prompt: "$", input: "</script>", output: [] }]);

  assert.doesNotMatch(json, /</);
  assert.deepEqual(JSON.parse(json), [{ prompt: "$", input: "</script>", output: [] }]);
  assert.deepEqual(recordsIn(out), [{ prompt: "$", input: "printf '%s' </script>", output: ["ok"] }]);
});

test("a click copies the whole command, including a changed value in its heredoc", async () => {
  const button = fakeButton();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  const lines = [text("cat > conf <<EOF"), text("host={{host}}"), text("EOF")];
  const frame: TerminalFrame = { querySelectorAll: () => lines };

  activateAll({ querySelectorAll: () => [Object.assign(button, { parentElement: { parentElement: frame } })] }, env);
  lines[1] = text("host=sandbox.example.com");
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["cat > conf <<EOF\nhost=sandbox.example.com\nEOF"]);
});

test("two clicks in a row copy the input each click shows", async () => {
  const button = fakeButton();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  const lines = [text("deploy {{env}}")];
  const frame: TerminalFrame = { querySelectorAll: () => lines };

  activateAll({ querySelectorAll: () => [Object.assign(button, { parentElement: { parentElement: frame } })] }, env);
  lines[0] = text("deploy staging");
  button.click();
  lines[0] = text("deploy production");
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["deploy staging", "deploy production"]);
});

test("without a frame the button still copies the commands it was rendered with", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: (text) => (env.written.push(text), Promise.resolve()) });
  activate(button, env);
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["npm ci\nnpm run check"]);
});

/** A text node with just what the island reads. */
function text(value: string): { readonly textContent: string } {
  return { textContent: value };
}

test("each command shows its prompt, hidden from assistive tech; output has none", () => {
  const out = render(SESSION);

  assert.match(out, /<span class="terminal-line terminal-command" data-line="command" data-command="0"><span class="terminal-prompt" aria-hidden="true">\$ <\/span><span class="terminal-text">npm ci<\/span><\/span>/);
  assert.match(out, /<span class="terminal-line terminal-output" data-line="output" data-command="0">added 200 packages<\/span>/);
  assert.doesNotMatch(out, /terminal-output[^>]*>\$/);
});

test("the session is a focusable pre with the lines inside, under the terminal frame", () => {
  const out = render(SESSION);

  assert.match(out, /^<div class="terminal">/);
  assert.match(out, /<pre class="terminal-body" tabindex="0"><code>/);
});

test("the copy button starts hidden and carries only the commands", () => {
  const out = render(SESSION);

  assert.match(out, /<button type="button" class="terminal-copy" hidden data-terminal-copy="true" data-commands="npm ci\nnpm run check"/);
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Press Ctrl\+C"/);
  assert.match(out, />Copy<\/button>/);
});

test("a session with no commands has no copy button", () => {
  const out = render("<p>just output</p>");

  assert.doesNotMatch(out, /terminal-copy/);
  assert.doesNotMatch(out, /data-terminal-commands/);
  assert.match(out, /<span class="terminal-line terminal-output" data-line="output">just output<\/span>/);
});

test("the copy button takes its label and messages from the page language", () => {
  const out = render(SESSION, "fa");

  assert.match(out, /data-copied="کپی شد"/);
  assert.match(out, /data-copy-failed="Ctrl\+C را بزنید"/);
  assert.match(out, />کپی<\/button>/);
});

test("HTML in the session stays text, never markup", () => {
  const out = render("<p>$ echo &lt;b&gt;hi&lt;/b&gt;</p>");

  assert.match(out, /<span class="terminal-text">echo &lt;b>hi&lt;\/b><\/span>/);
  assert.doesNotMatch(out, /<b>/);
});

test("a fenced block inside the directive is read the same way", () => {
  const out = render('<pre data-src="a.md:2"><code class="language-sh">$ npm ci\nadded\n</code></pre>');

  assert.match(out, /data-commands="npm ci"/);
  assert.match(out, /terminal-output" data-line="output" data-command="0">added<\/span>/);
});

/** A button with the attributes the frame renders and a click listener that tests can fire. */
function fakeButton(hidden = true): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden,
    textContent: "Copy",
    dataset: { commands: "npm ci\nnpm run check", copied: "Copied", copyFailed: "Press Ctrl+C" },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    click() {
      for (const listener of listeners) listener();
    },
  };
}

/** Clipboard and timers the island uses, with the scheduled resets kept for the test to run. */
function fakeEnv(clipboard?: Clipboard): CopyEnv & { resets: Array<() => void>; written: string[] } {
  const written: string[] = [];
  const resets: Array<() => void> = [];
  return {
    clipboard,
    written,
    resets,
    schedule(callback) {
      resets.push(callback);
      return undefined;
    },
  };
}

test("without a clipboard the island leaves the button hidden", () => {
  const button = fakeButton();
  activate(button, fakeEnv(undefined));

  assert.equal(button.hidden, true);
});

test("with a clipboard the island reveals the button and copies only the commands", async () => {
  const button = fakeButton();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  activate(button, env);
  assert.equal(button.hidden, false);

  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["npm ci\nnpm run check"]);
  assert.equal(button.textContent, "Copied");
});

test("the button goes back to its label after RESET_MS", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  await copy(button, "Copy", env);

  assert.equal(button.textContent, "Copied");
  assert.equal(RESET_MS, 2000);
  env.resets[0]?.();
  assert.equal(button.textContent, "Copy");
});

test("a failed copy shows the failure message", async () => {
  const button = fakeButton();
  const env = fakeEnv({ writeText: () => Promise.reject(new Error("denied")) });
  await copy(button, "Copy", env);

  assert.equal(button.textContent, "Press Ctrl+C");
});

test("style.css uses only token names from tokens/names.json for var(--*) references", () => {
  const used = [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  assert.ok(used.length > 0);
  for (const name of used) {
    assert.ok(tokenNames.has(name), `unknown token --${name}`);
  }
});

test("style.css states the block in logical properties and keeps the hidden button hidden", () => {
  assert.doesNotMatch(css, /(^|[;{\s])(left|right|top|bottom)\s*:/);
  assert.doesNotMatch(css, /(?<![\w-])(min-|max-)?(width|height)\s*:/);
  assert.match(css, /\.terminal-copy\[hidden\] \{\n {2}display: none;\n\}/);
});

test("style.css scrolls the session inside the block, never the page", () => {
  assert.match(css, /\.terminal-body \{[^}]*overflow-x: auto;/);
});

test("the island never runs a command or reaches the network", () => {
  const client = readFileSync(new URL("../components/terminal/client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(client, /\bfetch\s*\(|\beval\s*\(|\bnew Function\b|XMLHttpRequest|sendBeacon|child_process/);
  assert.match(client, /BUTTON_SELECTOR = "\[data-terminal-copy\]"/);
});
