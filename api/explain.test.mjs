// Tests for the /api/explain stub. Run from the repo root:
//   node --test api/explain.test.mjs
// Uses Node's built-in Request/Response; no framework needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handler, MAX_PAYLOAD_BYTES, cacheKey } from "./explain.ts";
import { explainStep } from "../frontend/src/explain/index.ts";
import loop from "../shared/fixtures/loop.json" with { type: "json" };

const STEPS = loop.steps;

function post(body) {
  return handler(
    new Request("http://localhost/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

test("returns the deterministic template as {text, source}", async () => {
  for (const lang of ["en", "es"]) {
    const res = await post({ prev: STEPS[4], curr: STEPS[5], lang, codeHash: loop.codeHash, stepIndex: 5 });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await res.json(), { text: explainStep(STEPS[4], STEPS[5], lang), source: "template" });
  }
});

test("accepts a missing or null prev for the first step", async () => {
  for (const prev of [undefined, null]) {
    const res = await post({ prev, curr: STEPS[0], lang: "en" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).text, explainStep(undefined, STEPS[0], "en"));
  }
});

test("rejects bad shapes with 400", async () => {
  const bad = [
    "not json",
    "[]",
    { curr: STEPS[0], lang: "fr" },
    { curr: { ...STEPS[0], event: "jump" }, lang: "en" },
    { curr: { ...STEPS[0], locals: [] }, lang: "en" },
    { prev: { line: 1 }, curr: STEPS[1], lang: "en" },
    { curr: { ...STEPS[0], error: { type: "NameError" } }, lang: "en" },
    { curr: STEPS[0], lang: "en", stepIndex: "5" },
  ];
  for (const body of bad) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(typeof (await res.json()).error, "string");
  }
});

test("enforces the payload cap with 413", async () => {
  const big = { curr: { ...STEPS[0], stdout: "x".repeat(MAX_PAYLOAD_BYTES) }, lang: "en" };
  const res = await post(big);
  assert.equal(res.status, 413);
});

test("only POST is allowed", async () => {
  const res = await handler(new Request("http://localhost/api/explain", { method: "GET" }));
  assert.equal(res.status, 405);
});

test("cache key combines codeHash, step index and language", () => {
  assert.equal(cacheKey("abc", 5, "es"), "abc:5:es");
});
