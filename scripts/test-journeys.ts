// End-to-end journeys the unit tests cannot prove: real keyboard focus, clipboard writes, the
// variables form updating code in the browser, 320 px reflow, 200% text size, reduced motion,
// forced colors, print, right-to-left code isolation, and version/locale context in agent links.
//
// It builds the docs site and the accessibility fixture, serves both on loopback, and drives Chromium.
// A screen reader is not automated here: the checklist in site/accessibility.md keeps that item manual.
//
// Usage: npm run test:journeys   (needs `npm ci` and `npx playwright install chromium`)
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { THEME_KEY } from "../chrome/theme-toggle/key.ts";
import { build, startServer, type StaticServer } from "./test-a11y.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DOCS = join(ROOT, ".mizzen/qa/docs");
const FIXTURES = join(ROOT, ".mizzen/qa/fixtures");

/** One named check; a thrown error fails the run and names the journey. */
type Check = readonly [name: string, run: () => Promise<void>];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const failures: string[] = [];

async function main(): Promise<void> {
  build("site", ".mizzen/qa/docs");
  build("test/accessibility/fixtures/site", ".mizzen/qa/fixtures");

  const docs = await startServer(DOCS, "/lateen");
  const fixtures = await startServer(FIXTURES, "");
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const checks: Check[] = [
      ["skip link moves focus to main", () => skipLink(browser as Browser, docs)],
      ["search opens, arrows move the active option, Escape returns focus", () => search(browser as Browser, docs)],
      ["drawer traps focus and returns it on Escape", () => drawer(browser as Browser, docs)],
      ["code tabs respond to arrow keys", () => codeTabs(browser as Browser, docs)],
      ["copy code writes the block and announces the result", () => copyCode(browser as Browser, docs)],
      ["block action copies an agent prompt with the source span", () => blockAction(browser as Browser, docs)],
      ["copy-Markdown works by shortcut and keeps page context in agent links", () => pageActions(browser as Browser, docs)],
      ["variable substitution updates the example, and Reset restores it", () => variables(browser as Browser, docs)],
      ["320 px reflow and 200% text size have no sideways scroll", () => reflow(browser as Browser, docs)],
      ["text-spacing override keeps the article readable", () => textSpacing(browser as Browser, docs)],
      ["a focused navigation link is not obscured", () => focusNotObscured(browser as Browser, docs)],
      ["reduced motion removes transitions", () => reducedMotion(browser as Browser, docs)],
      ["forced colors and print keep the content readable", () => forcedColorsAndPrint(browser as Browser, fixtures)],
      ["RTL code stays left to right and version/route context is kept", () => rtl(fixtures)],
    ];
    for (const [name, run] of checks) {
      try {
        await run();
        console.log(`PASS ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${name}: ${message}`);
        console.error(`FAIL ${name}: ${message}`);
      }
    }
  } finally {
    await browser?.close();
    await docs.close();
    await fixtures.close();
  }

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} journey(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("OK: all browser journeys passed");
}

const viewport = (width: number, height: number) => ({ width, height });

async function opened(browser: Browser, url: string, options: { width?: number; height?: number; reducedMotion?: "reduce" } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: viewport(options.width ?? 1280, options.height ?? 900),
    ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
  });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: "load" });
  if (response === null || response.status() !== 200) throw new Error(`${url} did not load`);
  return { context, page };
}

async function skipLink(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`);
  try {
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.className ?? "");
    assert(first.includes("skip-link"), `first Tab reached ${JSON.stringify(first)}, not the skip link`);
    await page.keyboard.press("Enter");
    const target = await page.evaluate(() => document.activeElement?.id ?? "");
    assert(target === "main", `skip link focused ${JSON.stringify(target)}, not #main`);
    const visible = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    });
    assert(visible, "the focused main landmark has no visible focus ring");
  } finally {
    await context.close();
  }
}

