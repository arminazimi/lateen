import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToString } from "preact-render-to-string";
import type { ComponentProps } from "@velella/mizzen/contracts";
import { stringsOf } from "../i18n/index.ts";
import outputBlock, {
  BAR_CLASS,
  BLOCK_CLASS,
  BODY_CLASS,
  COPY_CLASS,
  directive,
  LABEL_KEY,
  outputText,
  parseDependencies,
  SCROLL_ATTRIBUTE,
  STALE_CLASS,
  STALE_KEY,
  STATUS_CLASS,
  type OutputBlockProps,
} from "../components/output-block/index.ts";
import {
  durationOf,
  evidenceElement,
  evidenceOf,
  exitOf,
  hasEvidence,
  MAX_DURATION_MS,
  MAX_EXIT,
  OMITTED,
  streamOf,
  STREAMS,
  type Evidence,
} from "../components/output-block/evidence.ts";
import {
  activate,
  activateAll,
  copy,
  enhance,
  isOverflowing,
  OVERFLOW_TOLERANCE,
  RESET_MS,
  SCROLL_SELECTOR,
  STATUS_SELECTOR,
  sync,
  type Clipboard,
  type CopyButton,
  type CopyDocument,
  type CopyEnv,
  type CopyParent,
  type CopyStatus,
  type ScrollBody,
  type ScrollEnv,
} from "../components/output-block/client.ts";
import { markStale } from "../components/variables-form/client.ts";

/** The props the render host passes: directive attributes, the page, and the rendered body. */
function input(html: string, lang = "en", props: OutputBlockProps = {}): ComponentProps<OutputBlockProps> {
  return { props, html, page: { lang }, site: {} } as unknown as ComponentProps<OutputBlockProps>;
}

function render(html: string, lang = "en", props: OutputBlockProps = {}): string {
  return renderToString(outputBlock(input(html, lang, props)) as never);
}

