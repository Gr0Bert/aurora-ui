import assert from "node:assert/strict";
import test from "node:test";
import { canRetry, canStop, mergeRun, parseJSON, parseRoute, preview, routeFor } from "../lib.mjs";

test("hash routes round-trip", () => {
  const hash = routeFor("thr one", "run/two");
  assert.deepEqual(parseRoute(hash), { threadId: "thr one", runId: "run/two" });
});

test("run updates merge and clear active run", () => {
  const thread = { active_run_id: "run_1", runs: [{ id: "run_1", status: "running" }] };
  const merged = mergeRun(thread, { id: "run_1", status: "completed", answer: "done" });
  assert.equal(merged.active_run_id, "");
  assert.equal(merged.runs[0].answer, "done");
});

test("run controls match lifecycle", () => {
  assert.equal(canStop("running"), true);
  assert.equal(canStop("completed"), false);
  assert.equal(canRetry("failed"), true);
  assert.equal(canRetry("running"), false);
});

test("preview truncates Unicode by characters", () => {
  assert.deepEqual(preview("界界界", 2), { text: "界界[…]", truncated: true });
});

test("parseJSON reports field context", () => {
  assert.deepEqual(parseJSON("[]", "manifest"), []);
  assert.throws(() => parseJSON("{", "manifest"), /manifest/);
});
