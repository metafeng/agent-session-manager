import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContentQuery, sessionIdFromRolloutPath } from "./content-search.js";

test("normalizes and bounds content queries", () => {
  assert.equal(normalizeContentQuery("  精确\n 搜索  "), "精确 搜索");
  assert.equal(normalizeContentQuery("x".repeat(180)).length, 120);
});

test("extracts Codex and Claude session ids from rollout paths", () => {
  assert.equal(
    sessionIdFromRolloutPath("/tmp/rollout-2026-06-18T09-10-06-019ed847-3640-71c1-8922-6b5740dfbc7f.jsonl"),
    "019ed847-3640-71c1-8922-6b5740dfbc7f"
  );
  assert.equal(
    sessionIdFromRolloutPath("/tmp/7d04af1a-b1cc-4e7c-9daa-80d25138f151.jsonl"),
    "7d04af1a-b1cc-4e7c-9daa-80d25138f151"
  );
  assert.equal(sessionIdFromRolloutPath("/tmp/not-a-session.jsonl"), null);
});