const names = JSON.parse(readFileSync(new URL("../tokens/names.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;
const tokenNames = new Set(
  Object.entries(names).flatMap(([group, entries]) => Object.keys(entries).map((name) => `${group}-${name}`)),
);

const css = readFileSync(new URL("../components/output-block/style.css", import.meta.url), "utf8");

const OUTPUT = "<p>Written 12 pages\nin 340 ms</p>";

test("the directive is output-block and the default export is a component", () => {
  assert.equal(directive, "output-block");
  assert.equal(typeof outputBlock, "function");
});

test("the block is a named group whose default label is Output", () => {
  const out = render(OUTPUT);

  assert.match(out, /^<div class="output-block" role="group" aria-label="Output">/);
  assert.equal(labelsOf(out), "Output");
  assert.equal(LABEL_KEY, "output");
});

test("the label option overrides the default, and a blank one falls back to it", () => {
  assert.equal(labelsOf(render(OUTPUT, "en", { label: "Build result" })), "Build result");
  assert.equal(labelsOf(render(OUTPUT, "en", { label: "   " })), "Output");
});

test("the default label follows the page language", () => {
  const out = render(OUTPUT, "fa");

  assert.equal(labelsOf(out), "خروجی");
  assert.match(out, />کپی<\/button>/);
});

test("the body has its own class, so it is distinct from input code", () => {
  const out = render(OUTPUT);

  assert.match(out, /<pre class="output-block-body" tabindex="0" data-output-scroll="true"><code>/);
  assert.doesNotMatch(out, /class="code"/);
});

test("the copy button starts hidden and carries the whole output", () => {
  const out = render(OUTPUT);

  assert.match(
    out,
    /<button type="button" class="output-block-copy" hidden data-output-copy="true" data-output="Written 12 pages\nin 340 ms"/,
  );
  assert.match(out, /data-copied="Copied"/);
  assert.match(out, /data-copy-failed="Copy failed\. Select the text and copy it by hand\."/);
  assert.match(out, />Copy<\/button>/);
  assert.match(out, /<span class="output-block-status" role="status" data-output-status="true"><\/span>/);
});

test("the status region is beside the button and empty until a copy", () => {
  const out = render(OUTPUT);

  assert.match(out, new RegExp(`<span class="${STATUS_CLASS}" role="status" data-output-status="true"></span>`));
  assert.match(out, new RegExp(`class="${BAR_CLASS}"`));
});

test("a body that holds nothing but whitespace renders nothing", () => {
  assert.equal(outputBlock(input("")), null);
  assert.equal(outputBlock(input("<p>   </p>")), null);
  assert.equal(outputBlock(input("\n\n")), null);
});

test("outputText keeps line breaks, drops tags, and decodes entities", () => {
  assert.equal(outputText("<p>a<br>b &amp; c</p>"), "a\nb & c");
  assert.equal(outputText('<pre data-src="a.md:2"><code>line\n</code></pre>'), "line");
  assert.equal(outputText("<p>   </p>"), "");
});

test("HTML in the output stays text, never markup", () => {
  const out = render("<p>&lt;b&gt;hi&lt;/b&gt; &amp; done</p>");

  assert.match(out, /<code>&lt;b>hi&lt;\/b> &amp; done<\/code>/);
  assert.doesNotMatch(out, /<b>/);
});

test("an output that names a variable records it and carries the stale note", () => {
  const out = render("<p>Created project {{project}}</p>");

  assert.match(out, /data-output-deps="\[[^"]*project[^"]*\]"/);
  assert.match(out, new RegExp(`data-stale-text="[^"]+"`));
  assert.match(out, new RegExp(`<span class="${STALE_CLASS}" role="status" data-output-stale-note="true">`));
  assert.equal(STALE_KEY, "output_stale");
  assert.ok(out.includes(`data-stale-text="${stringsOf("en").output_stale}"`));
});

test("an output with no variable carries no stale state and no note", () => {
  const out = render(OUTPUT);

  assert.doesNotMatch(out, /data-output-deps|data-output-stale-note|data-stale-text|output-block-stale/);
});

test("a declared dependency marks an output that never echoes it, with the stale note", () => {
  const out = render(OUTPUT, "en", { deps: '["project"]' });

  assert.deepEqual(dependenciesOf(out), ["project"]);
  assert.match(out, new RegExp(`<span class="${STALE_CLASS}" role="status" data-output-stale-note="true">`));
  assert.ok(out.includes(`data-stale-text="${stringsOf("en").output_stale}"`));
  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/, "the recorded output is not rewritten");
});

test("declared and inferred names merge in order, once each", () => {
  const out = render("<p>Created {{project}} in {{dir}}</p>", "en", { deps: '["project","pages"]' });

  assert.deepEqual(dependenciesOf(out), ["project", "dir", "pages"]);
});

test("escaped names stay literal and never become dependencies", () => {
  const out = render("<p>\\{{hidden}} and {{shown}}</p>", "en", { deps: '["\\{{escaped}}"]' });

  assert.deepEqual(dependenciesOf(out), ["shown"]);
  assert.match(out, /<code>\\\{\{hidden\}\} and \{\{shown\}\}<\/code>/);
});

test("parseDependencies keeps the valid names in a malformed declaration", () => {
  assert.deepEqual(parseDependencies(undefined), []);
  assert.deepEqual(parseDependencies("  "), []);
  assert.deepEqual(parseDependencies("project"), []);
  assert.deepEqual(parseDependencies('{"name":"project"}'), []);
  assert.deepEqual(parseDependencies('["project", 3, null, "", "bad name", "{{braced}}", "pages", "project"]'), [
    "project",
    "pages",
  ]);
  assert.deepEqual(parseDependencies('[{"name":"project"}]'), []);
});

test("a malformed deps prop fails soft and leaves the inferred names alone", () => {
  const out = render("<p>{{project}} done</p>", "en", { deps: "{not json" });

  assert.deepEqual(dependenciesOf(out), ["project"]);

  const plain = render(OUTPUT, "en", { deps: '{"name":"project"}' });
  assert.doesNotMatch(plain, /data-output-deps|data-output-stale-note|data-stale-text/);
});

test("changing a declared dependency marks the output stale and shows its note", () => {
  const out = render(OUTPUT, "en", { deps: '["project"]' });
  const block = fakeOutputBlock(out);

  const root = { querySelectorAll: () => [block.element] };
  assert.equal(markStale(root, "project"), 1);
  assert.equal(block.element.getAttribute("data-output-stale"), "true");
  assert.equal(block.note.textContent, stringsOf("en").output_stale);

  assert.equal(markStale(root, "other"), 0, "an unrelated variable leaves it alone");
});

test("with a declared dependency the copy still returns the recorded text", async () => {
  const out = render(OUTPUT, "en", { deps: '["project"]' });
  const recorded = outputText(OUTPUT);
  const button = fakeButton(/data-output="([^"]*)"/.exec(out)?.[1] ?? "");
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });

  await copy(button, fakeStatus(), env);

  assert.equal(button.dataset.output, recorded);
  assert.deepEqual(env.written, [recorded]);
});

