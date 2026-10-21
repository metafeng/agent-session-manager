import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import {
  applyClaudeDesktopMetadata,
  discoverClaudeDesktopSessions
} from "./claude-desktop-sources.js";

test("discovers Claude Desktop main transcripts and matches metadata", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "claude-desktop-source-"));
  const profile = join(root, "account", "profile");
  const transcriptDir = join(profile, "workspace", ".claude", "projects", "session");
  await mkdir(transcriptDir, { recursive: true });
  await mkdir(join(transcriptDir, "session-id", "subagents"), { recursive: true });
  await writeFile(join(transcriptDir, "session-id.jsonl"), "{}\n");
  await writeFile(join(transcriptDir, "session-id", "subagents", "agent.jsonl"), "{}\n");
  await writeFile(join(profile, "local_workspace-record.json"), JSON.stringify({
    sessionId: "local-workspace-record",
    cliSessionId: "session-id",
    title: "客户端会话"
  }));

  try {
    const sessions = await discoverClaudeDesktopSessions([root]);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].metadata.title, "客户端会话");
    assert.match(sessions[0].filePath, /session-id\.jsonl$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses Claude Desktop metadata for title, dates, folder and model", () => {
  const result = applyClaudeDesktopMetadata({
    id: "cli-id",
    title: "临时标题",
    preview: "临时预览",
    cwd: "/private/var/empty",
    model: "claude-opus",
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T01:00:00.000Z",
    archived: false
  }, {
    sessionId: "local-id",
    cliSessionId: "cli-id",
    title: "真实标题",
    initialMessage: "真实需求",
    createdAt: 1792506731783,
    lastActivityAt: 1792513236727,
    isArchived: true,
    model: "claude-opus-5-5[1m]",
    userSelectedFolders: ["/Users/test/project"]
  });

  assert.equal(result.title, "真实标题");
  assert.equal(result.preview, "真实需求");
  assert.equal(result.cwd, "/Users/test/project");
  assert.equal(result.entrypoint, "claude-desktop");
  assert.equal(result.model, "claude-opus-5-5");
  assert.equal(result.archived, true);
  assert.equal(result.desktop_session_id, "local-id");
});
