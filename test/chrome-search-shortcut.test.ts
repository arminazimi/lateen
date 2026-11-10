import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activateShortcuts,
  hintFor,
  isMacPlatform,
  isSearchShortcut,
  isTypingTarget,
  MAC_HINT,
  OTHER_HINT,
  type ShortcutButton,
  type ShortcutEnv,
  type ShortcutEvent,
} from "../chrome/search/shortcut.ts";

interface FakeEvent extends ShortcutEvent {
  prevented: boolean;
}

function keyEvent(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; target?: unknown } = {},
): FakeEvent {
  const event: FakeEvent = {
    key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
    target: modifiers.target ?? null,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

/** A document that records its keydown listeners, so a test can fire a key. */
function fakeEnv(platform: string) {
  const listeners: Array<(event: ShortcutEvent) => void> = [];
  const env: ShortcutEnv = {
    platform,
    addEventListener(type: string, listener: (event: ShortcutEvent) => void) {
      assert.equal(type, "keydown");
      listeners.push(listener);
    },
  };
  return {
    env,
    fire(event: ShortcutEvent) {
      for (const listener of listeners) listener(event);
    },
  };
}

function fakeButton(): ShortcutButton & { clicks: number } {
  const button = {
    clicks: 0,
    click() {
      button.clicks += 1;
    },
  };
  return button;
}

function fakeHint(): { textContent: string | null } {
  return { textContent: null };
}

test("the hint is ⌘K on Apple platforms and Ctrl+K elsewhere", () => {
  for (const platform of ["MacIntel", "iPhone", "iPad", "iPod touch", "macOS"]) {
    assert.equal(isMacPlatform(platform), true);
    assert.equal(hintFor(platform), MAC_HINT);
  }
  for (const platform of ["Win32", "Linux x86_64", "Android", "Chrome OS", ""]) {
    assert.equal(isMacPlatform(platform), false);
    assert.equal(hintFor(platform), OTHER_HINT);
  }
  assert.equal(MAC_HINT, "⌘K");
  assert.equal(OTHER_HINT, "Ctrl+K");
});

test("⌘K opens search on Apple platforms and Ctrl+K opens it elsewhere", () => {
  assert.equal(isSearchShortcut(keyEvent("k", { meta: true }), "MacIntel"), true);
  assert.equal(isSearchShortcut(keyEvent("K", { meta: true }), "MacIntel"), true);
  assert.equal(isSearchShortcut(keyEvent("k", { ctrl: true }), "Win32"), true);
  assert.equal(isSearchShortcut(keyEvent("K", { ctrl: true }), "Linux x86_64"), true);

  assert.equal(isSearchShortcut(keyEvent("k", { ctrl: true }), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("k", { meta: true }), "Win32"), false);
  assert.equal(isSearchShortcut(keyEvent("k"), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("k", { meta: true, shift: true }), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("k", { ctrl: true, alt: true }), "Win32"), false);
});

test("slash opens search with no command modifier, and Shift is allowed for layouts that need it", () => {
  assert.equal(isSearchShortcut(keyEvent("/"), "MacIntel"), true);
  assert.equal(isSearchShortcut(keyEvent("/"), "Win32"), true);
  assert.equal(isSearchShortcut(keyEvent("/", { shift: true }), "Linux x86_64"), true);

  assert.equal(isSearchShortcut(keyEvent("/", { ctrl: true }), "Win32"), false);
  assert.equal(isSearchShortcut(keyEvent("/", { meta: true }), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("/", { alt: true }), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("?"), "MacIntel"), false);
});

test("other keys, and an event without a key, are left to the page", () => {
  assert.equal(isSearchShortcut(keyEvent("s", { meta: true }), "MacIntel"), false);
  assert.equal(isSearchShortcut(keyEvent("Escape"), "Win32"), false);
  assert.equal(isSearchShortcut({ preventDefault() {} }, "Win32"), false);
});

test("a field the reader is typing in is recognised by tag or contenteditable", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);

  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(undefined), false);
  assert.equal(isTypingTarget("input"), false);
});

test("activation shows the platform's hint on the search button", () => {
  const button = fakeButton();
  const macHint = fakeHint();
  const otherHint = fakeHint();

  activateShortcuts({ button, hint: macHint }, fakeEnv("MacIntel").env);
  activateShortcuts({ button, hint: otherHint }, fakeEnv("Win32").env);

  assert.equal(macHint.textContent, MAC_HINT);
  assert.equal(otherHint.textContent, OTHER_HINT);
});

test("the shortcut presses the search button from anywhere on the page", () => {
  const button = fakeButton();
  const { env, fire } = fakeEnv("MacIntel");
  activateShortcuts({ button }, env);

  const command = keyEvent("k", { meta: true, target: { tagName: "BODY" } });
  fire(command);

  assert.equal(command.prevented, true);
  assert.equal(button.clicks, 1);

  const slash = keyEvent("/", { target: { tagName: "A" } });
  fire(slash);

  assert.equal(slash.prevented, true);
  assert.equal(button.clicks, 2);
});

test("a key pressed in a field is never taken from it", () => {
  const button = fakeButton();
  const { env, fire } = fakeEnv("Win32");
  activateShortcuts({ button }, env);

  for (const target of [
    { tagName: "INPUT" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
  ]) {
    const slash = keyEvent("/", { target });
    fire(slash);
    assert.equal(slash.prevented, false);
  }

  const command = keyEvent("k", { ctrl: true, target: { tagName: "INPUT" } });
  fire(command);

  assert.equal(command.prevented, false);
  assert.equal(button.clicks, 0);
});

test("an unrelated key does not open search or cancel its default", () => {
  const button = fakeButton();
  const { env, fire } = fakeEnv("Win32");
  activateShortcuts({ button }, env);

  const event = keyEvent("s", { ctrl: true, target: { tagName: "BODY" } });
  fire(event);

  assert.equal(event.prevented, false);
  assert.equal(button.clicks, 0);
});
