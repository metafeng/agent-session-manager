import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function directoryEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readMetadataFiles(profilePath, entries) {
  const metadataByCliSession = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("local_") || !entry.name.endsWith(".json")) continue;
    try {
      const metadata = JSON.parse(await readFile(join(profilePath, entry.name), "utf8"));
      if (metadata?.cliSessionId) metadataByCliSession.set(metadata.cliSessionId, metadata);
    } catch {
      // Ignore incomplete metadata while Claude is writing it.
    }
  }

  return metadataByCliSession;
}

export async function discoverClaudeDesktopSessions(localAgentRoots) {
  const sessions = [];
  const seenPaths = new Set();

  for (const root of [...new Set((localAgentRoots || []).filter(Boolean))]) {
    for (const accountEntry of await directoryEntries(root)) {
      if (!accountEntry.isDirectory() || accountEntry.name === "skills-plugin") continue;
      const accountPath = join(root, accountEntry.name);

      for (const profileEntry of await directoryEntries(accountPath)) {
        if (!profileEntry.isDirectory()) continue;
        const profilePath = join(accountPath, profileEntry.name);
        const profileEntries = await directoryEntries(profilePath);
        const metadataByCliSession = await readMetadataFiles(profilePath, profileEntries);

        for (const workspaceEntry of profileEntries) {
          if (!workspaceEntry.isDirectory()) continue;
          const transcriptDir = join(
            profilePath,
            workspaceEntry.name,
            ".claude",
            "projects",
            "session"
          );

          for (const transcriptEntry of await directoryEntries(transcriptDir)) {
            if (!transcriptEntry.isFile() || !transcriptEntry.name.endsWith(".jsonl")) continue;
            const filePath = join(transcriptDir, transcriptEntry.name);
            if (seenPaths.has(filePath)) continue;
            seenPaths.add(filePath);
            const cliSessionId = transcriptEntry.name.slice(0, -".jsonl".length);
            sessions.push({
              filePath,
              metadata: metadataByCliSession.get(cliSessionId) || null
            });
          }
        }
      }
    }
  }

  return sessions;
}

export function applyClaudeDesktopMetadata(session, metadata) {
  const toIso = (value, fallback) => {
    const date = new Date(value ?? fallback ?? 0);
    return Number.isNaN(date.getTime()) ? fallback || null : date.toISOString();
  };
  const selectedFolders = Array.isArray(metadata?.userSelectedFolders)
    ? metadata.userSelectedFolders.filter(Boolean)
    : [];
  const model = String(metadata?.model || session.model || "").replace(/\[[^\]]+\]$/, "") || null;

  return {
    ...session,
    id: metadata?.cliSessionId || session.id,
    desktop_session_id: metadata?.sessionId || null,
    title: metadata?.title || session.title,
    preview: metadata?.initialMessage || session.preview,
    cwd: selectedFolders[0] || session.cwd,
    entrypoint: "claude-desktop",
    model,
    created_at: toIso(metadata?.createdAt, session.created_at),
    updated_at: toIso(metadata?.lastActivityAt, session.updated_at),
    archived: Boolean(metadata?.isArchived) || Boolean(session.archived)
  };
}
