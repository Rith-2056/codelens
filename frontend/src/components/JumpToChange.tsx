import { useState, useId } from "react";
import type { TraceStep } from "../types/trace";
import { findChange } from "./jump";

type Props = {
  steps: readonly TraceStep[];
  index: number;
  names: string[]; // every variable name in the trace
  onJump: (index: number) => void;
};

// "Jump to the next / previous change of <variable>". Mount it with a key per
// trace so the chosen variable resets when a different trace is shown.
export default function JumpToChange({ steps, index, names, onJump }: Props) {
  const [name, setName] = useState(names[0] ?? "");
  const labelId = useId(); // unique: a page can show two runs side by side
  const selectId = useId();
  const [message, setMessage] = useState<{ at: number; text: string } | null>(null);
  if (names.length === 0) return null;
  const chosen = names.includes(name) ? name : names[0]!;

  function jump(dir: 1 | -1) {
    const target = findChange(steps, index, chosen, dir);
    if (target < 0) {
      setMessage({ at: index, text: dir === 1 ? `No later change of ${chosen}.` : `No earlier change of ${chosen}.` });
      return;
    }
    setMessage({ at: target, text: `Step ${target + 1}: ${chosen} changes here.` });
    onJump(target);
  }

  return (
    <div className="jump" role="group" aria-labelledby={labelId}>
      <label id={labelId} htmlFor={selectId} className="jump-label">
        Jump to a change of
      </label>
      <select
        id={selectId}
        className="jump-select"
        value={chosen}
        onChange={(e) => {
          setName(e.currentTarget.value);
          setMessage(null);
        }}
      >
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <div className="jump-buttons">
        <button type="button" className="tool-button" onClick={() => jump(-1)}>
          <span aria-hidden="true">← </span>Previous change
        </button>
        <button type="button" className="tool-button" onClick={() => jump(1)}>
          Next change<span aria-hidden="true"> →</span>
        </button>
      </div>
      <p className="jump-message" role="status">
        {message && message.at === index ? message.text : ""}
      </p>
    </div>
  );
}
