// Three levels of help when a practice solution is wrong:
//   1. a gentle hint (a nudge, no code),
//   2. a targeted explanation (what goes wrong on this input, still no code),
//   3. a possible fix (a small change to the student's own code).
// The AI tutor (POST /api/help, Gemini on the server) writes them; these
// deterministic templates are the offline fallback, used by both the browser
// and the server. Pure: no DOM, and the client only uses fetch.

import { numberTokens } from "./numbers.ts";

export type HelpLevel = 1 | 2 | 3;
export type HelpLang = "en" | "es";

/** Everything the tutor gets. Values are already shown the way Python prints them. */
export type HelpRequest = {
  level: HelpLevel;
  lang: HelpLang;
  problem: { title: string; statement: string; signature: string };
  code: string;
  /** e.g. "nums = [0, 0], target = 0" */
  input: string;
  /** What the solution returned, or null if it crashed or ran away. */
  got: string | null;
  expected: string;
  error: { type: string; message: string } | null;
};

export type HelpReply = { text: string; source: "llm" | "template"; level: HelpLevel };

export const HELP_ENDPOINT = "/api/help";
/** The server allows the model 12 s; the browser waits a little longer. */
export const HELP_CLIENT_TIMEOUT_MS = 14_000;

function crash(r: HelpRequest): string | null {
  if (!r.error) return null;
  return r.error.message ? `${r.error.type}: ${r.error.message}` : r.error.type;
}

/** The offline wording for each level, in English or Spanish. */
export function helpTemplate(r: HelpRequest): string {
  const failure = crash(r);
  const runaway = r.error?.type === "StepLimit" || r.error?.type === "Timeout";
  if (r.lang === "es") {
    switch (r.level) {
      case 1:
        if (runaway) return `Prueba tu solución a mano con ${r.input}. ¿Hay un bucle que nunca termina, o algo que se repite demasiado?`;
        if (failure) return `Prueba tu solución a mano con ${r.input}. Se detiene con ${r.error!.type}: ¿qué línea podría causarlo?`;
        return `Prueba tu solución a mano con ${r.input}. La respuesta debería ser ${r.expected}: ¿en qué línea hace tu código algo que no esperabas?`;
      case 2:
        if (failure) {
          return `Con ${r.input}, tu solución se detiene con ${failure}. Recorre tu ejecución paso a paso con esta entrada hasta la línea que lo provoca y mira los valores justo antes.`;
        }
        return `Con ${r.input}, tu solución devolvió ${r.got}, pero la respuesta correcta es ${r.expected}. Recorre tu ejecución paso a paso y mira las variables: el primer paso en que una no vale lo que esperas es donde está el error.`;
      case 3:
        return `El tutor con IA no está disponible, así que CodeLens no puede sugerir un arreglo ahora. Muestra la solución correcta y recorre ambas ejecuciones lado a lado para ver dónde se separan.`;
    }
  }
  switch (r.level) {
    case 1:
      if (runaway) return `Try your solution by hand on ${r.input}. Is there a loop that never ends, or work that repeats too much?`;
      if (failure) return `Try your solution by hand on ${r.input}. It stops with ${r.error!.type}: which line could cause that?`;
      return `Try your solution by hand on ${r.input}. The answer should be ${r.expected}: which line first does something you did not expect?`;
    case 2:
      if (failure) {
        return `On ${r.input}, your solution stops with ${failure}. Step through your run on this input to the line that raises it, and look at the values just before.`;
      }
      return `On ${r.input}, your solution returned ${r.got}, but the correct answer is ${r.expected}. Step through your run on this input and watch the variables: the first step where one of them differs from what you expect is where the bug is.`;
    case 3:
      return `The AI tutor is offline, so CodeLens can't suggest a fix right now. Show the correct solution and step through both runs side by side to see where they split.`;
  }
}

/**
 * Numbers the tutor may mention: those in the student's code, the input, the
 * answers, the error and the problem, plus every line number of the code.
 */
export function allowedHelpNumbers(r: HelpRequest): Set<string> {
  const out = new Set<string>();
  const sources = [r.code, r.input, r.got ?? "", r.expected, r.error?.message ?? "", r.problem.statement, r.problem.signature];
  for (const s of sources) for (const n of numberTokens(s)) out.add(n);
  const lines = r.code.split("\n").length;
  for (let i = 1; i <= lines; i++) out.add(String(i));
  return out;
}

function isReply(v: unknown, level: HelpLevel): v is HelpReply {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.text === "string" && o.text.length > 0 && (o.source === "llm" || o.source === "template") && o.level === level;
}

/** Ask the tutor for one level of help. Never rejects: any failure gives the template. */
export async function fetchHelp(r: HelpRequest, opts: { signal?: AbortSignal } = {}): Promise<HelpReply> {
  const fallback: HelpReply = { text: helpTemplate(r), source: "template", level: r.level };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, HELP_CLIENT_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([
      fetch(HELP_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(r),
        signal: controller.signal,
      }),
      deadline,
    ]);
    if (res === null || !res.ok) return fallback;
    const data: unknown = await res.json();
    return isReply(data, r.level) ? data : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