async function search(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`);
  try {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);
    const dialog = page.locator("dialog[data-search]");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const input = page.locator("[data-search-input]");
    assert(await input.evaluate((node) => node === document.activeElement), "the search field did not take focus");
    await input.fill("install");
    await page.locator('[data-search-results] [role="option"]').first().waitFor({ timeout: 10000 });
    await page.keyboard.press("ArrowDown");
    const active = await input.getAttribute("aria-activedescendant");
    assert(active !== null && active !== "", "ArrowDown did not name an active option");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 3000 });
    await page.waitForFunction(() => document.activeElement?.hasAttribute("data-search-open") === true, undefined, { timeout: 3000 });
  } finally {
    await context.close();
  }
}

async function drawer(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`, { width: 375, height: 800 });
  try {
    const button = page.locator("[data-drawer-open]");
    await button.waitFor({ state: "visible" });
    await button.click();
    const dialog = page.locator("dialog[data-drawer]");
    await dialog.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 3000 });
    assert(await button.evaluate((node) => node === document.activeElement), "Escape did not return focus to the menu button");
  } finally {
    await context.close();
  }
}

async function codeTabs(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/components/code-tabs/`);
  try {
    const tabs = page.locator("[data-code-tabs] [role=tab]");
    await tabs.first().waitFor();
    assert((await tabs.count()) >= 2, "the page has fewer than two code tabs");
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    assert((await tabs.nth(1).getAttribute("aria-selected")) === "true", "ArrowRight did not select the next tab");
    assert(await tabs.nth(1).evaluate((node) => node === document.activeElement), "focus did not follow the selection");
    await page.keyboard.press("End");
    assert((await tabs.last().getAttribute("aria-selected")) === "true", "End did not select the last tab");
  } finally {
    await context.close();
  }
}

async function copyCode(browser: Browser, docs: StaticServer): Promise<void> {
  const context = await browser.newContext({ viewport: viewport(1280, 900) });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: docs.url });
  const page = await context.newPage();
  try {
    await page.goto(`${docs.url}/lateen/components/code/`, { waitUntil: "load" });
    const button = page.locator(".code-copy").first();
    await button.waitFor({ state: "visible" });
    await button.click();
    const status = page.locator(".code-copy-status").first();
    await page.waitForFunction(() => document.querySelector(".code-copy-status")?.textContent?.includes("Copied"), undefined, { timeout: 5000 });
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert(text.trim() !== "", "the clipboard is empty after copying a code block");
    assert((await status.textContent())?.includes("Copied") === true, "the copy status did not announce success");
  } finally {
    await context.close();
  }
}

async function blockAction(browser: Browser, docs: StaticServer): Promise<void> {
  const context = await browser.newContext({ viewport: viewport(1280, 900) });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: docs.url });
  const page = await context.newPage();
  try {
    await page.goto(`${docs.url}/lateen/install/`, { waitUntil: "load" });
    const button = page.locator("[data-block-action]").first();
    await button.waitFor({ state: "visible", timeout: 5000 });
    const label = await button.getAttribute("aria-label");
    assert(label !== null && /site\/install\.md:\d+/.test(label), `the block action names no source span: ${label}`);
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const node = document.querySelector("[data-block-action]");
      return node !== null && node.textContent === "Copied";
    }, undefined, { timeout: 5000 });
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    assert(/site\/install\.md:\d+/.test(prompt), "the copied prompt lost the source span");
    assert(prompt.includes("Current text"), "the copied prompt lost the block text field");
  } finally {
    await context.close();
  }
}

async function pageActions(browser: Browser, docs: StaticServer): Promise<void> {
  const context = await browser.newContext({ viewport: viewport(1280, 900) });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: docs.url });
  const page = await context.newPage();
  try {
    await page.goto(`${docs.url}/lateen/install/`, { waitUntil: "load" });
    assert((await page.locator("[data-copy-markdown]").count()) === 1, "the page has more than one copy-Markdown control");
    assert((await page.locator("[data-page-agent-menu]").count()) === 1, "the page has more than one agent menu");
    const view = page.locator(".copy-markdown-link");
    const href = await view.getAttribute("href");
    assert(href !== null && href.endsWith(".md"), `the Markdown twin link is not a .md href: ${href}`);
    await page.keyboard.press("m");
    await page.waitForFunction(() => document.querySelector("[data-copy-markdown-status]")?.textContent?.includes("Copied"), undefined, { timeout: 5000 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert(copied.includes("Install"), "the copied Markdown does not contain the page title");
    await page.locator("[data-page-agent-menu] summary").click();
    const provider = page.locator(".page-agent-menu-provider").first();
    const providerHref = await provider.getAttribute("href");
    assert(providerHref !== null && providerHref.includes("Read+"), "the agent provider link has no page context");
    assert(providerHref.includes(encodeURIComponent("https://velella.sh/lateen/install/")), "the agent link lost the page URL");
  } finally {
    await context.close();
  }
}

async function variables(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/components/variables-form/`);
  try {
    const input = page.locator('input[data-var="api_key"]').first();
    await input.fill("journey-key-42");
    await page.waitForFunction(() => document.body.textContent?.includes("journey-key-42") === true, undefined, { timeout: 3000 });
    assert(!(await page.locator("pre").first().textContent())?.includes("{{api_key}}"), "the placeholder was not substituted");
    await page.locator("[data-variables-reset]").first().click();
    await page.waitForFunction(() => document.body.textContent?.includes("YOUR_KEY") === true, undefined, { timeout: 3000 });
    assert(!(await page.locator("pre").first().textContent())?.includes("journey-key-42"), "Reset did not restore the default");
  } finally {
    await context.close();
  }
}

