import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import {
  normalizeContentQuery,
  searchSessionContent,
  sessionIdFromRolloutPath
} from "./content-search.js";

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

test("searches JSONL files inside hidden Claude Desktop directories", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "hidden-claude-search-"));
  const transcriptDir = join(root, "workspace", ".claude", "projects", "session");
  const sessionId = "74b4388c-da93-4aa4-811f-151f8f6f5e21";
  await mkdir(transcriptDir, { recursive: true });
  await writeFile(join(transcriptDir, `${sessionId}.jsonl`), '{"message":"客户端关键词"}\n');

  try {
    assert.deepEqual(await searchSessionContent("客户端关键词", [root]), [sessionId]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
