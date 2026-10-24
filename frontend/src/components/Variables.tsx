import type { JsonValue } from "../types/trace";
import { diffLocals, type Change } from "./stepInfo";
import { aliasesIn, summarizeChanges, viewKindOf } from "./structures";
import { diffValue } from "../explain/snapshot";
import { asPlaceholder, formatValue, placeholderLabel, type Heap } from "./values";

type Props = {
  current: Record<string, JsonValue>;
  previous: Record<string, JsonValue> | undefined;
  heap: Heap;
  prevHeap: Heap;
};

// Every value is readable text here (lists, dicts, sets, deques and objects
// included). The Data structures panel below draws the structures.
function Value({ value, heap, aliasOf }: { value: JsonValue; heap: Heap; aliasOf?: string }) {
  const p = asPlaceholder(value);
  if (p) return <span className="placeholder">{placeholderLabel(p)}</span>;
  return (
    <>
      <code className="value">{formatValue(value, heap)}</code>
      {aliasOf !== undefined && (
        <span className="alias-note">
          {" "}
          (same object as <code>{aliasOf}</code>)
        </span>
      )}
    </>
  );
}

function ChangeMarker({ change, value, heap, prevHeap }: { change: Change; value: JsonValue; heap: Heap; prevHeap: Heap }) {
  if (change.kind === "new") {
    return <span className="marker marker-new">new</span>;
  }
  if (change.kind === "changed") {
    // Inside a structure, name what changed rather than repeating the whole value.
    const view = viewKindOf(value);
    const inner = view !== null && view !== "ref" ? diffValue(change.before, value) : [];
    if (view !== null && inner.length > 0) {
      const text = summarizeChanges(inner, view, heap);
      const spoken = summarizeChanges(inner, view, heap, true);
      return (
        <span className="marker marker-changed">
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{spoken}</span>
        </span>
      );
    }
    const before = formatValue(change.before, prevHeap);
    const after = formatValue(value, heap);
    return (
      <span className="marker marker-changed">
        <span aria-hidden="true">
          {before} → {after}
        </span>
        <span className="sr-only">
          changed from {before} to {after}
        </span>
      </span>
    );
  }
  return <span className="sr-only">no change</span>;
}

export default function Variables({ current, previous, heap, prevHeap }: Props) {
  const rows = diffLocals(current, previous);
  if (rows.length === 0) {
    return <p className="empty">No variables yet.</p>;
  }
  const aliases = aliasesIn(current);
  return (
    <table className="vars">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className={`row-${row.change.kind}`}>
            <th scope="row">
              <code>{row.name}</code>
            </th>
            <td>
              <Value value={row.value} heap={heap} aliasOf={aliases.get(row.name)} />
            </td>
            <td>
              <ChangeMarker change={row.change} value={row.value} heap={heap} prevHeap={prevHeap} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
