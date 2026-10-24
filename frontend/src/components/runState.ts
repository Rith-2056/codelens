import type { TraceResult } from "../types/trace";
import type { TracerStatus } from "../worker/traceClient";
import { lessonById, type LessonId } from "../lessons";

// The run state machine, as a pure reducer.
//
//   LoadingPython ──(Python ready)──▶ Idle ──(Visualize)──▶ Running
//   Running ──▶ Ready | Error | Limit | Timeout | Failed
//   any edit ──▶ Idle (or LoadingPython / Failed if Python isn't ready)
//
// Phases with a trace (Ready, Error, Limit) are steppable. A lesson's fixture
// is shown as Ready while its source is unedited, even before Python loads.

export type TracedPhase = {
  trace: TraceResult;
  code: string; // the exact source this trace came from
  traceId: number; // unique per shown trace; keys explanation requests
  fromFixture: boolean;
};

export type Phase =
  | { name: "loadingPython" } // no trace; waiting for Python
  | { name: "idle" } // no trace; Python ready
  | { name: "running"; runId: number; code: string }
  | ({ name: "ready" } & TracedPhase)
  | ({ name: "error" } & TracedPhase)
  | ({ name: "limit" } & TracedPhase)
  | { name: "timeout"; code: string }
  | { name: "failed"; message: string }; // Python couldn't load or crashed

export type RunState = {
  tracer: TracerStatus;
  lessonId: LessonId;
  code: string; // what is in the editor right now
  phase: Phase;
  stepIndex: number;
  // The run the worker is busy with. It gates Visualize, and can outlive the
  // Running phase when the student edits or picks a lesson mid-run.
  inFlight: number | null;
  nextId: number;
};

export type RunAction =
  | { type: "tracerStatus"; status: TracerStatus }
  | { type: "pickLesson"; lessonId: LessonId }
  | { type: "edit"; code: string }
  | { type: "visualize"; runId: number; code: string }
  | { type: "runFinished"; runId: number; result: TraceResult }
  | { type: "runFailed"; runId: number; message: string }
  | { type: "setStep"; index: number };

export const PYTHON_LOAD_FAILED =
  "Python could not load on this device. You can still step through the three lessons. Reload the page to try again.";

export function traceOf(phase: Phase): (TracedPhase & { name: string }) | null {
  return phase.name === "ready" || phase.name === "error" || phase.name === "limit"
    ? phase
    : null;
}

export function canVisualize(state: RunState): boolean {
  return state.inFlight === null && state.tracer !== "error";
}

function emptyPhase(tracer: TracerStatus): Phase {
  if (tracer === "ready") return { name: "idle" };
  if (tracer === "loading") return { name: "loadingPython" };
  return { name: "failed", message: PYTHON_LOAD_FAILED };
}

function phaseForResult(result: TraceResult, code: string, traceId: number, fromFixture: boolean): Phase {
  const traced = { trace: result, code, traceId, fromFixture };
  switch (result.status) {
    case "ok":
      return { name: "ready", ...traced };
    case "error":
      return { name: "error", ...traced };
    case "limit":
      return { name: "limit", ...traced };
    case "timeout":
      return { name: "timeout", code };
  }
}

// What to show for `code` when there is no fresh run: the lesson fixture if
// the code is the lesson's unedited source, otherwise nothing.
function restingPhase(state: RunState, code: string): { phase: Phase; nextId: number } {
  const lesson = lessonById(state.lessonId);
  if (code === lesson.source) {
    return {
      phase: phaseForResult(lesson.fixture, code, state.nextId, true),
      nextId: state.nextId + 1,
    };
  }
  return { phase: emptyPhase(state.tracer), nextId: state.nextId };
}

export function initialRunState(lessonId: LessonId): RunState {
  const base: RunState = {
    tracer: "loading",
    lessonId,
    code: lessonById(lessonId).source,
    phase: { name: "loadingPython" },
    stepIndex: 0,
    inFlight: null,
    nextId: 1,
  };
  return { ...base, ...restingPhase(base, base.code) };
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "tracerStatus": {
      const tracer = action.status;
      const p = state.phase.name;
      // Only the trace-less waiting phases follow Python's status. A run in
      // flight waits for the fresh worker inside runTrace.
      if (p === "loadingPython" || p === "idle" || (p === "failed" && tracer !== "error")) {
        return { ...state, tracer, phase: emptyPhase(tracer) };
      }
      return { ...state, tracer };
    }

    case "pickLesson": {
      const lesson = lessonById(action.lessonId);
      const next = { ...state, lessonId: lesson.id };
      return { ...next, code: lesson.source, stepIndex: 0, ...restingPhase(next, lesson.source) };
    }

    case "edit": {
      if (action.code === state.code) return state;
      // Any edit invalidates the shown trace (and abandons a running one).
      return { ...state, code: action.code, stepIndex: 0, ...restingPhase(state, action.code) };
    }

    case "visualize": {
      if (!canVisualize(state) || action.code !== state.code) return state;
      return {
        ...state,
        phase: { name: "running", runId: action.runId, code: action.code },
        stepIndex: 0,
        inFlight: action.runId,
      };
    }

    case "runFinished": {
      const inFlight = state.inFlight === action.runId ? null : state.inFlight;
      const p = state.phase;
      if (p.name !== "running" || p.runId !== action.runId || p.code !== state.code) {
        return { ...state, inFlight }; // stale result: the student moved on
      }
      return {
        ...state,
        inFlight,
        phase: phaseForResult(action.result, p.code, state.nextId, false),
        nextId: state.nextId + 1,
        stepIndex: 0,
      };
    }

    case "runFailed": {
      const inFlight = state.inFlight === action.runId ? null : state.inFlight;
      const p = state.phase;
      if (p.name !== "running" || p.runId !== action.runId) return { ...state, inFlight };
      return { ...state, inFlight, phase: { name: "failed", message: action.message } };
    }

    case "setStep": {
      const t = traceOf(state.phase);
      if (!t) return state;
      const last = Math.max(0, t.trace.steps.length - 1);
      const index = Math.min(Math.max(0, action.index), last);
      return index === state.stepIndex ? state : { ...state, stepIndex: index };
    }
  }
}
