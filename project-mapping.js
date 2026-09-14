import { normalize, sep } from "node:path";

function cleanPath(value) {
  const path = normalize(String(value || "").trim());
  return path === "." ? "" : path.replace(/\/+$/, "");
}

export function groupProjectRows(rows) {
  const projects = new Map();
  for (const row of rows || []) {
    if (!row?.id) continue;
    const project = projects.get(row.id) || {
      id: row.id,
      name: row.name || "未命名项目",
      position: Number(row.position || 0),
      roots: []
    };
    const root = cleanPath(row.root_path);
    if (root && !project.roots.includes(root)) project.roots.push(root);
    projects.set(row.id, project);
  }
  return [...projects.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function resolveSessionProject(projects, explicitProjectId, cwd) {
  const list = projects || [];
  if (explicitProjectId) {
    const explicit = list.find((project) => project.id === explicitProjectId);
    if (explicit) return explicit;
  }

  const sessionPath = cleanPath(cwd);
  if (!sessionPath) return null;

  let best = null;
  let bestLength = -1;
  for (const project of list) {
    for (const rootValue of project.roots || []) {
      const root = cleanPath(rootValue);
      if (!root) continue;
      const matches = sessionPath === root || sessionPath.startsWith(`${root}${sep}`);
      if (matches && root.length > bestLength) {
        best = project;
        bestLength = root.length;
      }
    }
  }
  return best;
}
