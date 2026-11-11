// Locale typography contract: which face serves each script, the order a mixed line falls through,
// where a Persian or Arabic line may break, and what a locale must not do to code and identifiers.
// This test reads `styles/fonts.css`, `styles/tokens.css`, and `styles/rtl.css`. Its fixtures are
// the Latin, Persian, and mixed strings below, so it needs no fixture page of its own.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const css = read("../styles/fonts.css");
const tokensCss = read("../styles/tokens.css");
const rtlCss = read("../styles/rtl.css");

/** Comments become spaces (newlines kept) so offsets and line numbers stay useful. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

/** Every innermost `{ ... }` block: its selector and its declarations. At-rules keep their inner blocks. */
function blocks(text: string): { selector: string; body: string }[] {
  const source = stripComments(text);
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));
}

/** One `property: value` declaration from a block body. */
function property(body: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim();
}

/** A code point range a face covers: one `U+XXXX` or `U+XXXX-YYYY` entry of `unicode-range`. */
type Range = readonly [number, number];

/** One `@font-face`: its family, where its bytes come from, and the code points it covers. */
interface Face {
  readonly family: string;
  readonly src: string;
  readonly ranges: readonly Range[];
}

function rangesOf(value: string | undefined): Range[] {
  if (value === undefined) return [];
  return value.split(",").map((entry) => {
    const match = /^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(entry.trim());
    assert.ok(match, `fonts.css has an unsupported unicode-range entry: ${entry.trim()}`);
    const start = Number.parseInt(match[1]!, 16);
    return [start, match[2] === undefined ? start : Number.parseInt(match[2], 16)] as const;
  });
}

const faces: readonly Face[] = blocks(css)
  .filter((block) => block.selector === "@font-face")
  .map((block) => ({
    family: (property(block.body, "font-family") ?? "").replace(/^["']|["']$/g, ""),
    src: property(block.body, "src") ?? "",
    ranges: rangesOf(property(block.body, "unicode-range")),
  }));

/** The faces that load a file: the local fallbacks above carry no unicode-range and cover one family's metrics. */
const webFaces = faces.filter((face) => face.src.includes("url("));

/** One custom property from the generated `styles/tokens.css`. */
function token(name: string): string {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(tokensCss);
  assert.ok(match, `styles/tokens.css defines no --${name}`);
  return match[1]!.trim();
}

/** The family names of a `font-family` token value, in cascade order. */
const familyNames = (stack: string): string[] =>
  stack
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, ""))
    .filter((name) => name !== "");

/** The face in `family` that covers `codePoint`, if any. */
const faceFor = (family: string, codePoint: number): Face | undefined =>
  faces.find((face) => face.family === family && face.ranges.some(([start, end]) => codePoint >= start && codePoint <= end));

/**
 * Which family serves each visible character of `text` in `stack`: the first face in cascade order
 * whose `unicode-range` covers it. Fails when no face in the stack covers a character, which is how
 * a missing subset shows up instead of silently rendering a system glyph.
 */
function serving(text: string, stack: readonly string[]): Map<string, string> {
  const served = new Map<string, string>();
  for (const char of text) {
    if (/\s/.test(char)) continue;
    const codePoint = char.codePointAt(0) ?? 0;
    const family = stack.find((name) => faceFor(name, codePoint) !== undefined);
    assert.ok(family, `no face in ${stack.join(", ")} covers ${char} (U+${codePoint.toString(16).toUpperCase()})`);
    served.set(char, family);
  }
  return served;
}

/** The families `text` resolves to, as a sorted list for a readable assertion. */
const familiesOf = (text: string, stack: readonly string[]): string[] => [...new Set(serving(text, stack).values())].sort();

/** The declaration value of the first rule whose selector includes `selector`. */
function rule(selector: string): { selector: string; body: string } {
  const found = blocks(css).find((block) => block.selector.includes(selector));
  assert.ok(found, `fonts.css has no rule for ${selector}`);
  return found;
}

