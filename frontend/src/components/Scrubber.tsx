import { useId } from "react";

type Props = {
  index: number; // 0-based
  total: number;
  line: number; // the shown step's line
  onScrub: (index: number) => void;
};

// A slider over every recorded step, for long traces (up to 2000 steps).
// Arrow keys move one step, Page Up / Page Down move further, Home / End go to
// the ends (all native to <input type="range">). The Narrator waits until the
// slider settles before it speaks, so dragging does not flood screen readers.
export default function Scrubber({ index, total, line, onScrub }: Props) {
  const id = useId(); // unique: a page can show two runs side by side
  if (total <= 1) return null;
  return (
    <div className="scrubber">
      <label htmlFor={id} className="scrubber-label">
        Go to step
      </label>
      <input
        id={id}
        className="scrubber-input"
        type="range"
        min={0}
        max={total - 1}
        step={1}
        value={index}
        aria-valuetext={`Step ${index + 1} of ${total}, line ${line}`}
        onChange={(e) => onScrub(Number(e.currentTarget.value))}
      />
      <span className="scrubber-ends" aria-hidden="true">
        <span>1</span>
        <span>{total}</span>
      </span>
    </div>
  );
}
