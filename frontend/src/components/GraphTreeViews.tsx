import { useId } from "react";
import { scrollBox } from "./scrollBox";
import type { JsonValue } from "../types/trace";
import { dictEntries, itemsOf, sameValue } from "../explain/snapshot";
import {
  circleLayout,
  graphBadges,
  nodeLabel,
  treeLayout,
  type Graph,
  type TreeNode,
} from "./graphTree";

// Graph and Tree views. Each draws an SVG (role="img" with a summary label)
// and always shows a text version with the same information, so nothing is
// conveyed by the picture or by color alone.

const NODE_R = 16;
// Room around the graph's circle for node badges such as "visited, ← person".
const PAD_X = 50;
const PAD_TOP = 10;
const PAD_BOTTOM = 30;

/** "visited", "queue", "← person": short badge text for inside the picture. */
const shortBadge = (b: string) => b.replace(/^in /, "");

export function GraphView({ name, graph, value, locals }: {
  name: string;
  graph: Graph;
  value: JsonValue;
  locals: Record<string, JsonValue>;
}) {
  const arrowId = useId();
  const size = 240;
  const pts = circleLayout(graph.nodes.length, size);
  const at = (v: JsonValue) => pts[graph.nodes.findIndex((n) => sameValue(n, v))]!;
  const linkWord = graph.directed ? "points to" : "linked to";
  const summary = `Graph ${name}: ${graph.nodes.length} nodes, ${graph.edges.length} ${graph.edges.length === 1 ? "link" : "links"}`;
  const neighbors = new Map(dictEntries(value).map(([k, v]) => [nodeLabel(k), itemsOf(v).map(nodeLabel)]));

  return (
    <figure className="viz">
      <svg
        className="viz-svg viz-graph"
        viewBox={`${-PAD_X} ${-PAD_TOP} ${size + 2 * PAD_X} ${size + PAD_TOP + PAD_BOTTOM}`}
        role="img"
        aria-label={summary}
      >
        {graph.directed && (
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="viz-arrow" />
            </marker>
          </defs>
        )}
        {graph.edges.map(([a, b], i) => {
          const p = at(a);
          const q = at(b);
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const ux = (q.x - p.x) / len;
          const uy = (q.y - p.y) / len;
          return (
            <line
              key={i}
              className="viz-edge"
              x1={p.x + ux * NODE_R}
              y1={p.y + uy * NODE_R}
              x2={q.x - ux * NODE_R}
              y2={q.y - uy * NODE_R}
              markerEnd={graph.directed ? `url(#${arrowId})` : undefined}
            />
          );
        })}
        {graph.nodes.map((node, i) => {
          const p = pts[i]!;
          const badges = graphBadges(node, locals, name);
          return (
            <g key={i}>
              <circle className={badges.length ? "viz-node viz-node-marked" : "viz-node"} cx={p.x} cy={p.y} r={NODE_R} />
              <text className="viz-label" x={p.x} y={p.y} dy="0.35em" textAnchor="middle">
                {nodeLabel(node)}
              </text>
              {badges.length > 0 && (
                <text className="viz-badge" x={p.x} y={p.y + NODE_R + 11} textAnchor="middle">
                  {badges.map(shortBadge).join(", ")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="viz-text" aria-label={`${name} as text`}>
        {graph.nodes.map((node, i) => {
          const nbrs = neighbors.get(nodeLabel(node)) ?? [];
          const badges = graphBadges(node, locals, name);
          const links = nbrs.length ? `${linkWord} ${nbrs.join(", ")}` : "no links";
          return <li key={i}>{`${nodeLabel(node)}: ${links}.${badges.length ? ` ${badges.join(", ")}` : ""}`}</li>;
        })}
      </ul>
    </figure>
  );
}

export function TreeView({ name, where, root, badges }: {
  name: string;
  /** Where the variable that holds the root lives, e.g. "main program". */
  where: string;
  root: TreeNode;
  badges: Map<string, string[]>;
}) {
  const pos = treeLayout(root);
  const colW = 44;
  const rowH = 64;
  const depth = Math.max(...[...pos.values()].map((p) => p.depth));
  const width = pos.size * colW + 16;
  const height = (depth + 1) * rowH + 8;
  const xy = (id: string) => {
    const p = pos.get(id)!;
    return { x: 8 + colW / 2 + p.x * colW, y: 24 + p.depth * rowH };
  };
  const edges: [string, string][] = [];
  const walk = (n: TreeNode | null) => {
    if (!n) return;
    for (const c of [n.left, n.right]) if (c) edges.push([n.id, c.id]);
    walk(n.left);
    walk(n.right);
  };
  walk(root);
  const nodes = [...pos.keys()];
  const label = (id: string) => findNode(root, id)?.label ?? "";
  // Picture text: just the variable names, with ▶ for the running call.
  const picBadge = (id: string) =>
    (badges.get(id) ?? []).map((b) => b.split(" in ")[0] + (b.endsWith("(running)") ? " ▶" : "")).join(", ");

  return (
    <figure className="viz">
      <div className="scroll-x" {...scrollBox(`${name}: tree picture`)}>
        <svg
          className="viz-svg viz-tree"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Tree from ${name} (${where}): ${pos.size} nodes`}
        >
          {edges.map(([a, b]) => {
            const p = xy(a);
            const q = xy(b);
            return <line key={`${a}-${b}`} className="viz-edge" x1={p.x} y1={p.y + NODE_R} x2={q.x} y2={q.y - NODE_R} />;
          })}
          {nodes.map((id) => {
            const p = xy(id);
            const marked = (badges.get(id) ?? []).length > 0;
            return (
              <g key={id}>
                <circle className={marked ? "viz-node viz-node-marked" : "viz-node"} cx={p.x} cy={p.y} r={NODE_R} />
                <text className="viz-label" x={p.x} y={p.y} dy="0.35em" textAnchor="middle">
                  {label(id)}
                </text>
                {marked && (
                  <text className="viz-badge" x={p.x} y={p.y + NODE_R + 11} textAnchor="middle">
                    {picBadge(id)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="viz-text viz-tree-text" aria-label={`${name} as text`}>
        <TreeItem node={root} prefix="" badges={badges} />
      </ul>
    </figure>
  );
}

function findNode(n: TreeNode | null, id: string): TreeNode | null {
  if (!n) return null;
  if (n.id === id) return n;
  return findNode(n.left, id) ?? findNode(n.right, id);
}

function TreeItem({ node, prefix, badges }: { node: TreeNode; prefix: string; badges: Map<string, string[]> }) {
  const b = badges.get(node.id) ?? [];
  return (
    <li>
      {`${prefix}${node.label}${b.length ? ` (${b.join("; ")})` : ""}`}
      {(node.left || node.right) && (
        <ul>
          {node.left && <TreeItem node={node.left} prefix="left: " badges={badges} />}
          {node.right && <TreeItem node={node.right} prefix="right: " badges={badges} />}
        </ul>
      )}
    </li>
  );
}