test("without JavaScript a declared dependency leaves the output visible and the button hidden", () => {
  const out = render(OUTPUT, "en", { deps: '["project"]' });

  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/);
  assert.match(out, /class="output-block-copy" hidden/);
});

test("without JavaScript the output is fully visible and the button stays hidden", () => {
  const out = render(OUTPUT);

  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/);
  assert.match(out, /class="output-block-copy" hidden/);
  assert.match(out, /<pre class="output-block-body" tabindex="0" data-output-scroll="true"><code>/);
  assert.equal(labelsOf(out), "Output", "the focusable fallback keeps the group name");
});

test("the scroll marker matches the island selector", () => {
  assert.equal(SCROLL_ATTRIBUTE, "data-output-scroll");
  assert.equal(SCROLL_SELECTOR, `[${SCROLL_ATTRIBUTE}]`);
});

test("overflow is measured in CSS pixels with a one-pixel rounding tolerance", () => {
  assert.equal(OVERFLOW_TOLERANCE, 1);
  assert.equal(isOverflowing(fakeBody(100, 100)), false);
  assert.equal(isOverflowing(fakeBody(101, 100)), false, "a subpixel or rounding difference is not overflow");
  assert.equal(isOverflowing(fakeBody(102, 100)), true);
  assert.equal(isOverflowing(fakeBody(80, 100)), false);
});

test("a fitting output leaves the tab order and keeps the group name", () => {
  const body = fakeBody(100, 100);

  assert.equal(sync(body), false);
  assert.equal(body.attributes.has("tabindex"), false);
  assert.equal(body.attributes.has("role"), false, "the body adds no landmark of its own");
  assert.equal(body.attributes.has("aria-label"), false);
});

test("an overflowing output stays keyboard-scrollable inside its named group", () => {
  const body = fakeBody(640, 320);

  assert.equal(sync(body), true);
  assert.equal(body.attributes.get("tabindex"), "0");
  assert.equal(body.attributes.has("role"), false, "the group above keeps the accessible name");
  assert.equal(body.attributes.has("aria-label"), false);
});

test("container and content resizes update the tab stop in both directions", () => {
  const code = fakeBody(100, 100);
  const body = fakeBody(100, 100, code);
  const watched: Array<{ target: ScrollBody; update: () => void }> = [];

  enhance({
    bodies: () => [body],
    watch: (target, update) => {
      watched.push({ target, update });
    },
  });

  assert.equal(body.attributes.has("tabindex"), false, "the initial sync drops the fallback tab stop");
  assert.equal(watched.length, 2, "the body and the code inside it are both observed");

  body.scrollWidth = 200;
  for (const entry of watched) entry.update();
  assert.equal(body.attributes.get("tabindex"), "0", "growing past the body adds the tab stop");

  body.scrollWidth = 100;
  for (const entry of watched) entry.update();
  assert.equal(body.attributes.has("tabindex"), false, "shrinking back removes it again");

  code.scrollWidth = 400;
  body.scrollWidth = 400;
  for (const entry of watched) entry.update();
  assert.equal(body.attributes.get("tabindex"), "0", "new content that reflows gets the tab stop back");
});

/** The `aria-label` of the group, as the rendered HTML carries it. */
function labelsOf(html: string): string | undefined {
  return /role="group" aria-label="([^"]*)"/.exec(html)?.[1];
}

/** The evidence record in the rendered block's inert JSON script, or `undefined` when there is none. */
function evidenceOfHtml(html: string): unknown {
  const match = /<script type="application\/json" data-output-evidence>([\s\S]*?)<\/script>/.exec(html);
  return match === null ? undefined : JSON.parse(match[1]!);
}

