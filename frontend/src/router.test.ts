import { describe, expect, it } from "vitest";
import { hrefFor, parseRoute, type Route } from "./router";

describe("parseRoute", () => {
  it("reads the home page from an empty or bare hash", () => {
    for (const hash of ["", "#", "#/"]) expect(parseRoute(hash)).toEqual({ page: "home" });
  });

  it("reads the problem list, one problem, and the playground", () => {
    expect(parseRoute("#/problems")).toEqual({ page: "problems" });
    expect(parseRoute("#/problems/")).toEqual({ page: "problems" });
    expect(parseRoute("#/problems/two-sum")).toEqual({ page: "problem", slug: "two-sum" });
    expect(parseRoute("#/playground")).toEqual({ page: "playground" });
  });

  it("treats anything else as not found, keeping the path", () => {
    expect(parseRoute("#/nope")).toEqual({ page: "notFound", path: "/nope" });
    expect(parseRoute("#/problems/a/b")).toEqual({ page: "notFound", path: "/problems/a/b" });
  });
});

describe("hrefFor", () => {
  it("round-trips every page", () => {
    const routes: Route[] = [
      { page: "home" },
      { page: "problems" },
      { page: "problem", slug: "climbing-stairs" },
      { page: "playground" },
    ];
    for (const r of routes) expect(parseRoute(hrefFor(r))).toEqual(r);
  });
});
