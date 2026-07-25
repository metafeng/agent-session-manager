import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const READ_OPERATION =
  /\b(?:cat|sed|head|tail|less|bat|awk|read|readfile|read_text|readtextfile|get-content)\b|\.read_text\s*\(|\.readtext\s*\(|\brg\s+(?:-[^\s]+\s+)*-n\b/i;

function cleanSkillName(value) {
  const name = String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\([\\."' ])/g, "$1");
  if (!name || name === "." || name === ".." || name.includes("$")) return null;
  return name;
}

function parseArguments(rawArguments) {
  if (rawArguments && typeof rawArguments === "object") return rawArguments;
  try {
    return JSON.parse(String(rawArguments || "{}"));
  } catch {
    return { raw: String(rawArguments || "") };
  }
}

function argumentText(rawArguments) {
  const args = parseArguments(rawArguments);
  return {
    args,
    text: typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments || {})
  };
}

function skillNamesFromPaths(text) {
  const names = new Set();
  const value = String(text || "");

  for (const match of value.matchAll(/(?:^|[\\/])([^\\/'"\s]+)[\\/]SKILL\.md\b/g)) {
    const name = cleanSkillName(match[1]);
    if (name) names.add(name);
  }

  if (/SKILL\.md\b/.test(value)) {
    for (const match of value.matchAll(
      /(?:^|[\s;])(?:source_?skill|skill_?root|skill_?dir|skill_?path)\s*=\s*["']([^"']+)["']/gi
    )) {
      const segments = match[1].replace(/[\\/]+$/, "").split(/[\\/]/);
      const name = cleanSkillName(segments.at(-1));
      if (name) names.add(name);
    }
  }

  return [...names];
}

export function extractInvokedSkills(toolName, rawArguments) {
  const normalizedToolName = String(toolName || "").toLowerCase();
  const { args, text } = argumentText(rawArguments);

  if (normalizedToolName === "skill" || normalizedToolName.endsWith("__skill")) {
    const name = cleanSkillName(args.skill || args.name);
    return name ? [name] : [];
  }

  const commandText = [
    args.cmd,
    args.command,
    args.code,
    args.path,
    args.file_path,
    args.raw,
    text
  ]
    .filter(Boolean)
    .join("\n");

  if (!/SKILL\.md\b/.test(commandText)) return [];
  if (!READ_OPERATION.test(`${toolName}\n${commandText}`)) return [];
  return skillNamesFromPaths(commandText);
}

function codexInvocationRecords(event, filePath) {
  const payload = event?.payload || {};
  if (event?.type !== "response_item" || payload.type !== "function_call") return [];

  const skills = extractInvokedSkills(payload.name || payload.recipient_name, payload.arguments);
  const turnId =
    payload.internal_chat_message_metadata_passthrough?.turn_id ||
    payload.metadata?.turn_id ||
    "session";
  const isStructuredSkill = String(payload.name || "").toLowerCase() === "skill";

  return skills.map((skill) => ({
    skill,
    key: isStructuredSkill
      ? `${filePath}:call:${payload.call_id || payload.id || event.timestamp}:${skill}`
      : `${filePath}:turn:${turnId}:${skill}`
  }));
}

function claudeInvocationRecords(event, filePath) {
  if (event?.type !== "assistant" || event.isSidechain) return [];
  const content = event.message?.content;
  if (!Array.isArray(content)) return [];

  const records = [];
  for (const part of content) {
    if (part?.type !== "tool_use") continue;
    const skills = extractInvokedSkills(part.name, part.input);
    for (const skill of skills) {
      const isStructuredSkill = String(part.name || "").toLowerCase() === "skill";
      records.push({
        skill,
        key: isStructuredSkill
          ? `${filePath}:call:${part.id || event.uuid || event.timestamp}:${skill}`
          : `${filePath}:turn:${event.parentUuid || event.uuid || "session"}:${skill}`
      });
    }
  }
  return records;
}

function recordsFromEvent(event, filePath, flavor) {
  return flavor === "claude"
    ? claudeInvocationRecords(event, filePath)
    : codexInvocationRecords(event, filePath);
}

function summarizeRecords(records) {
  const seen = new Set();
  const counts = {};

  for (const record of records) {
    if (!record?.skill || seen.has(record.key)) continue;
    seen.add(record.key);
    counts[record.skill] = (counts[record.skill] || 0) + 1;
  }

  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0)
  };
}

async function scanWithRipgrep(filePaths, flavor) {
  const pattern = flavor === "claude"
    ? String.raw`"name":"Skill"|SKILL\.md`
    : String.raw`"type":"function_call".*SKILL\.md|"type":"function_call".*"name":"Skill"`;
  const { stdout } = await execFileAsync(
    "rg",
    ["--json", "--no-messages", "--glob", "*.jsonl", "--regexp", pattern, ...filePaths],
    { maxBuffer: 128 * 1024 * 1024 }
  );

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

    const filePath = message.data?.path?.text;
    const rawLine = message.data?.lines?.text;
    if (!filePath || !rawLine) continue;

    try {
      records.push(...recordsFromEvent(JSON.parse(rawLine), filePath, flavor));
    } catch {
      // Ignore malformed JSONL records.
    }
  }
  return summarizeRecords(records);
}

async function scanWithNode(filePaths, flavor) {
  const records = [];
  for (const filePath of filePaths) {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (flavor === "claude") {
        if (!line.includes('"name":"Skill"') && !line.includes("SKILL.md")) continue;
      } else if (
        !line.includes('"type":"function_call"') ||
        (!line.includes("SKILL.md") && !line.includes('"name":"Skill"'))
      ) {
        continue;
      }
      try {
        records.push(...recordsFromEvent(JSON.parse(line), filePath, flavor));
      } catch {
        // Ignore malformed JSONL records.
      }
    }
  }
  return summarizeRecords(records);
}

export async function scanSkillUsage(filePaths, flavor = "codex") {
  const paths = [...new Set((filePaths || []).filter(Boolean))];
  if (!paths.length) return { counts: {}, total: 0 };

  try {
    return await scanWithRipgrep(paths, flavor);
  } catch (error) {
    if (error?.code === 1) return { counts: {}, total: 0 };
    if (error?.code !== "ENOENT") throw error;
    return scanWithNode(paths, flavor);
  }
}
