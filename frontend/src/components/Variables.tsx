import type { JsonValue } from "../types/trace";
import Arrays from "./Arrays";
import { diffLocals, type Change } from "./stepInfo";
import { asPlaceholder, formatValue, placeholderLabel } from "./values";

type Props = {
  current: Record<string, JsonValue>;
  previous: Record<string, JsonValue> | undefined;
};

function Value({ name, value }: { name: string; value: JsonValue }) {
  if (Array.isArray(value)) return <Arrays name={name} items={value} />;
  const p = asPlaceholder(value);
  if (p) return <span className="placeholder">{placeholderLabel(p)}</span>;
  return <code className="value">{formatValue(value)}</code>;
}

function ChangeMarker({ change, value }: { change: Change; value: JsonValue }) {
  if (change.kind === "new") {
    return <span className="marker marker-new">new</span>;
  }
  if (change.kind === "changed") {
    const before = formatValue(change.before);
    const after = formatValue(value);
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

export default function Variables({ current, previous }: Props) {
  const rows = diffLocals(current, previous);
  if (rows.length === 0) {
    return <p className="empty">No variables yet.</p>;
  }
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
              <Value name={row.name} value={row.value} />
            </td>
            <td>
              <ChangeMarker change={row.change} value={row.value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