const bodyStack = familyNames(token("type-font-body"));
const rtlStack = familyNames(token("rtl-font-body"));
const monoStack = familyNames(token("type-font-mono"));

test("every web font loads a real file and keeps its licence beside it", () => {
  assert.ok(webFaces.length >= 8, "fonts.css should load Geist, Geist Mono, and Vazirmatn in their weights");

  for (const face of webFaces) {
    const url = /url\("([^"]+)"\)/.exec(face.src);
    assert.ok(url, `${face.family} has no url() source`);

    const file = fileURLToPath(new URL(`../styles/${url[1]}`, import.meta.url));
    assert.ok(statSync(file).size > 0, `${url[1]} is empty`);
    assert.ok(statSync(join(dirname(file), "LICENSE")).size > 0, `${dirname(url[1]!)} has no LICENSE`);
  }
});

test("every web face declares the code points it covers", () => {
  for (const face of webFaces) {
    assert.ok(face.ranges.length > 0, `${face.family} ${face.src} declares no unicode-range`);
  }
});

test("the scripts do not claim each other's characters", () => {
  // Geist serves Latin and leaves Persian to Vazirmatn; Vazirmatn leaves Latin letters to Geist.
  assert.equal(faceFor("Geist", "A".codePointAt(0)!) !== undefined, true);
  assert.equal(faceFor("Geist", "گ".codePointAt(0)!), undefined);
  assert.equal(faceFor("Vazirmatn", "گ".codePointAt(0)!) !== undefined, true);
  assert.equal(faceFor("Vazirmatn", "z".codePointAt(0)!), undefined);
});

test("a Latin page reads entirely in Geist", () => {
  assert.equal(bodyStack[0], "Geist");
  assert.deepEqual(familiesOf("Deploy the site in 3 minutes.", bodyStack), ["Geist"]);
  assert.deepEqual(familiesOf("Voilà — naïve café, 100%", bodyStack), ["Geist"]);
});

test("a Persian page reads Persian in Vazirmatn, Latin words in Geist, and Persian digits in Vazirmatn", () => {
  assert.equal(rtlStack[0], "Vazirmatn");
  assert.ok(rtlStack.indexOf("Vazirmatn") < rtlStack.indexOf("Geist"), "Vazirmatn must come before Geist in the RTL stack");

  assert.deepEqual(familiesOf("راهنمای نصب لیتن", rtlStack), ["Vazirmatn"]);
  assert.deepEqual(familiesOf("۱۲۳۴۵۶۷۸۹۰، ؛ ؟", rtlStack), ["Vazirmatn"]);
  assert.deepEqual(familiesOf("Deploy", rtlStack), ["Geist"]);
});

test("a mixed sentence keeps each script in its own face", () => {
  const fixture = "برای نصب Node.js 24، دستور npm install را اجرا کنید.";
  const served = serving(fixture, rtlStack);

  for (const char of ["ب", "ر", "ا", "ن", "د"]) assert.equal(served.get(char), "Vazirmatn", char);
  for (const char of ["N", "o", "d", "e", "j", "s", "2", "4"]) assert.equal(served.get(char), "Geist", char);
  // The Persian comma and question mark are punctuation of the script, not Latin fallbacks.
  assert.equal(served.get("،"), "Vazirmatn");
});

/** A page with the theme's styles, so a regional tag's cascade can be read back. */
function styled(lang: string) {
  const dom = new JSDOM(`<!DOCTYPE html><html lang="${lang}" dir="rtl"><body><p id="prose">متن</p></body></html>`);
  for (const path of ["../styles/tokens.css", "../styles/base.css", "../styles/fonts.css", "../styles/rtl.css"]) {
    const style = dom.window.document.createElement("style");
    style.textContent = read(path);
    dom.window.document.head.append(style);
  }
  return dom.window;
}

