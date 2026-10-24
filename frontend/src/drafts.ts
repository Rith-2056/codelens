// Drafts: the code on each page (a problem's slug, or "playground"), saved in
// this browser as you type, so leaving the page, reloading or closing the tab
// never loses it. Like sessions.ts: local only, and missing, full, blocked or
// junk storage never breaks the app.

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const KEY = "codelens.drafts.v1";
/** Longer code is not saved (a pasted log, not a solution). */
export const MAX_DRAFT_CHARS = 50_000;

function defaultStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readAll(store: Store | undefined): Record<string, string> {
  try {
    const raw = store?.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, string>, store: Store | undefined): void {
  try {
    if (Object.keys(all).length === 0) store?.removeItem(KEY);
    else store?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* full or blocked: the draft just isn't kept */
  }
}

export function loadDraft(page: string, store: Store | undefined = defaultStore()): string | null {
  return readAll(store)[page] ?? null;
}

export function saveDraft(page: string, code: string, store: Store | undefined = defaultStore()): void {
  if (code.length > MAX_DRAFT_CHARS) return;
  writeAll({ ...readAll(store), [page]: code }, store);
}

export function clearDraft(page: string, store: Store | undefined = defaultStore()): void {
  const all = readAll(store);
  delete all[page];
  writeAll(all, store);
}
