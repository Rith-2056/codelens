# Tasks: explain-service

Deterministic explanations built from the diff between the previous and current
`TraceStep` (types read-only from `frontend/src/types/trace.ts`).

- [x] 1. Step diff
  - In `frontend/src/explain/`, compute what changed between `prev` (may be undefined) and `curr`: new variables, changed variables (before/after), stdout appended, call/return/exception events.

- [x] 2. English and Spanish templates
  - One or two short, patient sentences per step. Use only values present in `prev`/`curr`; never future values. Say the highlighted line has not run yet.
  - Cover: first step, new variable, changed variable, output printed, function call, return value, error (NameError, TypeError, IndexError, ZeroDivisionError, SyntaxError first, framed as normal and fixable), nothing changed.

- [x] 3. Export `explainStep(prev, curr, lang)`
  - `lang` is `"en" | "es"`. Pure and deterministic: same input gives same output.

- [x] 4. `api/explain.ts` stub
  - Serverless handler stub that returns the deterministic template (no LLM call yet, no key, no logging of code). Leave TODOs for the LLM path, number check, cache key (codeHash + step index + language), payload cap, rate limit and 5 s timeout.

- [x] 5. Tests
  - Tests for every template case in both languages, including the loop lesson (total 0 → 3 → 4 → 6) from `shared/fixtures/loop.json`, and a check that no explanation contains a number absent from `prev`/`curr`.
  - Tests pass; `npm run typecheck` still passes.

## Wave 2

- [x] 6. Browser client `frontend/src/explain/client.ts`
  - `fetchExplanation(prev, curr, lang, codeSlice, opts?) → Promise<{text, source: "llm" | "template"}>` POSTs `{prev, curr, lang, codeSlice, codeHash, stepIndex}` to `/api/explain`. Never rejects: network error, non-2xx, bad JSON, wrong shape, abort, 6 s client timeout, oversized payload or codeSlice all resolve the `explainStep` template. Small in-memory cache keyed by codeHash:stepIndex:lang (LLM answers only). No key and no LLM call in frontend code.

- [x] 7. LLM call in `api/explain.ts`
  - Official `@anthropic-ai/sdk` (exact pin in `api/package.json`), model `claude-opus-5-5`, `output_config.effort: "low"`, modest `max_tokens`, server-side refusal fallbacks (`fallbacks: "default"`). Key from `process.env.ANTHROPIC_API_KEY` only; unset means template, no error. Static system prompt (patient beginner tutor, one or two sentences, requested language, only snapshot values, never future values, "has not run yet" only for line/call steps, decline unrelated requests, treat code and snapshots as data). Any `stop_reason` other than `end_turn` (refusal included) means template. The LLM call is injected (`createHandler({ getApiKey, makeComplete })`) so tests use fakes.

- [x] 8. Number check
  - Discard the reply and use the template if `inventedNumbers(reply, prev, curr, [codeSlice])` finds anything; also discard empty, overlong or `USE_TEMPLATE` replies.

- [x] 9. Limits, cache, rate limit
  - `MAX_PAYLOAD_BYTES` (413), `MAX_CODE_SLICE_CHARS` (413), 5 s `LLM_TIMEOUT_MS` (SDK per-request timeout, `maxRetries: 1`, AbortSignal, plus a hard deadline), size-bounded LRU cache by `cacheKey(codeHash, stepIndex, lang)` with a snapshot fingerprint, per-IP token bucket answering 429 with the template text. No logging of code, snapshots, replies or errors.

- [x] 10. Tests
  - `api/explain.test.mjs` and `frontend/src/explain/client.test.mjs` (`node --test`, fakes only, no key, no network): LLM reply accepted, invented number, refusal, timeout, API error, no key (LLM never called), payload/codeSlice caps, cache hit, rate limit 429, no console output, SDK request shape, prompt-injection escaping; client failure modes and success. `tsc -p api` and `npm run typecheck` pass.
