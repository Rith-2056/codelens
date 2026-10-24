import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { JsonValue, TraceStep } from "../types/trace";
import { explainStep, type Lang } from "../explain";
import { kindOf } from "../explain/snapshot";
import CallStack from "../components/CallStack";
import CodeView, { sourceLines } from "../components/CodeView";
import DataStructures from "../components/DataStructures";
import Explanation from "../components/Explanation";
import Narrator from "../components/Narrator";
import { previousInFrame } from "../components/stepInfo";
import { framesOf, structuresFor, topStructureChange } from "../components/structures";
import { formatValue } from "../components/values";
import ArrayStage, { type PointerRole } from "./ArrayStage";
import ControlBar from "./ControlBar";
import { accessedCells, codeContext, detectPattern, stepChanges, variableGroups, type CodeContext, type Pattern, type VarInfo } from "./focus";
import ChangeList from "./ChangeList";

type Props = {
  /** The problem's title, or "Your code". */
  title: string;
  /** Which run is shown: "Your solution", "Correct solution", a lesson name. */
  runLabel: string;
  program: string;
  steps: TraceStep[];
  codeHash: string;
  traceId: string;
  index: number;
  onIndexChange: (index: number, fromSlider?: boolean) => void;
  lang: Lang;
  onClose: () => void;
  /** Extra header controls, e.g. the switch between your run and the correct one. */
  headerExtra?: ReactNode;
};

const SPLIT_KEY = "codelens.visualizer.split";
const SPLIT_MIN = 25;
const SPLIT_MAX = 70;
const LOW = ["lo", "low", "l", "left", "start"];
const HIGH = ["hi", "high", "r", "right", "end"];

function savedSplit(): number {
  try {
    const v = Number(window.localStorage.getItem(SPLIT_KEY));
    if (v >= SPLIT_MIN && v <= SPLIT_MAX) return v;
  } catch {
    /* storage may be blocked */
  }
  return 40;
}

const isInt = (v: JsonValue | undefined): v is number => typeof v === "number" && Number.isInteger(v);
const isScalar = (v: JsonValue) => ["primitive", "placeholder"].includes(kindOf(v));

function roleOf(name: string, pattern: Pattern): PointerRole {
  if (pattern.kind !== "binary-search") return "plain";
  if (name === "mid" || name === "m") return "mid";
  if (LOW.includes(name)) return "low";
  if (HIGH.includes(name)) return "high";
  return "plain";
}

function contextText(ctx: CodeContext): string {
  const parts = [ctx.functionName === "<module>" ? "In the main program" : `In ${ctx.functionName}()`];
  if (ctx.recursive) parts[0] += ` · call ${ctx.callDepth} deep (recursion)`;
  if (ctx.loopKind) parts.push(ctx.loopPass === 0 ? `${ctx.loopKind} loop, starting` : `${ctx.loopKind} loop, pass ${ctx.loopPass}`);
  return parts.join(" · ");
}

