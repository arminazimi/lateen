// Builds tokens/*.json (one W3C design tokens file per group) into styles/tokens.css.
// `names.json` freezes the semantic token names and gives each a placeholder value; a group file
// overrides values by name, and a name that is not in `names.json` is an error.
// Usage: node scripts/tokens.ts [--check]   (--check fails when styles/tokens.css is stale)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = fileURLToPath(new URL("../", import.meta.url));
export const paths = { tokens: join(pkg, "tokens"), css: join(pkg, "styles/tokens.css") };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// light-dark() takes colors only, so only these groups may carry a dark value.
const COLOR_GROUPS = new Set(["color", "state", "code"]);

/** One token's value: a light value, an optional dark one (color groups), and an optional reduced-motion one. */
export type TokenValue = { light: string; dark?: string; reduced?: string };
export type Tokens = Map<string, TokenValue>;
type Token = { $value: unknown; $extensions?: { lateen?: { dark?: unknown; reduced?: unknown } } };

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
};

const isToken = (node: unknown): node is Token => node !== null && typeof node === "object" && "$value" in node;

/** Flattens one group file (strings, `{ $value }` tokens, nested groups) to Map(name -> { light, dark }). */
export function flatten(group: string, node: unknown, file: string, prefix: string[] = [], out: Tokens = new Map()): Tokens {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith("$")) continue;
    const path = [...prefix, key];
    const name = path.join("-");
    if (!NAME.test(key)) throw new Error(`${file}: "${path.join(".")}" is not lowercase kebab-case`);
    if (typeof value === "string" || typeof value === "number") out.set(name, { light: String(value) });
    else if (isToken(value)) {
      const dark = value.$extensions?.lateen?.dark;
      const reduced = value.$extensions?.lateen?.reduced;
      if (dark !== undefined && !COLOR_GROUPS.has(group)) throw new Error(`${file}: "${path.join(".")}" has a dark value, but only ${[...COLOR_GROUPS].join(", ")} tokens can`);
      out.set(name, {
        light: String(value.$value),
        ...(dark === undefined ? {} : { dark: String(dark) }),
        ...(reduced === undefined ? {} : { reduced: String(reduced) }),
      });
    } else if (value !== null && typeof value === "object") flatten(group, value, file, path, out);
    else throw new Error(`${file}: "${path.join(".")}" must be a value, a { "$value" } token, or a group`);
  }
  return out;
}

/**
 * Group files by file name, sorted; `names.json` is the registry, not a group.
 * `<group>.json` sets the values of a group. `<group>.light.json` sets only the light values of a group whose
 * dark values come from elsewhere; it is applied after the plain group file.
 * `code.light.json` / `code.dark.json` are whole Shiki themes read by `components/code`, not token groups.
 */
export function groupFiles(dir = paths.tokens) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "names.json" && !/^code\.(light|dark)\.json$/.test(f))
    .sort()
    .map((f) => {
      const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)(\.light)?\.json$/.exec(f);
      if (!match) throw new Error(`${join(dir, f)}: a group file is <group>.json or <group>.light.json, with a lowercase kebab-case group`);
      return { group: match[1] ?? "", light: match[2] !== undefined, file: join(dir, f) };
    })
    .sort((a, b) => Number(a.light) - Number(b.light));
}

/** Returns Map("<group>-<name>" -> { light, dark? }) in `names.json` order, with group-file overrides applied. */
export function loadTokens(dir = paths.tokens): Tokens {
  const namesFile = join(dir, "names.json");
  const names = readJson(namesFile) as Record<string, unknown>;
  const tokens: Tokens = new Map();
  for (const [group, node] of Object.entries(names)) {
    if (!NAME.test(group)) throw new Error(`${namesFile}: group "${group}" is not lowercase kebab-case`);
    for (const [name, value] of flatten(group, node, namesFile)) tokens.set(`${group}-${name}`, value);
  }
  for (const { group, light, file } of groupFiles(dir)) {
    if (!(group in names)) throw new Error(`${file}: "${group}" is not a group in names.json`);
    const known = flatten(group, names[group], namesFile);
    for (const [name, value] of flatten(group, readJson(file), file)) {
      if (!known.has(name)) throw new Error(`${file}: "${group}.${name}" is not in names.json; add the name there first`);
      const key = `${group}-${name}`;
      if (!light) {
        tokens.set(key, value);
        continue;
      }
      if (value.dark !== undefined || value.reduced !== undefined) throw new Error(`${file}: "${group}.${name}" is in a light file, which sets only the light value`);
      tokens.set(key, { ...(tokens.get(key) as TokenValue), light: value.light });
    }
  }
  return tokens;
}

/** `{color.canvas}` becomes `var(--color-canvas)`; an unknown reference is an error. */
const resolve = (value: string, tokens: Tokens, token: string): string =>
  value.replace(/\{([^{}]+)\}/g, (_, ref: string) => {
    const name = ref.trim().replace(/\./g, "-");
    if (!tokens.has(name)) throw new Error(`${token}: unknown reference {${ref}}`);
    return `var(--${name})`;
  });

export function buildCss(tokens: Tokens): string {
  const lines: string[] = [];
  const reduced: string[] = [];
  for (const [name, { light, dark, reduced: reducedValue }] of tokens) {
    const l = resolve(light, tokens, name);
    lines.push(`  --${name}: ${dark === undefined ? l : `light-dark(${l}, ${resolve(dark, tokens, name)})`};`);
    if (reducedValue !== undefined) reduced.push(`    --${name}: ${resolve(reducedValue, tokens, name)};`);
  }
  // Tokens with a `reduced` value (motion durations and easings) take it under prefers-reduced-motion.
  const reducedBlock = reduced.length === 0 ? "" : `
@media (prefers-reduced-motion: reduce) {
  :root {
${reduced.join("\n")}
  }
}
`;
  return `/* Generated by scripts/tokens.ts from tokens/*.json. Do not edit; run \`npm run tokens\`. */
:root {
  color-scheme: light dark;
${lines.join("\n")}
}
${reducedBlock}
:root[data-theme="light"] {
  color-scheme: light;
}

:root[data-theme="dark"] {
  color-scheme: dark;
}
`;
}

export function main(argv = process.argv.slice(2), { dir = paths.tokens, css = paths.css } = {}) {
  const built = buildCss(loadTokens(dir));
  if (argv.includes("--check")) {
    if ((existsSync(css) ? readFileSync(css, "utf8") : null) === built) return console.log("OK: tokens.css is current");
    console.error("FAIL: styles/tokens.css is out of date; run `npm run tokens`");
    process.exitCode = 1;
    return;
  }
  writeFileSync(css, built);
  console.log("wrote styles/tokens.css");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
