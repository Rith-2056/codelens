// The glass look puts translucent panels over a gradient, which axe cannot
// measure ("needs review"). This test does the math instead: every text color
// must reach WCAG AA (4.5:1) against every gradient color, both directly on
// the page and through a glass panel, in light and dark mode.
import { describe, expect, inject, it } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    stylesCss: string;
  }
}

// Vitest blanks CSS imports, so the stylesheet text comes from test/acceptance-traces.mjs.
const css = inject("stylesCss");

type RGB = [number, number, number];

function block(selectorStart: number): string {
  const open = css.indexOf("{", selectorStart);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced CSS");
}

function tokens(scope: "light" | "dark"): Record<string, string> {
  const at = scope === "light" ? css.indexOf(":root {") : css.indexOf(":root", css.indexOf("@media (prefers-color-scheme: dark)"));
  const body = block(at);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function parseColor(c: string): { rgb: RGB; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const rgba = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(c);
  if (rgba) return { rgb: [+rgba[1]!, +rgba[2]!, +rgba[3]!], a: rgba[4] === undefined ? 1 : +rgba[4] };
  throw new Error(`cannot parse color ${c}`);
}

const blend = (top: { rgb: RGB; a: number }, under: RGB): RGB =>
  top.rgb.map((v, i) => v * top.a + under[i]! * (1 - top.a)) as RGB;

function luminance([r, g, b]: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

for (const scope of ["light", "dark"] as const) {
  describe(`${scope} theme contrast`, () => {
    const t = tokens(scope);
    const stops = [...(t["page-bg"] ?? "").matchAll(/#[0-9a-f]{6}/gi)].map((m) => parseColor(m[0]).rgb);
    const glass = parseColor(t["glass-bg"]!);
    const texts = ["fg", "muted", "accent", "easy", "medium", "hard"];

    it("has gradient stops to check", () => {
      expect(stops.length).toBeGreaterThanOrEqual(4);
    });

    it.each(texts)("--%s reaches 4.5:1 on the page and on glass", (name) => {
      const fg = parseColor(t[name]!).rgb;
      for (const stop of stops) {
        expect(contrast(fg, stop), `${name} on page ${stop}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(fg, blend(glass, stop)), `${name} on glass over ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("the current nav link (accent-fg on accent) reaches 4.5:1", () => {
      expect(contrast(parseColor(t["accent-fg"]!).rgb, parseColor(t["accent"]!).rgb)).toBeGreaterThanOrEqual(4.5);
    });

    it("visualizer pointer labels (mid in lavender, others in blue) reach 4.5:1", () => {
      expect(contrast(parseColor(t["ptr-mid-fg"]!).rgb, parseColor(t["ptr-mid-bg"]!).rgb)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseColor(t["button-fg"]!).rgb, parseColor(t["button-bg"]!).rgb)).toBeGreaterThanOrEqual(4.5);
      const h = hue(parseColor(t["window-edge"]!).rgb);
      expect(h).toBeGreaterThanOrEqual(250); // the sliding window is lavender
      expect(h).toBeLessThanOrEqual(290);
    });

    it("filled buttons (button-fg on button-bg) and line labels (label-fg on label-bg) reach 4.5:1", () => {
      expect(contrast(parseColor(t["button-fg"]!).rgb, parseColor(t["button-bg"]!).rgb)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseColor(t["label-fg"]!).rgb, parseColor(t["label-bg"]!).rgb)).toBeGreaterThanOrEqual(4.5);
    });

    // Python syntax colors: keywords purple, strings green, and so on. Each
    // must stay readable on the code background and on the highlighted line.
    const syntax = ["fg", "muted", "syn-keyword", "syn-function", "syn-class", "syn-builtin", "syn-constant", "syn-self", "syn-string", "syn-number", "syn-comment"];
    it.each(syntax)("--%s reaches 4.5:1 on the code background and the current line", (name) => {
      const code = parseColor(t["code-bg"]!).rgb;
      const fg = parseColor(t[name]!).rgb;
      expect(contrast(fg, code), `${name} on code`).toBeGreaterThanOrEqual(4.5);
      for (const line of ["line-current-bg", "line-error-bg"]) {
        expect(contrast(fg, blend(parseColor(t[line]!), code)), `${name} on ${line}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("keywords are purple", () => {
      expect(hue(parseColor(t["syn-keyword"]!).rgb)).toBeGreaterThanOrEqual(255);
      expect(hue(parseColor(t["syn-keyword"]!).rgb)).toBeLessThanOrEqual(300);
    });

    it("the next line to run is marked in blue, not yellow", () => {
      for (const name of ["line-current-edge", "label-bg", "frame-current-edge"]) {
        const h = hue(parseColor(t[name]!).rgb);
        expect(h, name).toBeGreaterThanOrEqual(200);
        expect(h, name).toBeLessThanOrEqual(240);
      }
    });
  });
}

function hue([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("fonts", () => {
  it("uses Inter for text and JetBrains Mono for code, with system fallbacks", () => {
    expect(css).toMatch(/--sans: "Inter Variable", [^;]*system-ui/);
    expect(css).toMatch(/--mono: "JetBrains Mono Variable", [^;]*monospace/);
  });
});
