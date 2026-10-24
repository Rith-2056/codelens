import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { TraceResult, TraceStep } from "../types/trace";
import hopsRaw from "../../../shared/fixtures/network-hops.json?raw";
import treeRaw from "../../../shared/fixtures/tree-height.json?raw";
import DataStructures from "./DataStructures";
import { framesOf, structuresFor } from "./structures";

const hops = JSON.parse(hopsRaw) as TraceResult;
const tree = JSON.parse(treeRaw) as TraceResult;

afterEach(cleanup);

function show(step: TraceStep) {
  return render(
    <DataStructures
      items={structuresFor(step.locals, undefined)}
      locals={step.locals}
      heap={step.heap}
      line=""
      frames={framesOf(step)}
    />,
  );
}

async function expectNoAxeViolations(el: Element) {
  // jsdom has no layout or canvas, so color contrast is checked in the browser instead.
  const result = await axe.run(el, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const midBfs = () =>
  hops.steps.find((s) => {
    const q = s.locals.queue as { __deque?: unknown[] } | undefined;
    return (q?.__deque?.length ?? 0) > 0 && "person" in s.locals;
  })!;
// Deepest recursion step whose `node` is a real node (the deepest call of all is the None base case).
const deepest = () =>
  tree.steps
    .filter((s) => typeof s.locals.node === "object" && s.locals.node !== null && "__ref" in s.locals.node)
    .reduce((a, b) => (b.stack.length > a.stack.length ? b : a));
const lastTreeStep = () => tree.steps[tree.steps.length - 1]!;

describe("Graph view", () => {
  it("draws the BFS adjacency dict as a graph with a text version", () => {
    show(midBfs());
    const img = screen.getByRole("img", { name: /graph.*5 nodes.*5 links/i });
    expect(img.tagName.toLowerCase()).toBe("svg");
    const list = screen.getByRole("list", { name: /graph as text/i });
    const a = within(list).getByText(/^A:/);
    expect(a.textContent).toMatch(/linked to B, C/);
    expect(list.textContent).toMatch(/in visited/);
    expect(list.textContent).toMatch(/← person/);
  });

  it("titles the card as a graph, not a hash map", () => {
    show(midBfs());
    const card = screen.getByRole("img", { name: /graph graph/i }).closest("li")!;
    expect(card.querySelector(".ds-kind")?.textContent).toMatch(/^graph/);
  });

  it("leaves room around the circle so node badges are not cut off", () => {
    show(midBfs());
    const svg = screen.getByRole("img", { name: /graph graph/i });
    const [minX, minY, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const xs = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cx")));
    const ys = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));
    // A badge like "visited, ← person" is about 90px wide at 10px font, centered on its node.
    expect(Math.min(...xs) - 45).toBeGreaterThanOrEqual(minX!);
    expect(Math.max(...xs) + 45).toBeLessThanOrEqual(minX! + w!);
    expect(Math.max(...ys) + 16 + 14).toBeLessThanOrEqual(minY! + h!);
  });

  it("keeps a plain dict like hops as a key → value table", () => {
    show(midBfs());
    expect(screen.queryByRole("img", { name: /hops/i })).toBeNull();
    expect(screen.getByRole("table", { name: /hops/i })).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = show(midBfs());
    await expectNoAxeViolations(container);
  });
});

describe("Tree view", () => {
  it("draws the TreeNode objects as a tree with a nested text version", () => {
    show(lastTreeStep());
    expect(screen.getByRole("img", { name: /tree.*6 nodes/i })).toBeTruthy();
    const list = screen.getByRole("list", { name: /root as text/i });
    expect(list.textContent).toMatch(/1.*left.*2.*4.*right.*3.*5.*6/s);
  });

  it("during recursion, shows the whole tree and marks the running call's node", () => {
    show(deepest());
    const list = screen.getByRole("list", { name: /as text/i });
    expect(list.textContent).toMatch(/root in main program/);
    expect(list.textContent).toMatch(/\(running\)/);
  });

  it("has no accessibility violations", async () => {
    const { container } = show(deepest());
    await expectNoAxeViolations(container);
  });
});
