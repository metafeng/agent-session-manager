import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sessionIdPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.jsonl)?$/i;
let resolvedRgBinary = null;

export function normalizeContentQuery(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function sessionIdFromRolloutPath(path) {
  return String(path || "").match(sessionIdPattern)?.[1] || null;
}

async function existingRoots(roots) {
  const checked = await Promise.all(
    roots.filter(Boolean).map(async (root) => {
      try {
        await access(root);
        return root;
      } catch {
        return null;
      }
    })
  );
  return checked.filter(Boolean);
}

async function resolveRgBinary() {
  if (resolvedRgBinary) return resolvedRgBinary;
  const pathCandidates = String(process.env.PATH || "")
    .split(":")
    .filter(Boolean)
    .map((directory) => join(directory, "rg"));
  const candidates = [
    process.env.RG_PATH,
    ...pathCandidates,
    "/opt/homebrew/bin/rg",
    "/usr/local/bin/rg",
    "/Applications/Codex.app/Contents/Resources/rg",
    "/Applications/ChatGPT.app/Contents/Resources/rg"
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate);
      resolvedRgBinary = candidate;
      return resolvedRgBinary;
    } catch {
      // Continue through known CLI and desktop-app locations.
    }
  }
  throw new Error("未找到 rg（ripgrep），无法检索完整对话内容");
}

export async function searchSessionContent(query, roots) {
  const normalizedQuery = normalizeContentQuery(query);
  if (normalizedQuery.length < 2) return [];

  const availableRoots = await existingRoots(roots);
  if (!availableRoots.length) return [];
  const rgBinary = await resolveRgBinary();

  try {
    const { stdout } = await execFileAsync(
      rgBinary,
      [
        "--files-with-matches",
        "--fixed-strings",
        "--ignore-case",
        "--max-count",
        "1",
        "--no-messages",
        "--glob",
        "*.jsonl",
        "--",
        normalizedQuery,
        ...availableRoots
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }
    );

    const ids = stdout
      .split("\n")
      .map(sessionIdFromRolloutPath)
      .filter(Boolean);
    return [...new Set(ids)];
  } catch (error) {
    if (error?.code === 1) return [];
    throw error;
  }
}
