import type { CSSProperties } from "react";
import type { JsonValue } from "../types/trace";
import type { Change } from "../explain/snapshot";
import { scrollBox } from "../components/scrollBox";
import { formatValue, plural, type Heap } from "../components/values";

export type PointerRole = "low" | "mid" | "high" | "plain";

type Props = {
  name: string;
  items: JsonValue[];
  heap: Heap;
  /** Index variables to draw above their cells, in reading order. */
  pointers: { name: string; index: number; role: PointerRole }[];
  /** Changes to this list since the frame's previous step. */
  changes: Change[];
  /** Cells the line that just ran read or wrote. */
  accessed: number[];
  /** Binary search: the part still searched; cells outside are ruled out. */
  range?: { lo: number; hi: number } | null;
  /** Sliding window: the cells inside the window, and its label. */
  window?: { from: number; to: number; label: string } | null;
};

// A list drawn large: one box per item with its index, pointer labels
// (`left = 3`) floating above their cell and gliding when they move, the
// written cell filled, cells read outlined, ruled-out cells faded, and the
// sliding window as a band. Every state is also written out in text for
// screen readers (and is what the tests read).
export default function ArrayStage({ name, items, heap, pointers, changes, accessed, range, window }: Props) {
  const written = new Map<number, Change>();
  for (const c of changes) if ((c.kind === "changed" || c.kind === "added") && typeof c.key === "number") written.set(c.key, c);
  const stacks = new Map<number, number>(); // pointers already drawn above a cell
  const placed = pointers.map((p) => {
    const row = stacks.get(p.index) ?? 0;
    stacks.set(p.index, row + 1);
    return { ...p, row };
  });
  const rows = Math.max(1, ...stacks.values());

  return (
    <figure className="stage-array" style={{ ["--rows" as string]: rows } as CSSProperties}>
      <figcaption className="stage-caption">
        <code>{name}</code> <span>list · {plural(items.length, "item", "items")}</span>
        {window && <span className="stage-chip stage-chip-window">{window.label}</span>}
        {range && (
          <span className="stage-chip">{range.lo <= range.hi ? `searching ${range.lo} to ${range.hi}` : "nothing left to search"}</span>
        )}
      </figcaption>
      <div className="sa-scroll" {...scrollBox(`${name} cells`)}>
        <div className="sa-track" style={{ ["--n" as string]: items.length } as CSSProperties}>
          <div className="sa-pointers" aria-hidden="true">
            {placed.map((p) => (
              <span
                key={p.name}
                className={`sa-ptr sa-ptr-${p.role}`}
                style={{ ["--i" as string]: p.index, ["--row" as string]: p.row } as CSSProperties}
              >
                {p.name} = {p.index}
              </span>
            ))}
          </div>
          {window && window.from <= window.to && (
            <div
              className="sa-window"
              aria-hidden="true"
              style={{ ["--from" as string]: window.from, ["--to" as string]: window.to } as CSSProperties}
            />
          )}
          <ol className="sa-cells" aria-label={`${name}: list with ${plural(items.length, "item", "items")}`}>
            {items.map((item, i) => {
              const change = written.get(i);
              const read = !change && accessed.includes(i);
              const out = range ? i < range.lo || i > range.hi : false;
              const inWindow = window ? i >= window.from && i <= window.to : false;
              const here = placed.filter((p) => p.index === i);
              const cls = [
                "sa-cell",
                change ? "sa-written" : "",
                read ? "sa-read" : "",
                out ? "sa-out" : "",
                inWindow ? "sa-in-window" : "",
                here.some((p) => p.role === "mid") ? "sa-at-mid" : "",
              ].join(" ");
              return (
                <li key={i} className={cls.trim().replace(/\s+/g, " ")}>
                  <span className="sa-index">
                    <span className="sr-only">index </span>
                    {i}
                  </span>
                  <span className="sa-value">
                    <span className="sr-only">value </span>
                    {formatValue(item, heap)}
                  </span>
                  {change && (
                    <span className="sa-note">
                      {change.kind === "changed" ? (
                        <>
                          <span className="sr-only">
                            just written, changed from {formatValue(change.before, heap)} to {formatValue(change.after, heap)};
                          </span>
                          <span aria-hidden="true">
                            {formatValue(change.before, heap)} → {formatValue(change.after, heap)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="sr-only">just written, </span>added
                        </>
                      )}
                    </span>
                  )}
                  <span className="sr-only">
                    {here.map((p) => ` pointer ${p.name} = ${p.index};`).join("")}
                    {read ? " read by the line that just ran;" : ""}
                    {out ? " ruled out;" : ""}
                    {inWindow ? " in window;" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </figure>
  );
}
