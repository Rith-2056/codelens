import { useId } from "react";
import type { TraceStep } from "../types/trace";
import { aliasesIn, framesOf, frameTitle } from "./structures";
import { formatValue, type Heap } from "./values";

// Frames past this many are summarized, so very deep recursion stays fast.
const MAX_CARDS = 30;

type Props = { step: TraceStep };

// One card per active frame. The current frame (the last stack entry) is on
// top and labeled "running now" in text; calling frames below it are
// "waiting" for the call they made. The list itself is the text alternative.
export default function CallStack({ step }: Props) {
  const heap: Heap = step.heap ?? {};
  const frames = framesOf(step);
  const topFirst = frames.slice().reverse();
  const shown = topFirst.slice(0, MAX_CARDS);
  const hidden = topFirst.length - shown.length;
  const headingId = useId(); // unique: a page can show two runs side by side
  return (
    <div className="call-stack" role="group" aria-labelledby={headingId}>
      <h3 className="subheading" id={headingId}>
        Call stack
      </h3>
      <p className="hint stack-hint">
        {frames.length === 1
          ? "Only the main program is running."
          : `${frames.length} calls are active. The newest is on top; the main program is at the bottom.`}
      </p>
      <ol className="stack" aria-label="Call stack, newest call first">
        {shown.map((frame, i) => {
          const current = i === 0;
          const names = Object.keys(frame.locals);
          const aliases = aliasesIn(frame.locals);
          return (
            <li key={frame.frameId + ":" + i} className={`frame${current ? " frame-current" : ""}`}>
              <p className="frame-title">
                <code>{frameTitle(frame.functionName)}</code>
                {current ? (
                  <span className="marker frame-status">running now</span>
                ) : (
                  <span className="frame-wait">waiting at line {frame.line}</span>
                )}
                {current && step.event === "call" && <span className="marker marker-new">just called</span>}
                {current && step.event === "return" && step.returnValue !== undefined && frames.length > 1 && (
                  <span className="marker marker-changed">returning {formatValue(step.returnValue, heap)}</span>
                )}
              </p>
              {names.length === 0 ? (
                <p className="empty frame-empty">No variables here.</p>
              ) : (
                <ul className="frame-locals">
                  {names.map((n) => (
                    <li key={n}>
                      <code>
                        {n} = {formatValue(frame.locals[n] ?? null, heap)}
                      </code>
                      {aliases.has(n) && (
                        <span className="frame-alias">
                          {" "}
                          (same object as <code>{aliases.get(n)}</code>)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {hidden > 0 && <li className="frame frame-more">…and {hidden} more calls below, ending with the main program.</li>}
      </ol>
    </div>
  );
}
