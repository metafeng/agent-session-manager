import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function localDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDailyTokens(target, timestamp, tokens) {
  const date = localDayKey(timestamp);
  if (!date || !Number.isFinite(tokens) || tokens <= 0) return;
  target[date] = (target[date] || 0) + tokens;
}

export function claudeUsageTokens(usage) {
  return Number(usage?.input_tokens || 0) +
    Number(usage?.output_tokens || 0) +
    Number(usage?.cache_read_input_tokens || 0) +
    Number(usage?.cache_creation_input_tokens || 0);
}

export function isClaudeUserPrompt(event) {
  if (event?.type !== "user" || event.isMeta || event.isSidechain) return false;
  const content = event.message?.content ?? event.content;
  if (typeof content !== "string") return false;
  const text = content.trim();
  if (!text) return false;
  return ![
    "# AGENTS",
    "<environment_context>",
    "<plugins_instructions>",
    "## Memory",
    "<command-name>",
    "<command-message>",
    "<command-args>",
    "<local-command-stdout>",
    "<local-command-caveat>",
    "Caveat: The messages below"
  ].some((prefix) => text.startsWith(prefix));
}

export function summarizeCodexMetricRecords(records) {
  const ordered = [...records].sort((a, b) => {
    const pathOrder = String(a.path).localeCompare(String(b.path));
    return pathOrder || Number(a.line || 0) - Number(b.line || 0);
  });
  const previousTotals = new Map();
  const sessionTotals = new Map();
  const tokenByDay = {};
  let longestTaskSeconds = 0;
  let completedTasks = 0;

  for (const record of ordered) {
    const event = record.event || {};
    const payload = event.payload || {};

    if (event.type === "event_msg" && payload.type === "token_count") {
      const current = Number(payload.info?.total_token_usage?.total_tokens || 0);
      if (!Number.isFinite(current) || current < 0) continue;
      const previous = previousTotals.get(record.path) || 0;
      const delta = current >= previous ? current - previous : current;
      previousTotals.set(record.path, current);
      sessionTotals.set(record.path, (sessionTotals.get(record.path) || 0) + delta);
      addDailyTokens(tokenByDay, event.timestamp, delta);
    }

    if (event.type === "event_msg" && payload.type === "task_complete") {
      const durationMs = Number(payload.duration_ms || 0);
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        longestTaskSeconds = Math.max(longestTaskSeconds, durationMs / 1000);
      }
      completedTasks += 1;
    }
  }

  return {
    token_by_day: tokenByDay,
    observed_tokens: [...sessionTotals.values()].reduce((sum, value) => sum + value, 0),
    session_tokens: Object.fromEntries(sessionTotals),
    longest_task_seconds: Math.round(longestTaskSeconds),
    completed_tasks: completedTasks
  };
}

function codexRecordsFromRipgrep(stdout) {
  const records = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.type !== "match") continue;
    const path = message.data?.path?.text;
    const rawLine = message.data?.lines?.text;
    if (!path || !rawLine) continue;
    try {
      records.push({
        path,
        line: message.data?.line_number || 0,
        event: JSON.parse(rawLine)
      });
    } catch {
      // Ignore malformed JSONL records.
    }
  }
  return records;
}

async function scanCodexWithNode(filePaths) {
  const records = [];
  for (const path of filePaths) {
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    let lineNumber = 0;
    for await (const line of rl) {
      lineNumber += 1;
      if (
        !line.includes('"type":"token_count"') &&
        !line.includes('"type":"task_complete"')
      ) {
        continue;
      }
      try {
        records.push({ path, line: lineNumber, event: JSON.parse(line) });
      } catch {
        // Ignore malformed JSONL records.
      }
    }
  }
  return summarizeCodexMetricRecords(records);
}

export async function scanCodexUsageMetrics(filePaths) {
  const paths = [...new Set((filePaths || []).filter(Boolean))];
  if (!paths.length) return summarizeCodexMetricRecords([]);

  try {
    const { stdout } = await execFileAsync(
      "rg",
      [
        "--json",
        "--no-messages",
        "--glob",
        "*.jsonl",
        "--regexp",
        String.raw`"type":"event_msg".*"type":"(?:token_count|task_complete)"`,
        ...paths
      ],
      { maxBuffer: 192 * 1024 * 1024 }
    );
    return summarizeCodexMetricRecords(codexRecordsFromRipgrep(stdout));
  } catch (error) {
    if (error?.code === 1) return summarizeCodexMetricRecords([]);
    if (error?.code !== "ENOENT") throw error;
    return scanCodexWithNode(paths);
  }
}

export async function scanClaudeUsageMetrics(filePaths) {
  const tokenByDay = {};
  const sessionTokens = {};
  const modelsBySession = new Map();
  const modelEventCounts = {};
  let longestTaskSeconds = 0;
  let completedTasks = 0;

  for (const path of [...new Set((filePaths || []).filter(Boolean))]) {
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    let activeTurnStartedAt = null;

    for await (const line of rl) {
      if (
        !line.includes('"type":"user"') &&
        !line.includes('"type":"assistant"') &&
        !line.includes('"subtype":"turn_duration"')
      ) {
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (isClaudeUserPrompt(event)) {
        const startedAt = new Date(event.timestamp).getTime();
        activeTurnStartedAt = Number.isFinite(startedAt) ? startedAt : null;
      }

      if (event.type === "assistant" && !event.isSidechain) {
        const tokens = claudeUsageTokens(event.message?.usage);
        if (tokens > 0) {
          sessionTokens[path] = (sessionTokens[path] || 0) + tokens;
          addDailyTokens(tokenByDay, event.timestamp, tokens);
        }
        const model = event.message?.model;
        if (model && !String(model).startsWith("<")) {
          if (!modelsBySession.has(path)) modelsBySession.set(path, new Set());
          modelsBySession.get(path).add(model);
          modelEventCounts[model] = (modelEventCounts[model] || 0) + 1;
        }

        if (activeTurnStartedAt && ["end_turn", "stop_sequence"].includes(event.message?.stop_reason)) {
          const completedAt = new Date(event.timestamp).getTime();
          if (Number.isFinite(completedAt) && completedAt >= activeTurnStartedAt) {
            longestTaskSeconds = Math.max(
              longestTaskSeconds,
              (completedAt - activeTurnStartedAt) / 1000
            );
            completedTasks += 1;
          }
          activeTurnStartedAt = null;
        }
      }

      if (event.type === "system" && event.subtype === "turn_duration" && !event.isSidechain) {
        const durationMs = Number(event.durationMs || 0);
        if (Number.isFinite(durationMs) && durationMs >= 0) {
          longestTaskSeconds = Math.max(longestTaskSeconds, durationMs / 1000);
        }
      }
    }
  }

  const modelSessionCounts = {};
  for (const models of modelsBySession.values()) {
    for (const model of models) {
      modelSessionCounts[model] = (modelSessionCounts[model] || 0) + 1;
    }
  }

  const values = Object.values(sessionTokens);
  return {
    token_by_day: tokenByDay,
    total_tokens: values.reduce((sum, value) => sum + value, 0),
    peak_session_tokens: values.length ? Math.max(...values) : 0,
    session_tokens: sessionTokens,
    longest_task_seconds: Math.round(longestTaskSeconds),
    completed_tasks: completedTasks,
    model_session_counts: modelSessionCounts,
    model_event_counts: modelEventCounts
  };
}
