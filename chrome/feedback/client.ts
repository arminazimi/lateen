/*
 * Page feedback island: reveals the two vote buttons, posts the answer to the configured endpoint,
 * and records the vote for this browser session only. The widget stays hidden unless the site set an
 * endpoint; nothing is stored outside `sessionStorage`, and no request is made until a reader votes.
 */

/** The two answers the buttons carry in `data-feedback-vote`. */
export type FeedbackVote = "yes" | "no";

/** What the endpoint receives: the page's URL and whether it helped. */
export interface FeedbackPayload {
  readonly url: string;
  readonly helpful: boolean;
}

/** The POST the island performs; tests pass a fake, the browser passes `fetch`. */
export type FeedbackPost = (endpoint: string, body: string) => Promise<void>;

/** The parts of `sessionStorage` the island uses. */
export interface FeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A vote button as the island reads and writes it. */
export interface FeedbackButton {
  hidden: boolean;
  disabled: boolean;
  dataset: { vote?: string };
  addEventListener(type: "click", listener: () => void): void;
}

/** The status region the island writes the outcome to. */
export interface FeedbackStatus {
  textContent: string | null;
}

/** The widget root as the island reads it. */
export interface FeedbackRoot {
  hidden: boolean;
  dataset: {
    endpoint?: string;
    url?: string;
    thanks?: string;
    failed?: string;
    already?: string;
  };
  querySelectorAll(selector: string): Iterable<FeedbackButton>;
  querySelector(selector: string): FeedbackStatus | null;
}

/** Everything the island reads from the world; tests pass fakes, the browser supplies its own. */
export interface FeedbackEnv {
  storage: FeedbackStorage;
  post: FeedbackPost;
}

/** Every stored vote lives under this prefix plus the page's URL. */
export const KEY_PREFIX = "slipway-feedback:";

/** The session-storage key for one page's vote. */
export function keyFor(url: string): string {
  return `${KEY_PREFIX}${url}`;
}

/** The vote stored for `url` this session, if it is one this widget wrote. */
export function read(storage: FeedbackStorage, url: string): FeedbackVote | undefined {
  try {
    const saved = storage.getItem(keyFor(url));
    return saved === "yes" || saved === "no" ? saved : undefined;
  } catch {
    return undefined;
  }
}

/** Remember the vote for the rest of the session. Storage may throw (private mode); the answer still counts. */
export function save(storage: FeedbackStorage, url: string, vote: FeedbackVote): void {
  try {
    storage.setItem(keyFor(url), vote);
  } catch {
    /* storage is unavailable: the vote was still sent */
  }
}

/** The answer a button carries, or none when its attribute is not one the widget wrote. */
export function voteOf(button: FeedbackButton): FeedbackVote | undefined {
  return button.dataset.vote === "yes" || button.dataset.vote === "no" ? button.dataset.vote : undefined;
}

/** Sends one answer to the endpoint as a JSON body. */
export function submit(endpoint: string, payload: FeedbackPayload, post: FeedbackPost): Promise<void> {
  return post(endpoint, JSON.stringify(payload));
}

/** Hides and disables every button, then writes the outcome on the status region. */
export function finish(root: FeedbackRoot, text: string): void {
  for (const button of root.querySelectorAll("[data-feedback-vote]")) {
    button.hidden = true;
    button.disabled = true;
  }
  const status = root.querySelector(".feedback-status");
  if (status !== null) status.textContent = text;
}

/**
 * Posts one answer and writes the outcome. The vote is stored only after the endpoint accepts it, so
 * a later page in the same session shows the same thanks; a failed request shows a neutral thanks
 * and leaves the vote unrecorded, so the reader may answer again after a reload.
 */
export function vote(root: FeedbackRoot, button: FeedbackButton, env: FeedbackEnv): Promise<void> {
  const answer = voteOf(button);
  const endpoint = root.dataset.endpoint ?? "";
  const url = root.dataset.url ?? "";
  if (answer === undefined || endpoint === "" || url === "") return Promise.resolve();

  for (const other of root.querySelectorAll("[data-feedback-vote]")) other.disabled = true;
  return submit(endpoint, { url, helpful: answer === "yes" }, env.post).then(
    () => {
      save(env.storage, url, answer);
      finish(root, root.dataset.thanks ?? "");
    },
    () => {
      finish(root, root.dataset.failed ?? "");
    },
  );
}

/**
 * Reveals the widget and wires both buttons. Nothing happens without an endpoint and a page URL, and
 * a session that already answered shows the stored acknowledgement instead of the buttons.
 */
export function activate(root: FeedbackRoot, env: FeedbackEnv): void {
  const endpoint = root.dataset.endpoint ?? "";
  const url = root.dataset.url ?? "";
  if (endpoint === "" || url === "") return;

  root.hidden = false;
  if (read(env.storage, url) !== undefined) {
    finish(root, root.dataset.already ?? "");
    return;
  }

  const buttons = [...root.querySelectorAll("[data-feedback-vote]")];
  if (buttons.length === 0) return;
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener("click", () => {
      void vote(root, button, env);
    });
  }
}

/** The browser globals the island needs; the theme's tsconfig has no DOM lib. */
const globals = globalThis as unknown as {
  document?: { querySelector(selector: string): unknown };
  sessionStorage?: FeedbackStorage;
  fetch?: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<{ ok: boolean; status: number }>;
};

/** `fetch` as the island wants it: POSTs JSON and rejects on an HTTP error. */
function browserPost(endpoint: string, body: string): Promise<void> {
  const fetch = globals.fetch;
  if (fetch === undefined) return Promise.reject(new Error("fetch is unavailable"));
  return fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });
}

// The island runs when the browser loads it; nothing happens in a runtime without a document.
if (globals.document !== undefined) {
  const root = globals.document.querySelector("[data-feedback]");
  if (root !== null && globals.sessionStorage !== undefined && globals.fetch !== undefined) {
    activate(root as FeedbackRoot, { storage: globals.sessionStorage, post: browserPost });
  }
}