test("the evidence contract exports the documented stream names and boundaries", () => {
  assert.deepEqual([...STREAMS], ["stdout", "stderr", "combined"]);
  assert.equal(MAX_EXIT, 255);
  assert.equal(MAX_DURATION_MS, 3_600_000);
});

test("streamOf accepts the three streams and nothing else", () => {
  assert.deepEqual(streamOf("stdout"), { state: "valid", value: "stdout" });
  assert.deepEqual(streamOf(" stderr "), { state: "valid", value: "stderr" });
  assert.deepEqual(streamOf("combined"), { state: "valid", value: "combined" });
  assert.deepEqual(streamOf("stdin"), { state: "invalid", declared: "stdin" });
  assert.deepEqual(streamOf("Stdout"), { state: "invalid", declared: "Stdout" });
  assert.deepEqual(streamOf("stderr stdout"), { state: "invalid", declared: "stderr stdout" });
});

test("streamOf leaves an undeclared stream as omitted, never as a value", () => {
  assert.deepEqual(streamOf(undefined), OMITTED);
  assert.deepEqual(streamOf(""), OMITTED);
  assert.deepEqual(streamOf("   "), OMITTED);
});

test("exitOf records zero and non-zero as declared and rejects every other form", () => {
  assert.deepEqual(exitOf("0"), { state: "valid", value: 0 });
  assert.deepEqual(exitOf("7"), { state: "valid", value: 7 });
  assert.deepEqual(exitOf(" 127 "), { state: "valid", value: 127 });
  assert.deepEqual(exitOf(String(MAX_EXIT)), { state: "valid", value: MAX_EXIT });
  assert.deepEqual(exitOf("256"), { state: "invalid", declared: "256" });
  assert.deepEqual(exitOf("-1"), { state: "invalid", declared: "-1" });
  assert.deepEqual(exitOf("+7"), { state: "invalid", declared: "+7" });
  assert.deepEqual(exitOf("007"), { state: "invalid", declared: "007" });
  assert.deepEqual(exitOf("0x1f"), { state: "invalid", declared: "0x1f" });
  assert.deepEqual(exitOf("0b111"), { state: "invalid", declared: "0b111" });
  assert.deepEqual(exitOf("1_0"), { state: "invalid", declared: "1_0" });
  assert.deepEqual(exitOf("1.5"), { state: "invalid", declared: "1.5" });
  assert.deepEqual(exitOf("1e3"), { state: "invalid", declared: "1e3" });
  assert.deepEqual(exitOf("seven"), { state: "invalid", declared: "seven" });
  assert.deepEqual(exitOf("success"), { state: "invalid", declared: "success" });
});

test("exitOf never infers an exit code from a block that declares none", () => {
  assert.deepEqual(exitOf(undefined), OMITTED);
  assert.deepEqual(exitOf("  "), OMITTED);
});

test("durationOf reads whole milliseconds from every accepted unit form", () => {
  assert.deepEqual(durationOf("0"), { state: "valid", value: 0 });
  assert.deepEqual(durationOf("340"), { state: "valid", value: 340 });
  assert.deepEqual(durationOf("340ms"), { state: "valid", value: 340 });
  assert.deepEqual(durationOf(" 2s "), { state: "valid", value: 2000 });
  assert.deepEqual(durationOf("1.5s"), { state: "valid", value: 1500 });
  assert.deepEqual(durationOf("0.125s"), { state: "valid", value: 125 });
  assert.deepEqual(durationOf("28.9s"), { state: "valid", value: 28900 }, "no float rounding in seconds");
  assert.deepEqual(durationOf("0.001s"), { state: "valid", value: 1 });
});

