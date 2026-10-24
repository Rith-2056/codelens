import { TRACE_TIMEOUT_MS } from "../worker/traceClient";
import type { RunState } from "./runState";
import { PYTHON_LOAD_FAILED } from "./runState";

export type Tone = "info" | "warn" | "error";
export type StatusMessage = { tone: Tone; title: string; detail?: string };

const SECONDS = Math.round(TRACE_TIMEOUT_MS / 1000);

function pythonNote(state: RunState): string {
  switch (state.tracer) {
    case "loading":
      return "Python is still loading, so Run will start as soon as it is ready.";
    case "ready":
      return "Change the code, then click Run.";
    case "error":
      return PYTHON_LOAD_FAILED;
  }
}

function count(n: number): string {
  return n === 1 ? "1 step" : `${n} steps`;
}

// Plain-language status for the current phase. Errors are framed as normal
// and fixable. The text only changes when the phase or Python's status does,
// never on a step, so the live region does not repeat itself while stepping.
export function statusMessage(state: RunState): StatusMessage {
  const p = state.phase;
  switch (p.name) {
    case "loadingPython":
      return { tone: "info", title: "Python is loading…", detail: "You can keep editing. Run will work once Python is ready." };
    case "idle":
      return { tone: "info", title: "Ready to run.", detail: "Click Run to run your code and step through it." };
    case "running":
      return state.tracer === "loading"
        ? { tone: "info", title: "Waiting for Python to load…", detail: "Your code will run as soon as Python is ready." }
        : { tone: "info", title: "Running your code…" };
    case "ready":
      return p.fromFixture
        ? { tone: "info", title: `Showing this lesson's example run (${count(p.trace.steps.length)}).`, detail: pythonNote(state) }
        : { tone: "info", title: `Your code ran: ${count(p.trace.steps.length)}.`, detail: "Use Previous and Next, or the Left and Right arrow keys, to step." };
    case "error": {
      const steps = p.trace.steps;
      const errStep = [...steps].reverse().find((s) => s.error) ?? steps[steps.length - 1];
      const type = errStep?.error?.type ?? "an error";
      const where = errStep ? ` on line ${errStep.line}` : "";
      return {
        tone: "error",
        title: `Your program stopped with ${type}${where}.`,
        detail: "Errors are a normal part of coding. Step through to see what happened, then fix the line and click Run again.",
      };
    }
    case "limit":
      return {
        tone: "warn",
        title: p.trace.message ?? `Stopped after ${count(p.trace.steps.length)}.`,
        detail: "Your program may be looping forever. You can still step through the steps it took, or change the code and run it again.",
      };
    case "timeout":
      return {
        tone: "warn",
        title: `Your code took longer than ${SECONDS} seconds, so CodeLens stopped it.`,
        detail:
          state.tracer === "loading"
            ? "Python is restarting. Look for a very slow calculation, change your code, then click Run again."
            : "Look for a very slow calculation, change your code, then click Run again.",
      };
    case "failed":
      return { tone: "error", title: "Run is not available right now.", detail: p.message };
  }
}

export default function RunStatus({ message }: { message: StatusMessage }) {
  return (
    <div className={`run-status tone-${message.tone}`} role="status" aria-live="polite" aria-atomic="true">
      <p className="run-status-title">
        <span className="run-status-tag">
          {message.tone === "error" ? "Error: " : message.tone === "warn" ? "Stopped: " : "Status: "}
        </span>
        {message.title}
      </p>
      {message.detail && <p className="run-status-detail">{message.detail}</p>}
    </div>
  );
}
