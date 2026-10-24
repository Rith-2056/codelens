// Tests for the browser client (fetchExplanation). Run from the repo root:
//   node --test frontend/src/explain/client.test.mjs
// globalThis.fetch is replaced by a fake in every test; no network is used.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  fetchExplanation,
  clearExplanationCache,
  CLIENT_MAX_CODE_SLICE_CHARS,
  CLIENT_MAX_PAYLOAD_BYTES,
  EXPLAIN_ENDPOINT,
} from "./client.ts";
import { explainStep } from "./index.ts";
import { MAX_PAYLOAD_BYTES, MAX_CODE_SLICE_CHARS } from "../../../api/explain.ts";
import loop from "../../../shared/fixtures/loop.json" with { type: "json" };

const PREV = loop.steps[4];
const CURR = loop.steps[5];
const SLICE = "total = 0\nfor n in numbers:\n    total = total + n";
const OPTS = { codeHash: loop.codeHash, stepIndex: 5 };
const LLM_TEXT = "Line 4 added n to total, so total went from 0 to 3. Line 3 is next and hasn't run yet.";
const templateFor = (lang = "en", prev = PREV, curr = CURR) => ({ text: explainStep(prev, curr, lang), source: "template" });

const realFetch = globalThis.fetch;
let calls;

function mockFetch(impl) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  clearExplanationCache();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("client caps match the server's", () => {
  assert.equal(CLIENT_MAX_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES);
  assert.equal(CLIENT_MAX_CODE_SLICE_CHARS, MAX_CODE_SLICE_CHARS);
});

test("success returns the server's llm text and POSTs the documented body", async () => {
  mockFetch(() => jsonResponse({ text: LLM_TEXT, source: "llm" }));
  const res = await fetchExplanation(PREV, CURR, "es", SLICE, OPTS);
  assert.deepEqual(res, { text: LLM_TEXT, source: "llm" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, EXPLAIN_ENDPOINT);
  assert.equal(calls[0].url, "/api/explain");
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].init.headers["content-type"], /application\/json/);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    prev: PREV,
    curr: CURR,
    lang: "es",
    codeSlice: SLICE,
    codeHash: loop.codeHash,
    stepIndex: 5,
  });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("a server template answer is passed through as template", async () => {
  mockFetch(() => jsonResponse(templateFor()));
  assert.deepEqual(await fetchExplanation(PREV, CURR, "en", SLICE, OPTS), templateFor());
});

test("first step: prev undefined is sent as null", async () => {
  mockFetch(() => jsonResponse({ text: "Python is ready to run your program.", source: "llm" }));
  await fetchExplanation(undefined, loop.steps[0], "en", "");
  assert.equal(JSON.parse(calls[0].init.body).prev, null);
});

test("every failure mode resolves to the template (never rejects)", async () => {
  const failures = {
    "network error": () => Promise.reject(new TypeError("Failed to fetch")),
    "500": () => jsonResponse({ error: "boom" }, 500),
    "429 with template text": () => jsonResponse(templateFor(), 429),
    "413": () => jsonResponse({ error: "too big" }, 413),
    "bad JSON": () => new Response("not json{", { status: 200 }),
    "wrong shape: missing text": () => jsonResponse({ source: "llm" }),
    "wrong shape: bad source": () => jsonResponse({ text: "hi", source: "gpt" }),
    "wrong shape: empty text": () => jsonResponse({ text: "  ", source: "llm" }),
    "wrong shape: array": () => jsonResponse([LLM_TEXT]),
    "wrong shape: overlong": () => jsonResponse({ text: "a".repeat(5_000), source: "llm" }),
    "json() throws": () => ({ ok: true, json: () => Promise.reject(new Error("x")) }),
    "fetch throws synchronously": () => {
      throw new Error("sync");
    },
  };
  for (const [label, impl] of Object.entries(failures)) {
    mockFetch(impl);
    for (const lang of ["en", "es"]) {
      const res = await fetchExplanation(PREV, CURR, lang, SLICE, OPTS);
      assert.deepEqual(res, templateFor(lang), label);
    }
  }
});

