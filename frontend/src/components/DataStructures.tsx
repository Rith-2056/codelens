import { useId } from "react";
import type { HeapObject, JsonValue, StackFrame } from "../types/trace";
import { scrollBox } from "./scrollBox";
import { dictEntries, itemsOf, resolveRef, sameValue, type Change } from "../explain/snapshot";
import Arrays from "./Arrays";
import { GraphView, TreeView } from "./GraphTreeViews";
import { graphOf, isTreeNodeRef, treeBadges, treesIn } from "./graphTree";
import type { StructureItem } from "./structures";
import { formatValue, kindLabel, objectShort, plural, type Heap } from "./values";

type KeyChange = Extract<Change, { kind: "added" | "removed" }>;

type Props = {
  items: StructureItem[];
  locals: Record<string, JsonValue>;
  heap: Heap;
  line: string; // the highlighted line's code
  /** Every active frame, outermost first (current last); used to draw trees and their badges. */
  frames?: StackFrame[];
};

// The Data structures panel: one visualizer per local whose value is a list,
// 2D list, dict, set, deque, or object, chosen from the value's shape. Every
// change is marked with text ("added", "removed", old → new, "front", "back").
// An adjacency dict is drawn as a graph; TreeNode-like objects are drawn as one
// tree per distinct root, found across all frames so recursion shows the whole
// tree with each call's variable marked on its node.
export default function DataStructures({ items, locals, heap, line, frames = [] }: Props) {
  const trees = treesIn(frames, heap);
  const shown = trees.length ? items.filter((it) => !(it.view === "ref" && isTreeNodeRef(it.value, heap))) : items;
  if (shown.length === 0 && trees.length === 0) return null;
  const badges = trees.length ? treeBadges(frames, heap) : new Map<string, string[]>();
  const headingId = useId(); // unique: a page can show two runs side by side
  return (
    <div className="ds" role="group" aria-labelledby={headingId}>
      <h3 className="subheading" id={headingId}>
        Data structures
      </h3>
      <ul className="ds-list">
        {trees.map((t) => (
          <li key={`tree-${t.root.id}`} className="ds-card">
            <p className="ds-title">
              <code className="ds-name">{t.name}</code>
              <span className="ds-kind">tree{t.where !== "main program" || frames.length > 1 ? `, from ${t.where}` : ""}</span>
            </p>
            <TreeView name={t.name} where={t.where} root={t.root} badges={badges} />
          </li>
        ))}
        {shown.map((item) => (
          <li key={item.name} className="ds-card">
            <p className="ds-title">
              <code className="ds-name">{item.name}</code>
              <span className="ds-kind">{item.view === "dict" && graphOf(item.value) ? "graph (adjacency dict)" : kindLabel(item.value)}</span>
              {item.isNew && <span className="marker marker-new">new</span>}
              {item.replaced && <span className="marker marker-changed">new value</span>}
            </p>
            <Body item={item} locals={locals} heap={heap} line={line} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ item, locals, heap, line }: { item: StructureItem; locals: Record<string, JsonValue>; heap: Heap; line: string }) {
  const { value, changes, name } = item;
  switch (item.view) {
    case "array":
      return <Arrays name={name} items={value as JsonValue[]} locals={locals} changes={changes} heap={heap} line={line} />;
    case "grid":
      return <Grid name={name} rows={value as JsonValue[][]} changes={changes} heap={heap} />;
    case "dict": {
      const graph = graphOf(value);
      if (graph) return <GraphView name={name} graph={graph} value={value} locals={locals} />;
      return <HashMap name={name} value={value} changes={changes} heap={heap} />;
    }
    case "set":
      return <SetChips name={name} items={itemsOf(value)} changes={changes} heap={heap} />;
    case "deque":
      return <Queue name={name} items={itemsOf(value)} changes={changes} heap={heap} />;
    case "ref":
      if (item.aliasOf !== undefined) {
        return (
          <p className="ds-note">
            Same object as <code>{item.aliasOf}</code>: {formatValue(value, heap)}
          </p>
        );
      }
      return <ObjectCard obj={resolveRef(value, heap)} heap={heap} />;
  }
}

function FromTo({ before, after, heap }: { before: JsonValue; after: JsonValue; heap: Heap }) {
  const a = formatValue(before, heap);
  const b = formatValue(after, heap);
  return (
    <span className="marker marker-changed">
      <span aria-hidden="true">
        {a} → {b}
      </span>
      <span className="sr-only">
        changed from {a} to {b}
      </span>
    </span>
  );
}

// ---- Hash map ---------------------------------------------------------------

function HashMap({ name, value, changes, heap }: { name: string; value: JsonValue; changes: Change[]; heap: Heap }) {
  const entries = dictEntries(value);
  const removed = changes.filter((c): c is KeyChange => c.kind === "removed");
  if (entries.length === 0 && removed.length === 0) {
    return (
      <p className="ds-empty">
        <code>{"{}"}</code> (empty, no keys yet)
      </p>
    );
  }
  const changeFor = (k: JsonValue) =>
    changes.find((c) => (c.kind === "added" || c.kind === "changed") && sameValue(c.key, k));
  return (
    <div className="scroll-x" {...scrollBox(`${name}: keys and values`)}>
      <table className="ds-table">
        <caption className="sr-only">
          {name}: hash map with {plural(entries.length, "key", "keys")}
        </caption>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col" aria-hidden="true"></th>
            <th scope="col">Value</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v], i) => {
            const c = changeFor(k);
            return (
              <tr key={i} className={c ? "row-changed" : undefined}>
                <th scope="row">
                  <code>{formatValue(k, heap)}</code>
                </th>
                <td aria-hidden="true">→</td>
                <td>
                  <code>{formatValue(v, heap)}</code>
                </td>
                <td>
                  {c?.kind === "added" && <span className="marker marker-new">added</span>}
                  {c?.kind === "changed" && <FromTo before={c.before} after={c.after} heap={heap} />}
                </td>
              </tr>
            );
          })}
          {removed.map((c, i) => (
            <tr key={`removed-${i}`} className="row-removed">
              <th scope="row">
                <code className="removed-text">{formatValue(c.key, heap)}</code>
              </th>
              <td aria-hidden="true">→</td>
              <td>
                <code className="removed-text">{c.value === undefined ? "" : formatValue(c.value, heap)}</code>
              </td>
              <td>
                <span className="marker marker-removed">removed</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Set ---------------------------------------------------------------------

function SetChips({ name, items, changes, heap }: { name: string; items: JsonValue[]; changes: Change[]; heap: Heap }) {
  const added = (x: JsonValue) => changes.some((c) => c.kind === "added" && sameValue(c.key, x));
  const removed = changes.filter((c): c is KeyChange => c.kind === "removed");
  if (items.length === 0 && removed.length === 0) {
    return (
      <p className="ds-empty">
        <code>set()</code> (empty set)
      </p>
    );
  }
  return (
    <ul className="chips" aria-label={`${name}: set with ${plural(items.length, "item", "items")}`}>
      {items.map((x, i) => (
        <li key={i} className={`chip${added(x) ? " chip-added" : ""}`}>
          <code>{formatValue(x, heap)}</code>
          {added(x) && <span className="marker marker-new">added</span>}
        </li>
      ))}
      {removed.map((c, i) => (
        <li key={`removed-${i}`} className="chip chip-removed">
          <code className="removed-text">{formatValue(c.key, heap)}</code>
          <span className="marker marker-removed">removed</span>
        </li>
      ))}
    </ul>
  );
}

// ---- Queue (deque) -------------------------------------------------------------

function Queue({ name, items, changes, heap }: { name: string; items: JsonValue[]; changes: Change[]; heap: Heap }) {
  const count = (kind: "pushed" | "popped", end: "front" | "back") =>
    changes.filter((c) => c.kind === kind && c.end === end);
  const pushedFront = count("pushed", "front").length;
  const pushedBack = count("pushed", "back").length;
  const poppedFront = count("popped", "front");
  const poppedBack = count("popped", "back");
  const ghost = (c: Change, i: number, where: "front" | "back") => (
    <li key={`${where}-${i}`} className="q-cell q-ghost">
      <span className="q-end">&nbsp;</span>
      <code className="cell-value removed-text">{c.kind === "popped" ? formatValue(c.value, heap) : ""}</code>
      <span className="marker marker-removed">removed from {where}</span>
    </li>
  );
  return (
    <div className="scroll-x" {...scrollBox(`${name}: queue`)}>
      {items.length === 0 && <p className="ds-empty">The queue is empty.</p>}
      <ol className="queue" aria-label={`${name}: queue with ${plural(items.length, "item", "items")}, front first`}>
        {poppedFront.map((c, i) => ghost(c, i, "front"))}
        {items.map((x, i) => {
          const isFront = i === 0;
          const isBack = i === items.length - 1;
          const addedFront = i < pushedFront;
          const addedBack = i >= items.length - pushedBack;
          return (
            <li key={i} className={`q-cell${addedFront || addedBack ? " q-added" : ""}`}>
              <span className="q-end">
                {isFront && isBack ? "front and back" : isFront ? "front" : isBack ? "back" : " "}
              </span>
              <code className="cell-value">{formatValue(x, heap)}</code>
              {addedBack && <span className="marker marker-new">added at back</span>}
              {addedFront && !addedBack && <span className="marker marker-new">added at front</span>}
            </li>
          );
        })}
        {poppedBack.map((c, i) => ghost(c, i, "back"))}
      </ol>
    </div>
  );
}

// ---- Grid (2D list) --------------------------------------------------------------

function Grid({ name, rows, changes, heap }: { name: string; rows: JsonValue[][]; changes: Change[]; heap: Heap }) {
  const cols = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const cellChange = new Map<string, Extract<Change, { kind: "changed" }>>();
  const rowNote = new Map<number, string>();
  for (const c of changes) {
    if (c.kind === "changed" && Array.isArray(c.key)) cellChange.set(`${String(c.key[0])},${String(c.key[1])}`, c);
    else if (c.kind === "changed" && typeof c.key === "number") rowNote.set(c.key, "row changed");
    else if (c.kind === "added" && typeof c.key === "number") rowNote.set(c.key, "row added");
  }
  const removedRows = changes.filter((c) => c.kind === "removed").length;
  return (
    <>
      <div className="scroll-x" {...scrollBox(`${name}: table`)}>
        <table className="ds-table grid">
          <caption className="sr-only">
            {name}: table with {plural(rows.length, "row", "rows")} and {plural(cols, "column", "columns")}
          </caption>
          <thead>
            <tr>
              <td className="grid-corner">
                <span className="sr-only">row index</span>
              </td>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} scope="col">
                  <span className="sr-only">column </span>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th scope="row">
                  <span className="sr-only">row </span>
                  {r}
                  {rowNote.has(r) && <span className="marker marker-changed grid-row-note">{rowNote.get(r)}</span>}
                </th>
                {Array.from({ length: cols }, (_, c) => {
                  const ch = cellChange.get(`${r},${c}`);
                  const has = Array.isArray(row) && c < row.length;
                  return (
                    <td key={c} className={ch ? "cell-changed" : undefined}>
                      {has ? <code>{formatValue(row[c] ?? null, heap)}</code> : <span className="sr-only">no item</span>}
                      {ch && (
                        <>
                          {" "}
                          <FromTo before={ch.before} after={ch.after} heap={heap} />
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {removedRows > 0 && (
        <p className="ds-note">
          <span className="marker marker-removed">{plural(removedRows, "row removed", "rows removed")}</span>
        </p>
      )}
    </>
  );
}

// ---- Object (heap fallback) -------------------------------------------------------

function ObjectCard({ obj, heap }: { obj: HeapObject | undefined; heap: Heap }) {
  if (!obj) return <p className="ds-empty">This object could not be shown.</p>;
  const names = Object.keys(obj.fields ?? {});
  return (
    <div className="scroll-x" {...scrollBox(objectShort(obj))}>
      <table className="ds-table">
        <caption className="ds-caption">{objectShort(obj)}</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {names.length === 0 && (
            <tr>
              <td colSpan={2}>No fields.</td>
            </tr>
          )}
          {names.map((f) => (
            <tr key={f}>
              <th scope="row">
                <code>{f}</code>
              </th>
              <td>
                <code>{formatValue(obj.fields[f] ?? null, heap)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

