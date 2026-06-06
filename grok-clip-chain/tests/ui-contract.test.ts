import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("login click surfaces failures instead of swallowing rejected startLogin", async () => {
  const source = await readFile("ui/src/main.tsx", "utf-8");
  assert.match(source, /setLoginBusy\(true\)/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /setMessage\(error instanceof Error \? error\.message/);
  assert.match(source, /disabled=\{loginBusy\}/);
});