test("durationOf holds its boundaries and rejects everything outside them", () => {
  assert.deepEqual(durationOf("3600000"), { state: "valid", value: MAX_DURATION_MS });
  assert.deepEqual(durationOf("3600s"), { state: "valid", value: MAX_DURATION_MS });
  assert.deepEqual(durationOf("3600001ms"), { state: "invalid", declared: "3600001ms" });
  assert.deepEqual(durationOf("3601s"), { state: "invalid", declared: "3601s" });
  assert.deepEqual(durationOf("1.2.3ms"), { state: "invalid", declared: "1.2.3ms" });
  assert.deepEqual(durationOf("0.1234s"), { state: "invalid", declared: "0.1234s" }, "sub-millisecond precision");
  assert.deepEqual(durationOf("1.5ms"), { state: "invalid", declared: "1.5ms" });
  assert.deepEqual(durationOf("-5ms"), { state: "invalid", declared: "-5ms" });
  assert.deepEqual(durationOf("05ms"), { state: "invalid", declared: "05ms" });
  assert.deepEqual(durationOf("340minutes"), { state: "invalid", declared: "340minutes" });
  assert.deepEqual(durationOf("ms"), { state: "invalid", declared: "ms" });
  assert.deepEqual(durationOf("1e3ms"), { state: "invalid", declared: "1e3ms" });
});

test("durationOf leaves an undeclared duration as omitted", () => {
  assert.deepEqual(durationOf(undefined), OMITTED);
  assert.deepEqual(durationOf(""), OMITTED);
  assert.deepEqual(durationOf("   "), OMITTED);
});

test("evidenceOf spells out the state of each kind, and omitted is not invalid", () => {
  assert.deepEqual(evidenceOf({}), { stream: OMITTED, exit: OMITTED, duration: OMITTED });
  assert.deepEqual(evidenceOf({ exit: "0x1f" }), {
    stream: OMITTED,
    exit: { state: "invalid", declared: "0x1f" },
    duration: OMITTED,
  });
  assert.deepEqual(evidenceOf({ stream: "stdout", exit: "0", duration: "340ms" }), {
    stream: { state: "valid", value: "stdout" },
    exit: { state: "valid", value: 0 },
    duration: { state: "valid", value: 340 },
  });
});

test("hasEvidence is false only when nothing is declared", () => {
  assert.equal(hasEvidence({}), false);
  assert.equal(hasEvidence({ stream: "  ", exit: "" }), false);
  assert.equal(hasEvidence({ exit: "7" }), true);
  assert.equal(hasEvidence({ exit: "seven" }), true, "a malformed declaration is still a declaration");
});

test("evidenceElement renders nothing while every kind is omitted", () => {
  assert.equal(evidenceElement({}), null);
  assert.equal(evidenceElement({ stream: " ", duration: "" }), null);
});

test("declared evidence publishes an inert JSON record beside unchanged output", () => {
  const out = render(OUTPUT, "en", { stream: "stderr", exit: "1", duration: "340ms" });

  assert.deepEqual(evidenceOfHtml(out), {
    stream: { state: "valid", value: "stderr" },
    exit: { state: "valid", value: 1 },
    duration: { state: "valid", value: 340 },
  });
  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/, "the recorded output is byte-for-byte unchanged");
  assert.doesNotMatch(/<code>[\s\S]*?<\/code>/.exec(out)![0], /stderr|exit|duration/, "no evidence leaks into the text");
});

test("a block without evidence carries no record at all", () => {
  const out = render(OUTPUT);

  assert.equal(evidenceOfHtml(out), undefined);
  assert.doesNotMatch(out, /data-output-evidence/);
});

test("malformed exit codes, durations, and streams stay distinguishable from omissions", () => {
  const out = render(OUTPUT, "en", { exit: "0x1f", duration: "1.2.3" });

  assert.deepEqual(evidenceOfHtml(out), {
    stream: { state: "omitted" },
    exit: { state: "invalid", declared: "0x1f" },
    duration: { state: "invalid", declared: "1.2.3" },
  });

  const unsupported = render(OUTPUT, "en", { stream: "stdin" });
  assert.deepEqual((evidenceOfHtml(unsupported) as { stream: Evidence }).stream, {
    state: "invalid",
    declared: "stdin",
  });
});

test("an invalid or missing exit code never becomes a success claim", () => {
  for (const props of [{ exit: "seven" }, { exit: "-1" }, {}, { stream: "stdout" }] as OutputBlockProps[]) {
    const record = evidenceOf(props);
    const exit = record.exit;
    assert.ok(exit.state !== "valid" || exit.value === Number(exit.value));
    if (exit.state !== "valid") assert.equal(exit.value, undefined, "no value to read as zero");
    assert.equal(JSON.stringify(record).includes('"value":0'), false, "nothing claims a zero exit");
  }
});

