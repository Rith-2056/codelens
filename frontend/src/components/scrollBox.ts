// Props for a box that may scroll sideways on narrow screens. tabIndex 0 lets
// keyboard users focus it and scroll with the arrow keys (Safari and axe need
// this), and the label says what the box holds. It is a labeled group, not a
// landmark region: a page can show two runs side by side, and duplicate
// landmarks ("Program code" twice) would confuse landmark navigation.
export function scrollBox(label: string) {
  return { tabIndex: 0, role: "group", "aria-label": label } as const;
}
