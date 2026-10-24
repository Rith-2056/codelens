// Language-neutral reading of a TraceStep's `error`. Each renderer (en, es)
// turns an ErrorInfo into friendly text. Only data from the error itself is
// kept, so nothing here can add a number that isn't in the snapshot.

import { proseText } from "./values.ts";

export type Container = "list" | "string" | "tuple" | "range" | "other";

export type ErrorInfo =
  | { kind: "name"; name?: string; suggestion?: string }
  | { kind: "unbound"; name: string }
  | { kind: "operand"; op: string; left: string; right: string }
  | { kind: "concat"; left: string; right: string }
  | { kind: "notCallable"; typeName: string }
  | { kind: "notSubscriptable"; typeName: string }
  | { kind: "notIterable"; typeName: string }
  | { kind: "arguments"; fn?: string; message: string }
  | { kind: "type"; message: string }
  | { kind: "index"; container: Container; empty: boolean }
  | { kind: "key"; key: string }
  | { kind: "zero" }
  | { kind: "syntax"; message: string; indent: boolean }
  | { kind: "input" }
  | { kind: "other"; typeName: string; message: string };

const MESSAGE_MAX = 90;
const NAME_MAX = 40;

function short(s: string, max: number): string {
  return proseText(s.trim(), max);
}

export function readError(error: { type: string; message: string } | undefined): ErrorInfo {
  if (error === undefined) return { kind: "other", typeName: "", message: "" };
  const type = typeof error.type === "string" ? error.type : "";
  const raw = typeof error.message === "string" ? error.message.trim() : "";
  const message = short(raw, MESSAGE_MAX);
  let m: RegExpMatchArray | null;

  switch (type) {
    case "NameError": {
      m = raw.match(/name '([^']+)' is not defined/);
      const s = raw.match(/Did you mean: '([^']+)'\?/);
      return {
        kind: "name",
        name: m ? short(m[1], NAME_MAX) : undefined,
        suggestion: s ? short(s[1], NAME_MAX) : undefined,
      };
    }
    case "UnboundLocalError": {
      m = raw.match(/variable '([^']+)'/) ?? raw.match(/'([^']+)'/);
      if (m) return { kind: "unbound", name: short(m[1], NAME_MAX) };
      return { kind: "other", typeName: type, message };
    }
    case "TypeError": {
      m = raw.match(/^unsupported operand type\(s\) for (.+?): '([^']+)' and '([^']+)'/);
      if (m) return { kind: "operand", op: m[1].split(" ")[0], left: m[2], right: m[3] };
      m = raw.match(/^'(.+?)' not supported between instances of '([^']+)' and '([^']+)'/);
      if (m) return { kind: "operand", op: m[1], left: m[2], right: m[3] };
      m = raw.match(/^can only concatenate (\w+) \(not "([^"]+)"\) to \w+/);
      if (m) return { kind: "concat", left: m[1], right: m[2] };
      m = raw.match(/^'([^']+)' object is not callable/);
      if (m) return { kind: "notCallable", typeName: m[1] };
      m = raw.match(/^'([^']+)' object is not subscriptable/);
      if (m) return { kind: "notSubscriptable", typeName: m[1] };
      m = raw.match(/^'([^']+)' object is not iterable/);
      if (m) return { kind: "notIterable", typeName: m[1] };
      m = raw.match(/^([\w.<>]+)\(\) (?:missing|takes|got)/);
      if (m) return { kind: "arguments", fn: short(m[1], NAME_MAX), message };
      return { kind: "type", message };
    }
    case "IndexError": {
      const empty = /empty/.test(raw);
      let container: Container = "other";
      if (/^(list|pop)/.test(raw)) container = "list";
      else if (/^str(ing)?\b/.test(raw)) container = "string";
      else if (/^tuple/.test(raw)) container = "tuple";
      else if (/^range/.test(raw)) container = "range";
      return { kind: "index", container, empty };
    }
    case "KeyError":
      return { kind: "key", key: message };
    case "ZeroDivisionError":
      return { kind: "zero" };
    case "SyntaxError":
    case "IndentationError":
    case "TabError":
      return { kind: "syntax", message, indent: type !== "SyntaxError" || /indent/i.test(raw) };
    case "RuntimeError":
      if (raw.includes("input()")) return { kind: "input" };
      return { kind: "other", typeName: type, message };
    default:
      return { kind: "other", typeName: short(type, NAME_MAX), message };
  }
}