test("evidence does not touch dependencies, the stale state, or the label", () => {
  const out = render("<p>Created {{project}}</p>", "en", { deps: '["pages"]', stream: "stdout", exit: "0" });

  assert.deepEqual(dependenciesOf(out), ["project", "pages"]);
  assert.match(out, new RegExp(`<span class="${STALE_CLASS}" role="status" data-output-stale-note="true">`));
  assert.equal(labelsOf(out), "Output");
  assert.match(out, /<code>Created \{\{project\}\}<\/code>/);
});

test("evidence with a Unicode body keeps the text byte-for-byte", () => {
  const body = "<p>✓ 完成 — éè & 12 pages</p>";
  const out = render(body, "en", { stream: "stdout", exit: "0", duration: "1.5s" });

  assert.match(out, /<code>✓ 完成 — éè &amp; 12 pages<\/code>/);
  assert.equal(outputText(body), "✓ 完成 — éè & 12 pages");
  assert.deepEqual(evidenceOfHtml(out), {
    stream: { state: "valid", value: "stdout" },
    exit: { state: "valid", value: 0 },
    duration: { state: "valid", value: 1500 },
  });
});

test("declared markup and angle brackets in evidence cannot escape the script", () => {
  const out = render(OUTPUT, "en", { stream: "</script><b>x", exit: "<img src=x>", duration: "1<2s" });

  assert.doesNotMatch(out, /<\/script><b>/, "a declared close tag cannot end the script early");
  assert.doesNotMatch(out, /<img src=x>/);
  const record = evidenceOfHtml(out) as { stream: Evidence; exit: Evidence; duration: Evidence };
  assert.equal(record.stream.state, "invalid");
  assert.equal(record.stream.declared, "</script><b>x");
  assert.equal(record.exit.declared, "<img src=x>");
  assert.equal(record.duration.declared, "1<2s");
});

test("with evidence declared the copy still carries only the recorded text", () => {
  const out = render(OUTPUT, "en", { stream: "stderr", exit: "7", duration: "340ms", deps: '["project"]' });
  const recorded = outputText(OUTPUT);

  const dataOutput = /data-output="([^"]*)"/.exec(out)?.[1] ?? "";
  assert.equal(dataOutput, recorded, "the copy payload holds no evidence");

  const button = fakeButton(recorded);
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  activate(button, fakeStatus(), env);
  button.click();
  button.click();
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    assert.deepEqual(env.written, [recorded, recorded], "a copy race repeats the same text, never metadata");
  });
});

test("without JavaScript the evidence script and the visible output are both in the page", () => {
  const out = render(OUTPUT, "fa", { stream: "stdout", exit: "0", duration: "2s" });

  assert.match(out, /<code>Written 12 pages\nin 340 ms<\/code>/);
  assert.match(out, /class="output-block-copy" hidden/);
  assert.deepEqual(evidenceOfHtml(out), {
    stream: { state: "valid", value: "stdout" },
    exit: { state: "valid", value: 0 },
    duration: { state: "valid", value: 2000 },
  });
});

/** The names in `data-output-deps`, as the rendered HTML carries them, in order. */
function dependenciesOf(html: string): string[] {
  const raw = /data-output-deps="([^"]*)"/.exec(html)?.[1];
  if (raw === undefined) return [];
  const entries = JSON.parse(raw.replaceAll("&quot;", '"')) as Array<{ name: string }>;
  return entries.map((entry) => entry.name);
}

/** The parts of a rendered output the stale island touches, read back from its markup. */
function fakeOutputBlock(html: string) {
  const attrs = new Map<string, string>();
  const deps = /data-output-deps="([^"]*)"/.exec(html)?.[1];
  const staleText = /data-stale-text="([^"]*)"/.exec(html)?.[1];
  if (deps !== undefined) attrs.set("data-output-deps", deps.replaceAll("&quot;", '"'));
  if (staleText !== undefined) attrs.set("data-stale-text", staleText);
  const note = { nodeType: 3, textContent: "", getAttribute: () => null };
  const element = {
    nodeType: 1,
    textContent: outputText(html),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value);
    },
    querySelector: () => note,
  };
  return { element, note };
}

