// On wide screens the problem page is a workspace that fits the window:
// problem and step-through on the left, code and tests on the right, each
// panel scrolling on its own. (jsdom has no layout, so this reads the CSS;
// the browser check confirms it.)
import { expect, inject, it } from "vitest";

const css = inject("stylesCss");

it("the wide workspace puts problem and step-through left, code and tests right, in one screen", () => {
  const wide = /@media \(min-width: (\d+)px\) \{\s*\.workspace \{([^}]*)\}/.exec(css);
  expect(wide, "a min-width media query starting with .workspace").toBeTruthy();
  expect(Number(wide![1])).toBeLessThanOrEqual(1100);
  const rule = wide![2]!.replace(/\s+/g, " ");
  expect(rule).toMatch(/grid-template-areas: "problem code" "visual code" "visual tests"/);
  expect(rule).toMatch(/height: calc\(100dvh/);
});

it("each workspace panel scrolls on its own", () => {
  expect(css).toMatch(/\.workspace > \.panel \{[^}]*overflow: auto/);
});
