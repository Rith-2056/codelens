import type { JsonValue } from "../types/trace";
import { formatValue } from "./values";

type Props = { name: string; items: JsonValue[] };

// A list shown as indexed cells: the index above, the value inside.
export default function Arrays({ name, items }: Props) {
  if (items.length === 0) {
    return <code className="value">[] (empty list)</code>;
  }
  const count = items.length === 1 ? "1 item" : `${items.length} items`;
  return (
    <ol className="cells" aria-label={`${name}: list with ${count}`}>
      {items.map((item, i) => (
        <li key={i} className="cell">
          <span className="cell-index">
            <span className="sr-only">index </span>
            {i}
          </span>
          <span className="cell-value">
            <span className="sr-only">value </span>
            {formatValue(item)}
          </span>
        </li>
      ))}
    </ol>
  );
}