// The Code Visualizer: a focused, full-screen view of one run. The code is on
// the left (next line marked, syntax colored, the function and loop named),
// the visualization on the right (a large view chosen for the algorithm,
// what changed, the variables that matter now, everything else collapsed),
// and the control bar along the bottom. The page behind it is inert.
export default function CodeVisualizer(props: Props) {
  const { title, runLabel, program, steps, codeHash, traceId, index, onIndexChange, lang, onClose, headerExtra } = props;
  const i = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[i];
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(savedSplit);
  const [dragging, setDragging] = useState(false);
  const [tutor, setTutor] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  // While open, the page behind is inert and hidden from screen readers.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const others = [...document.body.children].filter((el) => el !== root) as HTMLElement[];
    const saved = others.map((el) => [el, el.getAttribute("inert"), el.getAttribute("aria-hidden")] as const);
    for (const el of others) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    return () => {
      for (const [el, inert, hidden] of saved) {
        if (inert === null) el.removeAttribute("inert");
        else el.setAttribute("inert", inert);
        if (hidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", hidden);
      }
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SPLIT_KEY, String(split));
    } catch {
      /* storage may be blocked */
    }
  }, [split]);

  const pattern = useMemo(() => detectPattern(steps, program), [steps, program]);
  const prev = useMemo(() => previousInFrame(steps, i), [steps, i]);
  const ctx = useMemo(() => (step ? codeContext(steps, i, program) : null), [steps, i, program, step]);
  const groups = useMemo(() => (step ? variableGroups(steps, i, program) : null), [steps, i, program, step]);
  const lines = useMemo(() => sourceLines(program), [program]);

  function changeSplit(next: number) {
    setSplit(Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, Math.round(next))));
  }
  function onSeparatorKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: split - 5, ArrowRight: split + 5, Home: SPLIT_MIN, End: SPLIT_MAX };
    if (!(e.key in moves)) return;
    e.preventDefault(); // also keeps the arrow keys from stepping the run
    e.stopPropagation();
    changeSplit(moves[e.key]!);
  }
  function onSeparatorMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging || !splitRef.current) return;
    const box = splitRef.current.getBoundingClientRect();
    if (box.width > 0) changeSplit(((e.clientX - box.left) / box.width) * 100);
  }

  if (!step || !ctx || !groups) return null;

  const heap = step.heap ?? {};
  const locals = step.locals;
  const justRan = prev ? (lines[prev.line - 1] ?? "") : "";
  const template = explainStep(i > 0 ? steps[i - 1] : undefined, step, lang, program);
  const structures = structuresFor(locals, prev?.locals);
  const changes = stepChanges(step, prev);

  // The main list for array-shaped algorithms, if this frame has it.
  const listName = pattern.table ?? pattern.array;
  const list = listName !== undefined ? locals[listName] : undefined;
  const hasList = listName !== undefined && Array.isArray(list) && kindOf(list) === "array";
  const pointers = hasList
    ? pattern.pointers
        .filter((p) => isInt(locals[p]) && (locals[p] as number) >= 0 && (locals[p] as number) < (list as JsonValue[]).length)
        .map((p) => ({ name: p, index: locals[p] as number, role: roleOf(p, pattern) }))
    : [];
  let range: { lo: number; hi: number } | null = null;
  if (hasList && pattern.kind === "binary-search") {
    const lo = LOW.map((n) => locals[n]).find(isInt);
    const hi = HIGH.map((n) => locals[n]).find(isInt);
    if (lo !== undefined && hi !== undefined) range = { lo, hi };
  }
  let band: { from: number; to: number; label: string } | null = null;
  if (hasList && pattern.kind === "sliding-window") {
    const k = pattern.windowSize ? locals[pattern.windowSize] : undefined;
    const r = ["right", "end", "r", "j", "i", "hi"].map((n) => locals[n]).find(isInt);
    if (isInt(k)) {
      const to = r !== undefined ? r : k - 1;
      const v = pattern.windowValue ? locals[pattern.windowValue] : undefined;
      const value = v !== undefined && isScalar(v) ? ` · ${pattern.windowValue} = ${formatValue(v, heap)}` : "";
      band = { from: Math.max(0, to - k + 1), to, label: `window: k = ${k}${value}` };
    }
  }
  const onStage = new Set<string>(hasList ? [listName!, ...pointers.map((p) => p.name)] : []);
  if (band && pattern.windowSize) onStage.add(pattern.windowSize);
  if (band && pattern.windowValue) onStage.add(pattern.windowValue);

  const others = structures.filter((s) => !onStage.has(s.name));
  const showStack = pattern.recursive || framesOf(step).length > 2;
  const allVars: [string, VarInfo[]][] = [
    ["Parameters", groups.parameters],
    ["Loop counters", groups.loopCounters],
    ["Pointers", groups.pointers],
    ["Other", groups.other],
  ];
  const watch = allVars.flatMap(([, vs]) => vs).filter((v) => v.relevant && isScalar(v.value) && !onStage.has(v.name));
  // Keep locals order (parameters first, as Python lists them).
  const order = Object.keys(locals);
  watch.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const total = allVars.reduce((n, [, vs]) => n + vs.length, 0);

  const marks = new Map<number, string>();
  if (ctx.defLine !== null) marks.set(ctx.defLine, ctx.recursive ? `call ${ctx.callDepth} deep` : "running");
  if (ctx.loopLine !== null && ctx.loopLine !== step.line) marks.set(ctx.loopLine, ctx.loopPass ? `pass ${ctx.loopPass}` : "loop");

  return createPortal(
    <div
      ref={rootRef}
      className="cv-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cv-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="cv-header">
        <div className="cv-titles">
          <h2 id="cv-title" ref={headingRef} tabIndex={-1}>
            Code Visualizer
          </h2>
          <p className="cv-subtitle">
            {title} · {runLabel}
          </p>
        </div>
        <div className="cv-actions">
          {headerExtra}
          <button type="button" className="tool-button" aria-pressed={tutor} onClick={() => setTutor(!tutor)}>
            AI explanation
          </button>
          <button type="button" className="tool-button cv-exit" onClick={onClose}>
            Exit visualizer
          </button>
        </div>
      </header>

      <div
        ref={splitRef}
        className={`cv-split${dragging ? " cv-dragging" : ""}`}
        style={{ ["--split" as string]: `${split}%` }}
        onPointerMove={onSeparatorMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <section className="cv-code glass" aria-labelledby="cv-code-heading">
          <h3 id="cv-code-heading" className="cv-panel-title">
            Code
          </h3>
          <p className="cv-context">{contextText(ctx)}</p>
          <CodeView source={program} step={step} marks={marks} follow />
        </section>

        <div
          className="cv-separator"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize code and visualization"
          aria-valuenow={split}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          tabIndex={0}
          onKeyDown={onSeparatorKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDragging(true);
          }}
        />

        <section className="cv-viz glass" aria-labelledby="cv-viz-heading">
          <h3 id="cv-viz-heading" className="cv-panel-title">
            Visualization
          </h3>
          {tutor && (
            <div className="cv-tutor">
              <Explanation steps={steps} index={i} lang={lang} code={program} codeHash={codeHash} traceId={traceId} />
            </div>
          )}

          <div className="cv-changes">
            <h4 className="cv-label" id="cv-changes-heading">
              What changed
            </h4>
            <ChangeList changes={changes} />
          </div>

          <div className={`cv-stage${showStack && !hasList ? " cv-stage-with-stack" : ""}`}>
            {hasList && (
              <ArrayStage
                name={listName!}
                items={list as JsonValue[]}
                heap={heap}
                pointers={pointers}
                changes={structures.find((s) => s.name === listName)?.changes ?? []}
                accessed={accessedCells(justRan, locals)[listName!] ?? []}
                range={range}
                window={band}
              />
            )}
            {(others.length > 0 || pattern.kind === "tree") && (
              <div className="cv-structures">
                <DataStructures items={others} locals={locals} heap={heap} line={lines[step.line - 1] ?? ""} frames={framesOf(step)} />
              </div>
            )}
            {!hasList && others.length === 0 && pattern.kind !== "tree" && (
              <p className="cv-quiet">No lists or other data structures on this step. The variables below show what is happening.</p>
            )}
            {showStack && (
              <div className="cv-stack">
                <CallStack step={step} />
              </div>
            )}
          </div>

          <div className="cv-watch">
            <h4 className="cv-label">Variables in focus</h4>
            {watch.length ? (
              <ul className="cv-chips" aria-label="Variables in focus">
                {watch.map((v) => (
                  <li key={v.name} className={`cv-chip${v.changed ? " cv-chip-changed" : ""}`}>
                    <code>{v.name}</code> = {formatValue(v.value, heap)}
                    {v.changed && <span className="sr-only"> (just changed)</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cv-quiet">Everything that matters on this step is drawn above.</p>
            )}
          </div>

          {step.stdout && (
            <div className="cv-output">
              <h4 className="cv-label">Output so far</h4>
              <pre className="output">{step.stdout}</pre>
            </div>
          )}

          <details className="all-vars">
            <summary>All variables ({total})</summary>
            <table className="vars cv-vars">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Value</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              {allVars
                .filter(([, vs]) => vs.length > 0)
                .map(([label, vs]) => (
                  <tbody key={label}>
                    <tr className="var-group">
                      <th scope="rowgroup" colSpan={3}>
                        {label}
                      </th>
                    </tr>
                    {vs.map((v) => (
                      <tr key={v.name} className={v.changed ? "var-changed" : "var-same"}>
                        <th scope="row">
                          <code>{v.name}</code>
                        </th>
                        <td className="value">{formatValue(v.value, heap)}</td>
                        <td>{v.changed && <span className="marker marker-changed">changed</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
            </table>
          </details>
        </section>
      </div>

      <footer className="cv-footer">
        <ControlBar
          index={i}
          total={steps.length}
          line={step.line}
          description={template}
          onIndexChange={(n, fromSlider) => {
            setScrubbing(Boolean(fromSlider));
            onIndexChange(n, fromSlider);
          }}
        />
      </footer>
      <Narrator
        source={program}
        step={step}
        index={i}
        total={steps.length}
        explanation={template}
        lang={lang}
        structureNote={topStructureChange(structures, heap)}
        delayMs={scrubbing ? 600 : 0}
      />
    </div>,
    document.body,
  );
}
