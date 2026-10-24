// Three levels of help for a wrong solution: the offline templates and the
// browser client. Run: node --test frontend/src/explain/help.test.mjs
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { helpTemplate, fetchHelp, HELP_ENDPOINT, allowedHelpNumbers } from "./help.ts";

const wrong = {
  level: 1,
  lang: "en",
  problem: { title: "Two Sum", statement: "Return the indices of the two numbers that add up to target.", signature: "def twoSum(self, nums, target):" },
  code: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 0]\n",
  input: "nums = [0, 0], target = 0",
  got: "[0, 0]",
  expected: "[0, 1]",
  error: null,
};
const crashed = { ...wrong, got: null, error: { type: "IndexError", message: "list index out of range" } };

test("level 1 is a gentle hint that names the input and the right answer, without code", () => {
  const t = helpTemplate({ ...wrong, level: 1 });
  assert.match(t, /nums = \[0, 0\], target = 0/);
  assert.match(t, /\[0, 1\]/);
  assert.doesNotMatch(t, /def |```|return \[/);
});

test("level 2 explains what went wrong on that input", () => {
  const t = helpTemplate({ ...wrong, level: 2 });
  assert.match(t, /returned \[0, 0\]/);
  assert.match(t, /\[0, 1\]/);
  assert.match(t, /step through/i);
});

test("level 3 offline says the fix needs the AI tutor and points to the side-by-side runs", () => {
  const t = helpTemplate({ ...wrong, level: 3 });
  assert.match(t, /offline/i);
  assert.match(t, /correct solution/i);
});

test("crashes get their own wording", () => {
  assert.match(helpTemplate({ ...crashed, level: 1 }), /IndexError/);
  assert.match(helpTemplate({ ...crashed, level: 2 }), /IndexError: list index out of range/);
});

test("Spanish templates for every level", () => {
  for (const level of [1, 2, 3]) {
    const t = helpTemplate({ ...wrong, level, lang: "es" });
    assert.match(t, /[áéíóúñ¿]/, `level ${level}`);
    assert.doesNotMatch(t, /\bthe\b|\byour\b/i, `level ${level} has English`);
  }
});

test("allowed numbers: from the code, input, answers, error and line numbers", () => {
  const allowed = allowedHelpNumbers(wrong);
  for (const n of ["0", "1", "2", "3"]) assert.ok(allowed.has(n), n); // 1-3 are line numbers
  assert.ok(!allowed.has("7"));
});

// ---- client --------------------------------------------------------------

let calls;
beforeEach(() => {
  calls = [];
});
afterEach(() => {
  delete globalThis.fetch;
});

test("fetchHelp posts the request and returns the tutor's text", async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ text: "Think about using the same position twice.", source: "llm", level: 1 }), { status: 200 });
  };
  const res = await fetchHelp(wrong);
  assert.deepEqual(res, { text: "Think about using the same position twice.", source: "llm", level: 1 });
  assert.equal(calls[0].url, HELP_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), wrong);
});

test("fetchHelp never rejects: network errors, bad status and bad JSON give the template", async () => {
  for (const fake of [
    async () => {
      throw new Error("offline");
    },
    async () => new Response("nope", { status: 500 }),
    async () => new Response("not json", { status: 200 }),
    async () => new Response(JSON.stringify({ text: 42 }), { status: 200 }),
  ]) {
    globalThis.fetch = fake;
    const res = await fetchHelp({ ...wrong, level: 2 });
    assert.deepEqual(res, { text: helpTemplate({ ...wrong, level: 2 }), source: "template", level: 2 });
  }
});
