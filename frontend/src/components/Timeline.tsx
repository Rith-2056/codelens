import { useEffect, useRef } from "react";

// The end buttons use aria-disabled rather than the disabled attribute: a
// disabled button drops keyboard focus to <body>, which strands keyboard and
// screen-reader users at the first or last step. aria-disabled is announced
// as unavailable, keeps focus where it is, and goTo() ignores the press.

type Props = {
  index: number; // 0-based
  total: number;
  onIndexChange: (index: number) => void;
};

// Arrow keys must keep working normally while the student is typing.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
    ) !== null
  );
}

// Previous / Next over the stored trace. Stepping back only changes which
// recorded step is shown; nothing is re-run.
export default function Timeline({ index, total, onIndexChange }: Props) {
  const last = total - 1;
  const atStart = index <= 0;
  const atEnd = index >= last;

  function goTo(target: number) {
    if (target < 0 || target > last || target === index) return;
    onIndexChange(target);
  }

  // The window listener is added once and always calls the latest stepBy.
  const stepByRef = useRef((delta: number) => goTo(index + delta));
  stepByRef.current = (delta: number) => goTo(index + delta);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      stepByRef.current(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="timeline" role="group" aria-label="Step through the program">
      <button
        type="button"
        className="step-button"
        onClick={() => goTo(index - 1)}
        aria-disabled={atStart}
        aria-keyshortcuts="ArrowLeft"
      >
        <span aria-hidden="true">← </span>Previous
      </button>
      <p className="step-count">
        Step <strong>{total === 0 ? 0 : index + 1}</strong> of {total}
      </p>
      <button
        type="button"
        className="step-button"
        onClick={() => goTo(index + 1)}
        aria-disabled={atEnd}
        aria-keyshortcuts="ArrowRight"
      >
        Next<span aria-hidden="true"> →</span>
      </button>
    </div>
  );
}