/** An output body as the scroll island reads it: its measured widths, attributes, and code child. */
interface FakeBody extends ScrollBody {
  readonly attributes: Map<string, string>;
}

/** The server fallback starts focusable, as `index.ts` renders it. */
function fakeBody(scrollWidth: number, clientWidth: number, code: ScrollBody | null = null): FakeBody {
  const attributes = new Map<string, string>([["tabindex", "0"]]);
  return {
    scrollWidth,
    clientWidth,
    attributes,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    querySelector(selector) {
      return selector === "code" ? code : null;
    },
  };
}

/** A button with the attributes the frame renders and a click listener the test can fire. */
function fakeButton(output = "Written 12 pages\nin 340 ms"): CopyButton & { click(): void } {
  const listeners: Array<() => void> = [];
  return {
    hidden: true,
    dataset: { output, copied: "Copied", copyFailed: "Copy failed" },
    addEventListener(type, listener) {
      assert.equal(type, "click");
      listeners.push(listener);
    },
    click() {
      for (const listener of listeners) listener();
    },
  };
}

function fakeStatus(textContent = ""): CopyStatus {
  return { textContent };
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

test("the island copies the output text and nothing else", async () => {
  const button = fakeButton("line one\nline two");
  const status = fakeStatus();
  const env = fakeEnv({
    writeText(text) {
      env.written.push(text);
      return Promise.resolve();
    },
  });
  activate(button, status, env);
  button.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(env.written, ["line one\nline two"]);
  assert.equal(status.textContent, "Copied");
});

test("without a clipboard the island leaves the button hidden", () => {
  const button = fakeButton();
  const env = fakeEnv(undefined);
  activate(button, fakeStatus(), env);

  assert.equal(button.hidden, true);
  button.click();
  assert.deepEqual(env.written, []);
});

test("the status goes back to empty after RESET_MS", async () => {
  const status = fakeStatus();
  const env = fakeEnv({ writeText: () => Promise.resolve() });
  await copy(fakeButton(), status, env);

  assert.equal(status.textContent, "Copied");
  assert.equal(RESET_MS, 2000);
  env.resets[0]?.();
  assert.equal(status.textContent, "");
});

test("a failed copy reports the failure in the status", async () => {
  const status = fakeStatus();
  const env = fakeEnv({ writeText: () => Promise.reject(new Error("denied")) });
  await copy(fakeButton(), status, env);

  assert.equal(status.textContent, "Copy failed");
});

test("activateAll wires each button to the status region beside it", () => {
  const status = fakeStatus();
  const parent: CopyParent = {
    querySelector(selector) {
      assert.equal(selector, STATUS_SELECTOR);
      return status;
    },
  };
  const button = Object.assign(fakeButton(), { parentElement: parent });
  const doc: CopyDocument = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-output-copy]");
      return [button];
    },
  };
  activateAll(doc, fakeEnv({ writeText: () => Promise.resolve() }));

  assert.equal(button.hidden, false);
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
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{`));
  assert.match(css, new RegExp(`\\.${BODY_CLASS} \\{`));
  assert.match(css, new RegExp(`\\.${COPY_CLASS}\\[hidden\\] \\{[\\s\\S]*?display: none;`));
});

test("style.css sets the block apart from input code with a dashed edge and the surface color", () => {
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{[^}]*border: 1px dashed var\\(--code-border\\);`));
  assert.match(css, new RegExp(`\\.${BLOCK_CLASS} \\{[^}]*background-color: var\\(--color-surface\\);`));
});

test("style.css scrolls the output inside the block, never the page", () => {
  assert.match(css, new RegExp(`\\.${BODY_CLASS} \\{[^}]*overflow-x: auto;`));
});

test("style.css makes a stale output visible and keeps the island from executing anything", () => {
  assert.match(css, new RegExp(`\\.${STALE_CLASS} \\{[^}]*color: var\\(--color-warning\\);`));
  assert.match(css, /\.output-block\[data-output-stale\] \{[^}]*border-color: var\(--color-warning\);/);

  const client = readFileSync(new URL("../components/output-block/client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(client, /\bfetch\s*\(|\beval\s*\(|\bnew Function\b|XMLHttpRequest|sendBeacon|child_process/);
});