test("a regional Persian or Arabic tag gets the same prose typography", () => {
  // `:lang(fa)` and `:lang(ar)` match `fa-IR`, `ar-EG`, and every other regional tag of the script.
  for (const tag of ["fa-IR", "ar-EG"]) {
    const window = styled(tag);
    const body = window.getComputedStyle(window.document.body);
    assert.deepEqual(familyNames(body.fontFamily), rtlStack, `${tag} should use the RTL body stack`);
    assert.equal(body.overflowWrap, "break-word", `${tag} should break a long token instead of overflowing`);
    assert.equal(body.letterSpacing, "normal", `${tag} should not space joined letters`);
  }
  const latin = styled("en");
  assert.deepEqual(familyNames(latin.getComputedStyle(latin.document.body).fontFamily), bodyStack);
});

test("a command or identifier keeps the monospace face on either language page", () => {
  assert.equal(monoStack[0], "Geist Mono");
  assert.deepEqual(familiesOf("npm install --save-dev @scope/pkg@1.2.3", monoStack), ["Geist Mono"]);
  assert.deepEqual(familiesOf("git commit -m 'fix: #28'", monoStack), ["Geist Mono"]);

  // The right-to-left layer changes prose faces only; it never remaps code to a proportional face.
  assert.doesNotMatch(stripComments(rtlCss), /--type-font-mono\s*:/, "rtl.css remaps the code face");
});

test("sample output and variables keep the monospace face on a right-to-left page", () => {
  // `samp` and `var` are machine text: their values keep the mono face and isolate in rtl.css.
  for (const value of ["beacon: ready", "retry_limit", "https://example.com/api?q=1", "1,024.50"]) {
    assert.deepEqual(familiesOf(value, monoStack), ["Geist Mono"]);
  }
  const technical = blocks(rtlCss).find((block) => block.body.includes("font-family: var(--type-font-mono)"));
  assert.ok(technical, "rtl.css does not give technical inline content the mono face");
  for (const element of ["samp", "var"]) {
    assert.ok(technical.selector.includes(element), `rtl.css does not name ${element}`);
  }
  assert.match(technical.body, /unicode-bidi:\s*isolate/);
});

test("Persian and Arabic prose may break a long token but never inside a joined word", () => {
  const prose = rule(":lang(fa)");
  assert.ok(prose.selector.includes(":lang(ar)"), "the prose rule covers Persian but not Arabic");
  assert.equal(property(prose.body, "overflow-wrap"), "break-word");
  assert.equal(property(prose.body, "word-break"), "normal");
});

test("code, keys, and sample output are exempt from the prose breaking rule", () => {
  const exempt = rule(":where(pre, code, kbd, samp)");
  assert.ok(exempt.selector.includes(":lang(fa)") && exempt.selector.includes(":lang(ar)"));
  assert.equal(property(exempt.body, "overflow-wrap"), "normal");
});

test("no locale rule changes the case or width class of text", () => {
  // Identifiers, commands, and machine values keep their exact characters; only glyph selection,
  // line breaking, and the face change with the language.
  assert.doesNotMatch(stripComments(css), /text-transform\s*:/, "fonts.css transforms text");
  assert.doesNotMatch(stripComments(css), /font-variant-caps\s*:/, "fonts.css changes the case width");
});

test("each web family has a metric-matched local fallback", () => {
  for (const family of ["Geist", "Geist Mono", "Vazirmatn"]) {
    const fallback = faces.find((face) => face.family === `${family} Fallback`);
    assert.ok(fallback, `${family} has no fallback face`);

    const body = blocks(css).find((block) => block.selector === "@font-face" && block.body.includes(`"${family} Fallback"`))?.body ?? "";
    for (const metric of ["size-adjust", "ascent-override", "descent-override"]) {
      assert.ok(property(body, metric), `${family} Fallback has no ${metric}`);
    }
  }
});
