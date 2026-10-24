// Live checks against the real Gemini API. NOT part of the pre-commit suite
// (they cost quota and need the network). Run on purpose:
//   GEMINI_API_KEY=... node --test api/live.check.mjs
// Every check is skipped when GEMINI_API_KEY is not set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { geminiComplete, createHandler, LLM_TIMEOUT_MS, MODEL } from "./explain.ts";
import { buildHelpRequest, createHelpHandler, HELP_MODEL, HELP_TIMEOUT_MS } from "./help.ts";
import loop from "../shared/fixtures/loop.json" with { type: "json" };

const key = process.env.GEMINI_API_KEY?.trim();
const live = { skip: key ? false : "GEMINI_API_KEY is not set" };

const STAIRS_BUG = "class Solution:\n    def climbStairs(self, n: int) -> int:\n        ways = [1, 1] + [0] * n\n        for i in range(2, n):\n            ways[i] = ways[i - 1] + ways[i - 2]\n        return ways[n]\n";
const HELP_BODY = {
  lang: "en",
  problem: {
    title: "Climbing Stairs",
    statement: "You are climbing a staircase with n steps, and each move climbs either 1 or 2 steps. Return how many different ways you can reach the top.",
    signature: "def climbStairs(self, n: int) -> int:",
  },
  code: STAIRS_BUG,
  input: "n = 2",
  got: "0",
  expected: "2",
  error: null,
};
const post = (url, body) => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function timed(fn) {
  const t = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t) };
}

test(`the explain model (${MODEL}) answers (latency reported against the ${LLM_TIMEOUT_MS} ms budget)`, live, async () => {
  const complete = geminiComplete(new GoogleGenAI({ apiKey: key }));
  const { value, ms } = await timed(() => complete({ system: "Reply with one short friendly sentence.", user: "Say hello to a student." }, new AbortController().signal));
  const over = ms > LLM_TIMEOUT_MS ? ` (over the ${LLM_TIMEOUT_MS} ms budget: that step would get the built-in explanation)` : "";
  console.log(`  explain model: ${ms} ms${over}, finished=${value.finished}, ${value.text.length} chars`);
  assert.equal(value.finished, true);
  assert.ok(value.text.trim().length > 0);
  // Latency varies (0.9 s to 5.9 s measured). Over the budget is handled by
  // design (the template), so only a call that does not come back at all fails.
  assert.ok(ms < 2 * LLM_TIMEOUT_MS, `${ms} ms`);
});

test(`the help model (${HELP_MODEL}) answers within ${HELP_TIMEOUT_MS} ms`, live, async () => {
  const complete = geminiComplete(new GoogleGenAI({ apiKey: key }), HELP_TIMEOUT_MS, buildHelpRequest);
  const { value, ms } = await timed(() => complete({ system: "Reply with one short sentence.", user: "What is a loop?" }, new AbortController().signal));
  console.log(`  help model: ${ms} ms, finished=${value.finished}, ${value.text.length} chars`);
  assert.equal(value.finished, true);
  assert.ok(value.text.trim().length > 0);
  assert.ok(ms < HELP_TIMEOUT_MS, `${ms} ms`); // first live run: 165,796 ms, so this was missing
});

test("/api/explain gives tutor text for a real loop step", live, async () => {
  const h = createHandler({ getApiKey: () => key });
  const body = { prev: loop.steps[4], curr: loop.steps[5], lang: "en", codeSlice: "numbers = [3, 1, 2]\ntotal = 0\nfor n in numbers:\n    total += n", codeHash: loop.codeHash, stepIndex: 5 };
  const { value: res, ms } = await timed(() => h(post("http://localhost/api/explain", body)));
  const data = await res.json();
  console.log(`  /api/explain: ${ms} ms, source=${data.source}: ${data.text}`);
  assert.equal(res.status, 200);
  assert.equal(data.source, "llm", "the reply was rejected or the call failed, so the template was used");
});

test("/api/help gives tutor text at all three levels for a real off-by-one bug", live, async () => {
  const reasons = [];
  const h = createHelpHandler({ getApiKey: () => key, onReject: (r) => reasons.push(r) });
  for (const level of [1, 2, 3]) {
    reasons.length = 0;
    const { value: res, ms } = await timed(() => h(post("http://localhost/api/help", { ...HELP_BODY, level })));
    const data = await res.json();
    const why = reasons.length ? ` (rejected: ${reasons.join(", ")})` : "";
    console.log(`  /api/help level ${level}: ${ms} ms, source=${data.source}${why}:\n    ${data.text.replace(/\n/g, "\n    ")}`);
    assert.equal(res.status, 200);
    assert.equal(data.source, "llm", `level ${level}: the reply was rejected or the call failed`);
    if (level < 3) assert.doesNotMatch(data.text, /```|def /, `level ${level} must not show code`);
  }
});
