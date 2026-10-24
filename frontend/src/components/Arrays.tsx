import type { JsonValue } from "../types/trace";
import type { Change } from "../explain/snapshot";
import { describeChange, lineUses, pointersFor } from "./structures";
import { formatValue, plural, type Heap } from "./values";

type Props = {
  name: string;
  items: JsonValue[];
  locals: Record<string, JsonValue>; // the same frame's locals, for pointers
  changes: Change[];
  heap: Heap;
  line: string; // the highlighted line's code, for "next line uses it"
};

// A list shown as indexed cells: the index above, the value inside, change
// text under a changed cell, and pointer arrows (left, right, i, ...) under the
// cell they point at. Wide lists scroll inside their own box.
export default function Arrays({ name, items, locals, changes, heap, line }: Props) {
  if (items.length === 0) {
    return (
      <p className="ds-empty">
        <code>[]</code> (empty list)
        {changes.length > 0 && <RemovedNote name={name} changes={changes} heap={heap} />}
      </p>
    );
  }
  const pointers = pointersFor(items.length, locals);
  const cellChange = new Map<number, Extract<Change, { kind: "changed" }> | "added">();
  for (const c of changes) {
    if (c.kind === "changed" && typeof c.key === "number") cellChange.set(c.key, c);
    else if (c.kind === "added" && typeof c.key === "number") cellChange.set(c.key, "added");
  }
  return (
    <>
      <div className="scroll-x">
        <ol className="cells cells-row" aria-label={`${name}: list with ${plural(items.length, "item", "items")}`}>
          {items.map((item, i) => {
            const change = cellChange.get(i);
            const names = pointers[i] ?? [];
            return (
              <li key={i} className={`cell${change ? " cell-changed" : ""}${names.length ? " cell-pointed" : ""}`}>
                <span className="cell-index">
                  <span className="sr-only">index </span>
                  {i}
                </span>
                <span className="cell-value">
                  <span className="sr-only">value </span>
                  {formatValue(item, heap)}
                </span>
                {change && (
                  <span className="marker marker-changed cell-marker">
                    {change === "added" ? (
                      "added"
                    ) : (
                      <>
                        <span aria-hidden="true">
                          {formatValue(change.before, heap)} → {formatValue(change.after, heap)}
                        </span>
                        <span className="sr-only">
                          changed from {formatValue(change.before, heap)} to {formatValue(change.after, heap)}
                        </span>
                      </>
                    )}
                  </span>
                )}
                {names.map((p) => (
                  <span key={p} className="pointer">
                    <span aria-hidden="true">↑ </span>
                    <span className="sr-only">pointer </span>
                    <code>{p}</code>
                    {lineUses(line, p) && <span className="pointer-note"> used by next line</span>}
                  </span>
                ))}
              </li>
            );
          })}
        </ol>
      </div>
      <RemovedNote name={name} changes={changes} heap={heap} />
    </>
  );
}

function RemovedNote({ name, changes, heap }: { name: string; changes: Change[]; heap: Heap }) {
  const removed = changes.filter((c) => c.kind === "removed");
  if (removed.length === 0) return null;
  return (
    <p className="ds-note">
      <span className="sr-only">{name}: </span>
      {removed.map((c, i) => (
        <span key={i} className="marker marker-removed">
          {describeChange(c, "array", heap)}
        </span>
      ))}
    </p>
  );
}
