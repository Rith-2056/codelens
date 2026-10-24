// Run after `npm run build` (scripts/check-all.sh does this). Keeps the app
// light for shared school Chromebooks: the main JS file stays under Vite's
// 500 kB chunk warning, and the bundled lesson fixtures stay small.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const assets = join(root, "frontend", "dist", "assets");
const fixtures = join(root, "shared", "fixtures");

test("the main JS file is under 500 kB", () => {
  const main = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f));
  assert.equal(main.length, 1, `expected one main chunk, found ${main.join(", ")}`);
  const size = statSync(join(assets, main[0])).size;
  assert.ok(size < 500_000, `main JS is ${size} bytes`);
});

test("all lesson fixtures together are under 200 kB", () => {
  const total = readdirSync(fixtures)
    .filter((f) => f.endsWith(".json"))
    .reduce((sum, f) => sum + readFileSync(join(fixtures, f)).length, 0);
  assert.ok(total < 200_000, `fixtures total ${total} bytes`);
});
