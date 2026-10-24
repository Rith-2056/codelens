// Browser client for POST /api/explain.
//
// fetchExplanation never rejects. On any failure (network error, non-2xx,
// bad JSON, wrong shape, abort, client-side timeout, oversized payload) it
// resolves the deterministic template from explainStep with source
// "template". The browser holds no API key and never calls an LLM directly;
// it only talks to /api/explain.
//
// codeSlice, as the UI builds it: the source lines numbered prev.line and
// curr.line, with up to 2 lines of context each side, joined with "\n".
//
// opts.source (optional): the traced program's full source. It is never sent;
// it only improves the local template (see explainStep).

import type { TraceStep } from "../types/trace.ts";
import { explainStep, type Lang } from "./index.ts";

export type Explanation = { text: string; source: "llm" | "template" };

export const EXPLAIN_ENDPOINT = "/api/explain";

/** A bit above the server's 5 s LLM budget, so the server can answer first. */
export const CLIENT_TIMEOUT_MS = 6_000;

/** Must match api/explain.ts MAX_PAYLOAD_BYTES; bigger bodies are never sent. */
export const CLIENT_MAX_PAYLOAD_BYTES = 40_000;

/** Must match api/explain.ts MAX_CODE_SLICE_CHARS. */
export const CLIENT_MAX_CODE_SLICE_CHARS = 4_000;

/** Longest reply the client accepts from the server. */
const MAX_TEXT_CHARS = 1_000;

const CACHE_LIMIT = 500;
const cache = new Map<string, Explanation>();

/** Test hook: forget cached explanations. */
export function clearExplanationCache(): void {
  cache.clear();
}

function isExplanation(v: unknown): v is Explanation {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.text === "string" &&
    r.text.trim().length > 0 &&
    r.text.length <= MAX_TEXT_CHARS &&
    (r.source === "llm" || r.source === "template")
  );
}

export async function fetchExplanation(
  prev: TraceStep | undefined,
  curr: TraceStep,
  lang: Lang,
  codeSlice: string,
  opts?: { codeHash?: string; stepIndex?: number; signal?: AbortSignal; source?: string },
): Promise<Explanation> {
  const template = (): Explanation => {
    try {
      return { text: explainStep(prev, curr, lang, opts?.source), source: "template" };
    } catch {
      return { text: "", source: "template" };
    }
  };

  try {
    const codeHash = opts?.codeHash;
    const stepIndex = opts?.stepIndex;
    const key = codeHash !== undefined && stepIndex !== undefined ? `${codeHash}:${stepIndex}:${lang}` : undefined;
    if (key !== undefined) {
      const hit = cache.get(key);
      if (hit) return hit;
    }

    if (typeof codeSlice !== "string" || codeSlice.length > CLIENT_MAX_CODE_SLICE_CHARS) return template();
    if (opts?.signal?.aborted) return template();

    const body = JSON.stringify({ prev: prev ?? null, curr, lang, codeSlice, codeHash, stepIndex });
    if (new TextEncoder().encode(body).byteLength > CLIENT_MAX_PAYLOAD_BYTES) return template();

    // One controller for both the caller's signal and our timeout. Built by
    // hand (not AbortSignal.any/timeout) so older Chromebook browsers work.
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(onAbort, CLIENT_TIMEOUT_MS);
    // Resolves (never rejects) when aborted, so a fetch that ignores the
    // signal still cannot hold the UI past the timeout.
    const aborted = new Promise<undefined>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(undefined), { once: true });
    });

    let data: unknown;
    try {
      data = await Promise.race([
        aborted,
        (async () => {
          const res = await fetch(EXPLAIN_ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: controller.signal,
          });
          if (!res.ok) return undefined;
          return (await res.json()) as unknown;
        })(),
      ]);
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
    }
    if (controller.signal.aborted || !isExplanation(data)) return template();
    // The server has no program source, so its template can't explain
    // membership checks or class bodies; the local template with the source can.
    if (data.source === "template" && typeof opts?.source === "string") return template();

    const result: Explanation = { text: data.text, source: data.source };
    // Only cache LLM answers; a template answer may be a transient fallback.
    if (key !== undefined && result.source === "llm") {
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, result);
    }
    return result;
  } catch {
    return template();
  }
}
