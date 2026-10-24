// Debugging sessions: every Submit result, saved in this browser only
// (localStorage). No account and no server: the data never leaves the
// device, and "Clear all" removes it. Storage can be missing, full, blocked
// or hold junk; none of that may break the app.

import { MISTAKES, type Mistake } from "./components/mistakes";

export type Session = {
  id: string;
  /** ISO time of the Submit. */
  at: string;
  slug: string;
  title: string;
  code: string;
  outcome: "accepted" | "wrong";
  /** The failing input, as Python ("n = 2"); for accepted runs, a summary. */
  input: string;
  got: string | null;
  expected: string | null;
  error: { type: string; message: string } | null;
  category: Mistake | null;
};

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const KEY = "codelens.sessions.v1";
export const MAX_SESSIONS = 200;

function defaultStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isSession(v: unknown): v is Session {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.at === "string" &&
    typeof s.slug === "string" &&
    typeof s.code === "string" &&
    (s.outcome === "accepted" || s.outcome === "wrong")
  );
}

/** Saved sessions, newest first. */
export function loadSessions(store: Store | undefined = defaultStore()): Session[] {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isSession) : [];
  } catch {
    return [];
  }
}

let counter = 0;

/** Save one session (newest first, at most MAX_SESSIONS). Never throws. */
export function addSession(
  s: Omit<Session, "id" | "at">,
  store: Store | undefined = defaultStore(),
  now: () => Date = () => new Date(),
): void {
  const at = now();
  const entry: Session = { ...s, id: `${at.getTime().toString(36)}-${(counter++).toString(36)}`, at: at.toISOString() };
  try {
    store?.setItem(KEY, JSON.stringify([entry, ...loadSessions(store)].slice(0, MAX_SESSIONS)));
  } catch {
    // Storage full or blocked: the session is simply not kept.
  }
}

export function clearSessions(store: Store | undefined = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Wrong attempts counted by mistake category, most common first. */
export function mistakeSummary(sessions: readonly Session[]): { category: Mistake; count: number }[] {
  const order = Object.keys(MISTAKES) as Mistake[];
  const counts = new Map<Mistake, number>();
  for (const s of sessions) {
    if (s.outcome === "wrong" && s.category) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.category) - order.indexOf(b.category));
}

// "Open in editor": the sessions page hands a saved attempt's code to the
// problem page it opens (in memory only; the hash router keeps the app loaded).
let pending: { slug: string; code: string } | null = null;

export function openInEditor(slug: string, code: string): void {
  pending = { slug, code };
}

/** The code to start the problem's editor with, once. */
export function takePendingCode(slug: string): string | null {
  if (!pending || pending.slug !== slug) return null;
  const { code } = pending;
  pending = null;
  return code;
}