test("an already-aborted signal resolves to the template without fetching", async () => {
  mockFetch(() => jsonResponse({ text: LLM_TEXT, source: "llm" }));
  const c = new AbortController();
  c.abort();
  assert.deepEqual(await fetchExplanation(PREV, CURR, "en", SLICE, { ...OPTS, signal: c.signal }), templateFor());
  assert.equal(calls.length, 0);
});

test("aborting mid-request resolves to the template, even if fetch ignores the signal", async () => {
  let fetchSignal;
  mockFetch((_url, init) => {
    fetchSignal = init.signal;
    return new Promise(() => {}); // hangs forever, ignores abort
  });
  const c = new AbortController();
  const pending = fetchExplanation(PREV, CURR, "en", SLICE, { ...OPTS, signal: c.signal });
  setTimeout(() => c.abort(), 10);
  assert.deepEqual(await pending, templateFor());
  assert.equal(fetchSignal.aborted, true);
});

test("an abort that makes fetch reject resolves to the template", async () => {
  mockFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );
  const c = new AbortController();
  const pending = fetchExplanation(PREV, CURR, "en", SLICE, { signal: c.signal });
  setTimeout(() => c.abort(), 10);
  assert.deepEqual(await pending, templateFor());
});

test("client-side timeout (~6 s) resolves to the template", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fetchSignal;
  mockFetch((_url, init) => {
    fetchSignal = init.signal;
    return new Promise(() => {});
  });
  const pending = fetchExplanation(PREV, CURR, "en", SLICE, OPTS);
  await Promise.resolve();
  t.mock.timers.tick(5_999);
  assert.equal(fetchSignal.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, templateFor());
  assert.equal(fetchSignal.aborted, true);
});

test("oversized payload or codeSlice resolves to the template without fetching", async () => {
  mockFetch(() => jsonResponse({ text: LLM_TEXT, source: "llm" }));
  const bigCurr = { ...CURR, stdout: "x".repeat(CLIENT_MAX_PAYLOAD_BYTES) };
  assert.deepEqual(await fetchExplanation(PREV, bigCurr, "en", SLICE, OPTS), templateFor("en", PREV, bigCurr));
  // Multi-byte characters: the cap is in bytes, not characters.
  const wideCurr = { ...CURR, stdout: "é".repeat(CLIENT_MAX_PAYLOAD_BYTES / 2 + 10) };
  assert.deepEqual(await fetchExplanation(PREV, wideCurr, "en", SLICE, OPTS), templateFor("en", PREV, wideCurr));
  const bigSlice = "x".repeat(CLIENT_MAX_CODE_SLICE_CHARS + 1);
  assert.deepEqual(await fetchExplanation(PREV, CURR, "en", bigSlice, OPTS), templateFor());
  assert.equal(calls.length, 0);
});

test("cache: an llm answer is reused for the same codeHash:stepIndex:lang", async () => {
  mockFetch(() => jsonResponse({ text: LLM_TEXT, source: "llm" }));
  await fetchExplanation(PREV, CURR, "en", SLICE, OPTS);
  assert.deepEqual(await fetchExplanation(PREV, CURR, "en", SLICE, OPTS), { text: LLM_TEXT, source: "llm" });
  assert.equal(calls.length, 1);
  await fetchExplanation(PREV, CURR, "es", SLICE, OPTS);
  await fetchExplanation(PREV, CURR, "en", SLICE, { ...OPTS, stepIndex: 6 });
  assert.equal(calls.length, 3);
  // No codeHash/stepIndex: never cached.
  await fetchExplanation(PREV, CURR, "en", SLICE);
  await fetchExplanation(PREV, CURR, "en", SLICE);
  assert.equal(calls.length, 5);
});

test("cache: template answers are not cached, so a later try can get the llm text", async () => {
  let n = 0;
  mockFetch(() => (n++ === 0 ? jsonResponse({}, 503) : jsonResponse({ text: LLM_TEXT, source: "llm" })));
  assert.equal((await fetchExplanation(PREV, CURR, "en", SLICE, OPTS)).source, "template");
  assert.equal((await fetchExplanation(PREV, CURR, "en", SLICE, OPTS)).source, "llm");
  assert.equal(calls.length, 2);
});
