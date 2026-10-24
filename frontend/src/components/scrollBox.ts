// Props for a box that may scroll sideways on narrow screens. tabIndex 0 lets
// keyboard users focus it and scroll with the arrow keys (Safari and axe need
// this), and the region label says what the box holds.
export function scrollBox(label: string) {
  return { tabIndex: 0, role: "region", "aria-label": label } as const;
}
