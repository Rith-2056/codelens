// The dev-only Vite plugin that serves /api/explain and /api/help from the
// same handlers a deploy uses. Run: node --test frontend/dev/apiDevServer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { apiDevServer, matchRoute, toWebRequest, sendWebResponse } from "./apiDevServer.ts";

test("only the two API routes are handled", () => {
  assert.equal(matchRoute("/api/explain"), "../api/explain.ts");
  assert.equal(matchRoute("/api/help?x=1"), "../api/help.ts");
  assert.equal(matchRoute("/api/other"), null);
  assert.equal(matchRoute("/src/main.tsx"), null);
  assert.equal(matchRoute(undefined), null);
});

test("a Node request becomes a Web Request with method, headers and body", async () => {
  const req = { method: "POST", url: "/api/help", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" } };
  const web = toWebRequest(req, new TextEncoder().encode('{"a":1}'));
  assert.equal(web.method, "POST");
  assert.equal(new URL(web.url).pathname, "/api/help");
  assert.equal(web.headers.get("x-forwarded-for"), "1.2.3.4");
  assert.deepEqual(await web.json(), { a: 1 });
  const get = toWebRequest({ method: "GET", url: "/api/help", headers: {} }, new Uint8Array());
  assert.equal(get.method, "GET");
});

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: "", ended: false };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (chunk) => {
    if (chunk) res.body += Buffer.from(chunk).toString("utf8");
    res.ended = true;
  };
  return res;
}

test("a Web Response is written back to the Node response", async () => {
  const res = fakeRes();
  await sendWebResponse(res, new Response(JSON.stringify({ ok: true }), { status: 429, headers: { "content-type": "application/json" } }));
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["content-type"], "application/json");
  assert.equal(res.body, '{"ok":true}');
  assert.equal(res.ended, true);
});

test("the plugin runs only in dev, and routes API calls to the handler module", async () => {
  const plugin = apiDevServer();
  assert.equal(plugin.apply, "serve"); // never part of a production build
  let middleware;
  const loaded = [];
  const server = {
    config: { root: "/repo/frontend" },
    middlewares: { use: (fn) => (middleware = fn) },
    ssrLoadModule: async (file) => {
      loaded.push(file);
      return { POST: async (request) => new Response(JSON.stringify({ echo: await request.json() }), { status: 200 }) };
    },
  };
  plugin.configureServer(server);

  const req = Object.assign(Readable.from([Buffer.from('{"level":1}')]), { method: "POST", url: "/api/help", headers: { "content-type": "application/json" } });
  const res = fakeRes();
  let nextCalled = false;
  await middleware(req, res, () => (nextCalled = true));
  assert.equal(nextCalled, false);
  assert.deepEqual(loaded, ["/repo/api/help.ts"]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { echo: { level: 1 } });

  const other = Object.assign(Readable.from([]), { method: "GET", url: "/src/main.tsx", headers: {} });
  await middleware(other, fakeRes(), () => (nextCalled = true));
  assert.equal(nextCalled, true);
});

test("a handler that throws becomes a 500 without details", async () => {
  const plugin = apiDevServer();
  let middleware;
  plugin.configureServer({
    config: { root: "/repo/frontend" },
    middlewares: { use: (fn) => (middleware = fn) },
    ssrLoadModule: async () => ({
      POST: async () => {
        throw new Error("secret stack");
      },
    }),
  });
  const res = fakeRes();
  await middleware(Object.assign(Readable.from([]), { method: "POST", url: "/api/explain", headers: {} }), res, () => {});
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body, /secret/);
});