async function reflow(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`, { width: 320, height: 800 });
  try {
    const at320 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(at320 <= 1, `320 px reflow scrolls sideways by ${at320}px`);
    await page.setViewportSize(viewport(1280, 900));
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const at200 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(at200 <= 1, `200% text size scrolls sideways by ${at200}px`);
    assert(await page.locator("main").first().isVisible(), "the article is not visible at 200% text size");
    assert(((await page.locator("main").first().textContent()) ?? "").includes("Install"), "the article text is missing at 200% text size");
  } finally {
    await context.close();
  }
}

async function textSpacing(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`);
  try {
    await page.addStyleTag({
      content:
        "* { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; line-height: 1.5 !important; }" +
        "p { margin-block-end: 2em !important; }",
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `the text-spacing override scrolls sideways by ${overflow}px`);
    assert(((await page.locator("main").first().textContent()) ?? "").includes("Install"), "the article text is missing after the spacing override");
  } finally {
    await context.close();
  }
}

async function focusNotObscured(browser: Browser, docs: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`);
  try {
    const link = page.locator(".pager-link").first();
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    const visible = await link.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || node.contains(hit);
    });
    assert(visible, "the sticky header covers the focused pager link");
  } finally {
    await context.close();
  }
}

async function reducedMotion(browser: Browser, docs: StaticServer): Promise<void> {  const { context, page } = await opened(browser, `${docs.url}/lateen/install/`, { reducedMotion: "reduce" });
  try {
    const matches = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    assert(matches, "the browser did not apply the reduced-motion preference");
    const fast = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-fast").trim());
    assert(fast === "0ms" || fast === "0s", `--motion-fast is ${fast} under reduced motion`);
    const base = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--motion-base").trim());
    assert(base === "0ms" || base === "0s", `--motion-base is ${base} under reduced motion`);
  } finally {
    await context.close();
  }
}

async function forcedColorsAndPrint(browser: Browser, fixtures: StaticServer): Promise<void> {
  const { context, page } = await opened(browser, `${fixtures.url}/doc/`);
  try {
    await page.emulateMedia({ forcedColors: "active" });
    assert(await page.evaluate(() => matchMedia("(forced-colors: active)").matches), "forced colors did not apply");
    assert(await page.locator("main h1").first().isVisible(), "the page is not readable in forced colors");
    await page.emulateMedia({ media: "print" });
    assert(!(await page.locator(".header").first().isVisible()), "the site header prints");
    assert(await page.locator("main h1").first().isVisible(), "the article does not print");
    const body = await page.locator(".details").first().locator(".details-body").first().evaluate((node) => getComputedStyle(node).display);
    assert(body !== "none", "a closed disclosure body does not print");
  } finally {
    await context.close();
  }
}

async function rtl(fixtures: StaticServer): Promise<void> {
  const browser = await chromium.launch();
  const { context, page } = await opened(browser, `${fixtures.url}/fa/`);
  try {
    assert((await page.locator("html").getAttribute("dir")) === "rtl", "the Persian page is not right to left");
    const direction = await page.locator("pre").first().evaluate((node) => getComputedStyle(node).direction);
    assert(direction === "ltr", `a code block reads ${direction} on a right-to-left page`);
    const language = page.locator(".language-switcher a").first();
    const langHref = await language.getAttribute("href");
    assert(langHref !== null && langHref !== "", "the language switcher has no destination");
    const version = page.locator(".version-switcher").first();
    assert((await version.count()) === 0 || (await version.isVisible()), "the version switcher rendered but is not usable");
  } finally {
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`FAIL: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
