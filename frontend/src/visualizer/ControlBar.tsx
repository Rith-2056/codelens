import { useEffect, useId, useRef, useState } from "react";

export const SPEEDS = [
  { value: "0.5", label: "0.5×", ms: 1800 },
  { value: "1", label: "1×", ms: 900 },
  { value: "2", label: "2×", ms: 450 },
  { value: "4", label: "4×", ms: 225 },
] as const;

type Props = {
  index: number; // 0-based
  total: number;
  /** The shown step's line, for the slider's spoken value. */
  line: number;
  onIndexChange: (index: number, fromSlider?: boolean) => void;
  /** One short sentence about the current step. */
  description: string;
  /** Left/Right arrows anywhere step this bar (off when another bar owns them). */
  globalKeys?: boolean;
};

// Arrow keys must keep working normally while the student is typing.
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']") !== null
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="cb-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  restart: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
  prev: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  next: "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
};

// The Code Visualizer's control bar: Restart, Previous, Play/Pause, Next, a
// speed choice, a progress slider and one sentence about the current step.
// Play moves one step per tick and stops at the last step; stepping by hand
// pauses it. The end buttons stay focusable (aria-disabled) so focus is
// never lost at the first or last step.
export default function ControlBar({ index, total, line, onIndexChange, description, globalKeys = true }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["value"]>("1");
  const sliderId = useId();
  const speedId = useId();
  const last = Math.max(0, total - 1);
  const ms = SPEEDS.find((s) => s.value === speed)!.ms;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => onIndexChange(index + 1), ms);
    return () => window.clearTimeout(t);
  }, [playing, index, last, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  function goTo(n: number, fromSlider = false) {
    setPlaying(false);
    const target = Math.max(0, Math.min(last, n));
    if (target !== index) onIndexChange(target, fromSlider);
  }

  function togglePlay() {
    if (playing) return setPlaying(false);
    if (index >= last) onIndexChange(0);
    setPlaying(true);
  }

  // The window listener is added once and always calls the latest goTo.
  const stepBy = useRef((d: number) => goTo(index + d));
  stepBy.current = (d: number) => goTo(index + d);
  useEffect(() => {
    if (!globalKeys) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      stepBy.current(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [globalKeys]);

  return (
    <div className="control-bar" role="group" aria-label="Execution controls">
      <div className="cb-row">
        <div className="cb-buttons">
          <button type="button" className="cb-button" aria-label="Restart" onClick={() => goTo(0)}>
            <Icon d={ICONS.restart} />
          </button>
          <button type="button" className="cb-button" aria-label="Previous step" aria-disabled={index <= 0} aria-keyshortcuts="ArrowLeft" onClick={() => goTo(index - 1)}>
            <Icon d={ICONS.prev} />
          </button>
          <button type="button" className="cb-button cb-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
            <Icon d={playing ? ICONS.pause : ICONS.play} />
          </button>
          <button type="button" className="cb-button" aria-label="Next step" aria-disabled={index >= last} aria-keyshortcuts="ArrowRight" onClick={() => goTo(index + 1)}>
            <Icon d={ICONS.next} />
          </button>
        </div>
        <div className="cb-progress">
          <label htmlFor={sliderId} className="sr-only">
            Step
          </label>
          <input
            id={sliderId}
            className="cb-slider"
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            aria-valuetext={`Step ${index + 1} of ${total}, line ${line}`}
            onChange={(e) => goTo(Number(e.currentTarget.value), true)}
            style={{ ["--progress" as string]: `${last === 0 ? 100 : (index / last) * 100}%` }}
          />
        </div>
        <div className="cb-speed">
          <label htmlFor={speedId}>Speed</label>
          <select id={speedId} value={speed} onChange={(e) => setSpeed(e.currentTarget.value as typeof speed)}>
            {SPEEDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="cb-desc">
        <strong className="cb-count">{`Step ${index + 1} of ${total}`}</strong> <span>{description}</span>
      </p>
    </div>
  );
}
