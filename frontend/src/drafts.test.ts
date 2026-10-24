// Drafts: the code on each page is saved in this browser as you type, so
// leaving the page, reloading or closing the tab never loses it.
import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, loadDraft, MAX_DRAFT_CHARS, saveDraft } from "./drafts";

beforeEach(() => window.localStorage.clear());

describe("drafts", () => {
  it("saves and loads code per page", () => {
    saveDraft("two-sum", "class Solution:\n    pass\n");
    saveDraft("playground", "x = 1\n");
    expect(loadDraft("two-sum")).toBe("class Solution:\n    pass\n");
    expect(loadDraft("playground")).toBe("x = 1\n");
    expect(loadDraft("binary-search")).toBeNull();
  });

  it("clearing a draft forgets it", () => {
    saveDraft("two-sum", "a");
    clearDraft("two-sum");
    expect(loadDraft("two-sum")).toBeNull();
  });

  it("ignores junk and huge drafts, and never throws when storage is blocked", () => {
    window.localStorage.setItem("codelens.drafts.v1", "{not json");
    expect(loadDraft("two-sum")).toBeNull();
    saveDraft("two-sum", "x".repeat(MAX_DRAFT_CHARS + 1));
    expect(loadDraft("two-sum")).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft("two-sum", "a", blocked)).not.toThrow();
    expect(loadDraft("two-sum", blocked)).toBeNull();
  });
});
