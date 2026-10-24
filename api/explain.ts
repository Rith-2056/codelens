// POST /api/explain: serverless handler stub (Web-standard Request/Response).
//
// Today it only returns the deterministic template from explainStep. It makes
// no LLM call, holds no key, and never logs anything, so student code and
// snapshots never reach a log.
//
// Request body (JSON):
//   { "prev"?: TraceStep | null, "curr": TraceStep, "lang": "en" | "es",
//     "codeHash"?: string, "stepIndex"?: number }
// Response 200: { "text": string, "source": "template" }
// Errors: 405 (not POST), 413 (body over MAX_PAYLOAD_BYTES), 400 (bad shape).
//
// Student code never runs here: this endpoint only describes snapshots the
// browser already recorded.

import type { TraceStep } from "../frontend/src/types/trace.ts";
import { explainStep, type Lang } from "../frontend/src/explain/index.ts";

/** Two steps at the tracer's STEP_BYTE_CAP (16000 bytes each) plus a small envelope. */
export const MAX_PAYLOAD_BYTES = 40_000;

// TODO(llm): when an LLM key is configured (server env only, never sent to the
// browser), ask for one or two sentences as a patient beginner tutor, in
// `lang`, using only values present in prev/curr, never future values, saying
// that the highlighted line has not run yet, and declining unrelated requests.
// Fall back to the template on any failure.
//
// TODO(number-check): before returning LLM text, run
//   inventedNumbers(llmText, prev, curr, [codeSlice])
// from frontend/src/explain/numbers.ts. If it returns anything, discard the
// LLM text and return the template with source "template".
//
// TODO(cache): cache by cacheKey(codeHash, stepIndex, lang) below, so the same
// step in the same language is generated at most once.
//
// TODO(rate-limit): limit requests per client (e.g. per IP, small token
// bucket) and answer 429 with the template text, so the UI still has one.
//
// TODO(timeout): give the LLM call 5 s, e.g. fetch(..., { signal:
// AbortSignal.timeout(LLM_TIMEOUT_MS) }), then fall back to the template.
export const LLM_TIMEOUT_MS = 5_000;

const LANGS: readonly string[] = ["en", "es"];
const EVENTS: readonly string[] = ["call", "line", "return", "exception"];

/** Cache key for the future LLM path: codeHash + step index + language. */
export function cacheKey(codeHash: string, stepIndex: number, lang: Lang): string {
  return `${codeHash}:${stepIndex}:${lang}`;
}

type Body = { prev?: TraceStep; curr: TraceStep; lang: Lang; codeHash?: string; stepIndex?: number };

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Minimal shape check against the frozen TraceStep contract. */
function isStep(v: unknown): v is TraceStep {
  if (!isRecord(v)) return false;
  if (typeof v.index !== "number" || typeof v.line !== "number" || typeof v.depth !== "number") return false;
  if (typeof v.event !== "string" || !EVENTS.includes(v.event)) return false;
  if (typeof v.functionName !== "string" || typeof v.frameId !== "string") return false;
  if (!isRecord(v.locals) || typeof v.stdout !== "string") return false;
  if (v.error !== undefined) {
    if (!isRecord(v.error) || typeof v.error.type !== "string" || typeof v.error.message !== "string") return false;
  }
  return true;
}

function parseBody(raw: unknown): Body | string {
  if (!isRecord(raw)) return "body must be a JSON object";
  if (typeof raw.lang !== "string" || !LANGS.includes(raw.lang)) return 'lang must be "en" or "es"';
  if (!isStep(raw.curr)) return "curr must be a TraceStep";
  if (raw.prev !== undefined && raw.prev !== null && !isStep(raw.prev)) return "prev must be a TraceStep or null";
  if (raw.codeHash !== undefined && typeof raw.codeHash !== "string") return "codeHash must be a string";
  if (raw.stepIndex !== undefined && typeof raw.stepIndex !== "number") return "stepIndex must be a number";
  return {
    prev: raw.prev === null || raw.prev === undefined ? undefined : (raw.prev as TraceStep),
    curr: raw.curr,
    lang: raw.lang as Lang,
    codeHash: raw.codeHash as string | undefined,
    stepIndex: raw.stepIndex as number | undefined,
  };
}

/** Read the body as text, stopping as soon as it exceeds `cap` bytes. */
async function readCapped(request: Request, cap: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > cap) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "use POST" });

  const text = await readCapped(request, MAX_PAYLOAD_BYTES);
  if (text === null) return json(413, { error: `payload over ${MAX_PAYLOAD_BYTES} bytes` });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: "body must be JSON" });
  }
  const body = parseBody(raw);
  if (typeof body === "string") return json(400, { error: body });

  // TODO(rate-limit) / TODO(cache) / TODO(llm) / TODO(number-check) / TODO(timeout): see the top of this file.
  return json(200, { text: explainStep(body.prev, body.curr, body.lang), source: "template" });
}

/** Web-standard method export (e.g. Vercel Functions: `export function POST(request)`). */
export const POST = handler;
