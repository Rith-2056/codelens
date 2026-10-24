// The problem list shows your progress, read from saved sessions (this browser only).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { addSession } from "../sessions";
import ProblemList from "./ProblemList";

const session = (slug: string, outcome: "accepted" | "wrong") =>
  addSession({ slug, title: slug, code: "x", outcome, input: "", got: null, expected: null, error: null, category: outcome === "wrong" ? "logic" : null });

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("problem list", () => {
  it("marks problems you solved and problems you tried", () => {
    session("binary-search", "wrong");
    session("two-sum", "wrong");
    session("two-sum", "accepted");
    render(<ProblemList />);
    const row = (re: RegExp) => screen.getByRole("link", { name: re }).closest("li")!;
    expect(row(/^1\. Two Sum$/).textContent).toMatch(/Solved/);
    expect(row(/^704\. Binary Search$/).textContent).toMatch(/Tried/);
    expect(row(/^70\. Climbing Stairs$/).textContent).not.toMatch(/Solved|Tried/);
    expect(screen.getByText(/1 of 8 solved/)).toBeTruthy();
  });

  it("describes what you do here in current terms", () => {
    render(<ProblemList />);
    expect(document.body.textContent).not.toMatch(/next to a correct one/);
    expect(document.body.textContent).toMatch(/step by step/);
  });
});
