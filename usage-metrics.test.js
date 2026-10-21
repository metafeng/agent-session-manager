import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import {
  claudeAssistantResponseKey,
  claudeUsageTokens,
  isClaudeUserPrompt,
  localDayKey,
  scanClaudeUsageMetrics,
  summarizeCodexMetricRecords
} from "./usage-metrics.js";

test("uses local calendar dates for activity aggregation", () => {
  const date = new Date(2026, 6, 25, 8, 30, 0);
  assert.equal(localDayKey(date.toISOString()), "2026-07-25");
});

test("derives Codex daily usage from cumulative token deltas", () => {
  const summary = summarizeCodexMetricRecords([
    {
      path: "a.jsonl",
      line: 1,
      event: {
        type: "event_msg",
        timestamp: "2026-07-24T10:00:00.000Z",
        payload: { type: "token_count", info: { total_token_usage: { total_tokens: 100 } } }
      }
    },
    {
      path: "a.jsonl",
      line: 2,
      event: {
        type: "event_msg",
        timestamp: "2026-07-25T10:00:00.000Z",
        payload: { type: "token_count", info: { total_token_usage: { total_tokens: 160 } } }
      }
    },
    {
      path: "a.jsonl",
      line: 3,
      event: {
        type: "event_msg",
        timestamp: "2026-07-25T10:01:00.000Z",
        payload: { type: "task_complete", duration_ms: 5_500 }
      }
    }
  ]);

  assert.equal(summary.observed_tokens, 160);
  assert.equal(summary.token_by_day["2026-07-24"], 100);
  assert.equal(summary.token_by_day["2026-07-25"], 60);
  assert.equal(summary.longest_task_seconds, 6);
  assert.equal(summary.completed_tasks, 1);
});

test("handles a cumulative counter reset without losing later usage", () => {
  const summary = summarizeCodexMetricRecords([
    {
      path: "a.jsonl",
      line: 1,
      event: {
        type: "event_msg",
        timestamp: "2026-07-24T10:00:00.000Z",
        payload: { type: "token_count", info: { total_token_usage: { total_tokens: 160 } } }
      }
    },
    {
      path: "a.jsonl",
      line: 2,
      event: {
        type: "event_msg",
        timestamp: "2026-07-25T10:00:00.000Z",
        payload: { type: "token_count", info: { total_token_usage: { total_tokens: 20 } } }
      }
    }
  ]);
  assert.equal(summary.observed_tokens, 180);
});

test("sums Claude input, output and cache token fields", () => {
  assert.equal(
    claudeUsageTokens({
      input_tokens: 10,
      output_tokens: 3,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 5
    }),
    38
  );
});

test("deduplicates streamed Claude assistant rows by message id", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "claude-usage-"));
  const file = join(root, "session.jsonl");
  const duplicate = {
    type: "assistant",
    timestamp: "2026-10-20T10:00:00.000Z",
    message: {
      id: "msg_same_response",
      model: "claude-opus-5-5",
      usage: {
        input_tokens: 10,
        output_tokens: 3,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 5
      }
    }
  };
  const unique = {
    type: "assistant",
    timestamp: "2026-10-20T10:01:00.000Z",
    message: {
      id: "msg_second_response",
      model: "claude-opus-5-5",
      usage: { input_tokens: 7, output_tokens: 2 }
    }
  };
  await writeFile(file, [duplicate, duplicate, unique].map((event) => JSON.stringify(event)).join("\n"));

  try {
    const summary = await scanClaudeUsageMetrics([file]);
    assert.equal(summary.total_tokens, 47);
    assert.equal(summary.session_tokens[file], 47);
    assert.equal(summary.model_event_counts["claude-opus-5-5"], 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses the event uuid when a Claude message id is unavailable", () => {
  assert.equal(
    claudeAssistantResponseKey({ uuid: "event-id", message: {} }),
    "event:event-id"
  );
});

test("distinguishes real Claude prompts from tool results and injected context", () => {
  assert.equal(
    isClaudeUserPrompt({ type: "user", message: { content: "帮我检查这个项目" } }),
    true
  );
  assert.equal(
    isClaudeUserPrompt({ type: "user", message: { content: [{ type: "tool_result" }] } }),
    false
  );
  assert.equal(
    isClaudeUserPrompt({ type: "user", message: { content: "<environment_context>..." } }),
    false
  );
});
