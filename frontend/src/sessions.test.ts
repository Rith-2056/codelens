// Debugging sessions, saved in this browser only (localStorage). Storage can
// be missing, full, blocked, or hold junk: none of that may break the app.
import { describe, expect, it } from "vitest";
import { addSession, clearSessions, loadSessions, mistakeSummary, MAX_SESSIONS, type Session } from "./sessions";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const session = (over: Partial<Session> = {}): Omit<Session, "id" | "at"> => ({
  slug: "climbing-stairs",
  title: "Climbing Stairs",
  code: "class Solution: ...",
  outcome: "wrong",
  input: "n = 2",
  got: "0",
  expected: "2",
  error: null,
  category: "off-by-one",
  ...over,
});

describe("sessions", () => {
  it("adds sessions newest first, with an id and a time", () => {
    const s = memoryStorage();
    addSession(session({ input: "n = 1" }), s, () => new Date("2026-10-24T15:00:00Z"));
    addSession(session({ input: "n = 2" }), s, () => new Date("2026-10-24T15:05:00Z"));
    const all = loadSessions(s);
    expect(all.map((x) => x.input)).toEqual(["n = 2", "n = 1"]);
    expect(all[0]!.at).toBe("2026-10-24T15:05:00.000Z");
    expect(all[0]!.id).not.toBe(all[1]!.id);
  });

  it(`keeps only the newest ${MAX_SESSIONS}`, () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_SESSIONS + 5; i++) addSession(session({ input: `n = ${i}` }), s);
    const all = loadSessions(s);
    expect(all).toHaveLength(MAX_SESSIONS);
    expect(all[0]!.input).toBe(`n = ${MAX_SESSIONS + 4}`);
  });

  it("survives junk, a missing store, and a store that throws", () => {
    const s = memoryStorage();
    s.setItem("codelens.sessions.v1", "{not json");
    expect(loadSessions(s)).toEqual([]);
    s.setItem("codelens.sessions.v1", JSON.stringify([{ nope: true }, session()]));
    expect(loadSessions(s)).toHaveLength(0); // entries without id/at are dropped
    expect(loadSessions(undefined)).toEqual([]);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSessions(throwing)).toEqual([]);
    expect(() => addSession(session(), throwing)).not.toThrow();
    expect(() => clearSessions(throwing)).not.toThrow();
  });

  it("clears everything", () => {
    const s = memoryStorage();
    addSession(session(), s);
    clearSessions(s);
    expect(loadSessions(s)).toEqual([]);
  });

  it("summarizes wrong attempts by mistake category, most common first", () => {
    const s = memoryStorage();
    addSession(session({ category: "pointer" }), s);
    addSession(session({ category: "off-by-one" }), s);
    addSession(session({ category: "off-by-one" }), s);
    addSession(session({ outcome: "accepted", category: null }), s);
    expect(mistakeSummary(loadSessions(s))).toEqual([
      { category: "off-by-one", count: 2 },
      { category: "pointer", count: 1 },
    ]);
  });
});
